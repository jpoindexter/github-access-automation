/**
 * Retry Queue Admin Page
 * Shows pending retries and dead letter queue
 */

import { db } from '@/lib/db';
import { getRetryQueueStats } from '@/lib/retry-queue';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function RetryQueuePage() {
  // Get stats
  const stats = await getRetryQueueStats();

  // Get pending retries
  const retryQueueResult = await db.query(
    `
    SELECT id, customer_id, attempt_number, max_attempts, last_error, next_retry_at, created_at
    FROM retry_queue
    WHERE status = 'pending'
    ORDER BY next_retry_at ASC
    LIMIT 50
  `
  );

  // Get DLQ items
  const dlqResult = await db.query(
    `
    SELECT id, customer_id, final_error, attempts_made, created_at, resolved_at
    FROM dead_letter_queue
    WHERE resolved_at IS NULL
    ORDER BY created_at DESC
    LIMIT 50
  `
  );

  const retryQueue = retryQueueResult.rows as Array<{
    id: string;
    customer_id: string;
    attempt_number: number;
    max_attempts: number;
    last_error: string;
    next_retry_at: Date;
    created_at: Date;
  }>;

  const dlqItems = dlqResult.rows as Array<{
    id: string;
    customer_id: string;
    final_error: string;
    attempts_made: number;
    created_at: Date;
    resolved_at: Date | null;
  }>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Retry Queue</h1>
        <Link href="/admin" className="text-sm text-gray-600 hover:text-gray-900">
          ← Back to Dashboard
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Pending" value={stats.pending} color="yellow" />
        <StatCard label="Processing" value={stats.processing} color="blue" />
        <StatCard label="Completed" value={stats.completed} color="green" />
        <StatCard label="Failed" value={stats.failed} color="red" />
        <StatCard label="Dead Letter Queue" value={stats.dlqCount} color="purple" />
      </div>

      {/* Pending Retries */}
      <div className="rounded-lg bg-white shadow">
        <div className="border-b px-6 py-4">
          <h2 className="text-xl font-semibold">Pending Retries</h2>
          <p className="text-sm text-gray-600">Items waiting for next retry attempt</p>
        </div>

        {retryQueue.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">No pending retries</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Attempts
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Last Error
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Next Retry
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {retryQueue.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 text-sm">
                      <Link
                        href={`/admin/customers/${item.customer_id}`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        {item.customer_id.slice(0, 8)}...
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {item.attempt_number + 1} / {item.max_attempts}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div className="max-w-md truncate" title={item.last_error}>
                        {item.last_error}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {getRelativeTime(item.next_retry_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dead Letter Queue */}
      <div className="rounded-lg bg-white shadow">
        <div className="border-b px-6 py-4">
          <h2 className="text-xl font-semibold">Dead Letter Queue</h2>
          <p className="text-sm text-gray-600">
            Items that exceeded max retries or encountered permanent errors
          </p>
        </div>

        {dlqItems.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">No items in dead letter queue</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Attempts
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Final Error
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {dlqItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 text-sm">
                      <Link
                        href={`/admin/customers/${item.customer_id}`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        {item.customer_id.slice(0, 8)}...
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm">{item.attempts_made}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div className="max-w-md truncate" title={item.final_error}>
                        {item.final_error}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(item.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color = 'gray',
}: {
  label: string;
  value: number;
  color?: 'gray' | 'green' | 'yellow' | 'red' | 'blue' | 'purple';
}) {
  const colorClasses = {
    gray: 'text-gray-900',
    green: 'text-green-600',
    yellow: 'text-yellow-600',
    red: 'text-red-600',
    blue: 'text-blue-600',
    purple: 'text-purple-600',
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <p className="text-sm text-gray-600">{label}</p>
      <p className={`text-3xl font-bold ${colorClasses[color]}`}>{value}</p>
    </div>
  );
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diff = new Date(date).getTime() - now.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 0) {
    return 'Now';
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
}
