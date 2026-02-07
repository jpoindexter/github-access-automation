'use client';

/**
 * Customers Table Component
 * Displays customer list with search and retry functionality
 */

import { useState } from 'react';
import type { Customer } from '@/types';

interface CustomersTableProps {
  customers: Customer[];
}

export function CustomersTable({ customers }: CustomersTableProps) {
  const [search, setSearch] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Client-side search filter
  const filtered = customers.filter(
    (c) =>
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.github_username?.toLowerCase().includes(search.toLowerCase()) ||
      c.name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleRetry = async (customerId: string) => {
    setRetryingId(customerId);

    try {
      const response = await fetch('/api/admin/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId }),
      });

      if (response.ok) {
        // Refresh page to show updated status
        window.location.reload();
      } else {
        const data = await response.json();
        alert(`Retry failed: ${data.error}`);
      }
    } catch {
      alert('Retry failed. Please check logs.');
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="rounded-lg bg-white shadow">
      {/* Search Bar */}
      <div className="border-b p-4">
        <input
          type="search"
          placeholder="Search by email, GitHub username, or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                GitHub
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Purchase Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                  {search ? 'No customers found matching your search' : 'No customers yet'}
                </td>
              </tr>
            ) : (
              filtered.map((customer) => (
                <tr key={customer.id}>
                  <td className="px-6 py-4 text-sm">{customer.email}</td>
                  <td className="px-6 py-4 text-sm">{customer.github_username || '—'}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={customer.status} error={customer.invitation_error} />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(customer.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {customer.amount_paid ? `$${(customer.amount_paid / 100).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-6 py-4">
                    {customer.invitation_error && (
                      <button
                        onClick={() => handleRetry(customer.id)}
                        disabled={retryingId === customer.id}
                        className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {retryingId === customer.id ? 'Retrying...' : 'Retry'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status, error }: { status: string; error?: string | null }) {
  if (error) {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
        Failed
      </span>
    );
  }

  const colors = {
    pending: 'bg-yellow-100 text-yellow-800',
    invited: 'bg-blue-100 text-blue-800',
    active: 'bg-green-100 text-green-800',
    invited_failed: 'bg-red-100 text-red-800',
  };

  const color = colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';

  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${color}`}>
      {status}
    </span>
  );
}
