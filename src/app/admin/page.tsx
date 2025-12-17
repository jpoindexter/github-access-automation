/**
 * Admin Dashboard Page
 * Main admin panel showing customer list and stats
 */

import { db } from '@/lib/db';
import { CustomersTable } from '@/components/admin/customers-table';

export default async function AdminDashboard() {
  const customers = await db.getAllCustomers();

  // Calculate simple stats
  const stats = {
    total: customers.length,
    invited: customers.filter(
      (c) => c.status === 'invited' || c.status === 'active'
    ).length,
    pending: customers.filter((c) => c.status === 'pending').length,
    failed: customers.filter((c) => c.invitation_error).length,
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Customers</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Customers" value={stats.total} />
        <StatCard label="Invited" value={stats.invited} color="green" />
        <StatCard label="Pending" value={stats.pending} color="yellow" />
        <StatCard label="Failed" value={stats.failed} color="red" />
      </div>

      {/* Customer Table */}
      <CustomersTable customers={customers} />
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
  color?: 'gray' | 'green' | 'yellow' | 'red';
}) {
  const colorClasses = {
    gray: 'text-gray-900',
    green: 'text-green-600',
    yellow: 'text-yellow-600',
    red: 'text-red-600',
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <p className="text-sm text-gray-600">{label}</p>
      <p className={`text-3xl font-bold ${colorClasses[color]}`}>{value}</p>
    </div>
  );
}
