'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getToken } from '@/lib/api';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  useEffect(() => {
    const token = getToken();
    fetch('/api/admin/analytics/customers', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((response) => response.json())
      .then((data) => setCustomers(data.topCustomers ?? []));
  }, []);
  return <div className="max-w-4xl mx-auto"><p className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">Customer intelligence</p><h1 className="mt-2 text-3xl font-serif font-bold">Customer Insights</h1><p className="mt-2 text-sm text-[var(--foreground-muted)]">Open a customer to view 30-day engagement, shopping funnel, category dwell time, fit connection status, searches, and recent activity.</p><div className="mt-8 space-y-3">{customers.map((customer) => <Link key={customer.userId} href={`/admin/customers/${customer.userId}`} className="block rounded-xl border border-[var(--border)] bg-white p-5 hover:bg-[#f7f6f2]"><strong>{customer.fullName === 'N/A' ? customer.email : customer.fullName}</strong><span className="float-right font-semibold">₹{customer.totalSpent.toLocaleString()}</span><p className="mt-1 text-xs text-[var(--foreground-muted)]">{customer.email} · {customer.orderCount} orders</p></Link>)}{!customers.length && <p className="mt-8 text-sm text-[var(--foreground-muted)]">No customer purchase records are available yet.</p>}</div></div>;
}
