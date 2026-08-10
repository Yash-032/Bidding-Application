'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getToken } from '@/lib/api';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
const date = (value: string) => new Date(value).toLocaleString();

export default function CustomerInsightsPage() {
  const { userId } = useParams<{ userId: string }>();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    fetch(`/api/admin/analytics/customers/${userId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Could not load customer insights');
        setData(body);
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [userId]);

  if (error) return <div className="p-6"><Link href="/admin" className="text-sm underline">Back to analytics</Link><p className="mt-6 text-red-700">{error}</p></div>;
  if (loading) return <div className="max-w-7xl mx-auto space-y-6 animate-pulse"><div className="h-4 w-40 rounded bg-[#e8e5de]" /><div className="flex items-center gap-3"><div className="h-12 w-12 rounded-full bg-[#e8e5de]" /><div className="space-y-2"><div className="h-7 w-72 rounded bg-[#e8e5de]" /><div className="h-4 w-96 rounded bg-[#e8e5de]" /></div></div><div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 rounded-2xl bg-[#e8e5de]" />)}</div><div className="grid lg:grid-cols-2 gap-6"><div className="h-80 rounded-2xl bg-[#e8e5de]" /><div className="h-80 rounded-2xl bg-[#e8e5de]" /></div><p className="text-sm text-[var(--foreground-muted)]">Collecting customer analytics…</p></div>;
  if (!data) return null;

  const cards = [
    ['30-day spend', money(data.summary.totalSpent)],
    ['Orders', data.summary.orderCount],
    ['Total Active Time', `${data.summary.activeMinutes} min`],
    ['Cart items', data.summary.cartItems],
  ];

  return <div className="space-y-6 max-w-7xl mx-auto">
    <Link href="/admin" className="text-xs font-semibold uppercase tracking-wider text-[#24392e] hover:underline">← Analytics dashboard</Link>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs uppercase tracking-wider text-[var(--foreground-muted)] pb-[6px] pt-[10px]">Customer insight · last 30 days</p><h1 className="text-3xl font-serif font-bold text-black">{data.customer.fullName || data.customer.email}</h1><p className="text-sm text-[var(--foreground-muted)] pt-[8px]">{data.customer.email} · {data.summary.segment} · last active {data.summary.daysInactive}d ago</p></div>
      <div className="rounded-xl bg-[#edf4ee] px-4 py-3 text-xs"><strong>Fit:</strong> {data.customer.fit.status.replace('_', ' ')}<br />Pixa connected: {data.customer.fit.connectedToPixa ? 'Yes' : 'No'}</div>
    </header>
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">{cards.map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-[var(--border)] bg-white p-5"><p className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">{label}</p><p className="mt-2 text-2xl font-bold text-[#24392e]">{value}</p></div>)}</section>
    <section className="grid lg:grid-cols-2 gap-6">
      <div className="rounded-2xl border border-[var(--border)] bg-white p-6"><h2 className="font-serif text-xl font-bold">Time spent by category</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Minutes from product dwell events.</p>{data.categoryInterests.some((item: any) => item.activeMinutes > 0) ? <><div className="mt-4 h-72"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.categoryInterests.filter((item: any) => item.activeMinutes > 0)} dataKey="activeMinutes" nameKey="name" innerRadius={55} outerRadius={92} paddingAngle={3}>{data.categoryInterests.filter((item: any) => item.activeMinutes > 0).map((_: any, index: number) => <Cell key={index} fill={['#24392e','#5d7d6a','#b48a54','#8a6f9d','#4d7c8a','#b15f5f'][index % 6]} />)}</Pie><Tooltip formatter={(value) => [String(value) + ' min', 'Time spent']} /></PieChart></ResponsiveContainer></div><div className="grid grid-cols-2 gap-2 text-xs">{data.categoryInterests.filter((item: any) => item.activeMinutes > 0).map((item: any) => <p key={item.name}>{item.name}<strong className="float-right">{item.activeMinutes}m</strong></p>)}</div></> : <p className="py-24 text-center text-sm text-[var(--foreground-muted)]">No category dwell time yet.</p>}</div>
      <div className="rounded-2xl border border-[var(--border)] bg-white p-6"><h2 className="font-serif text-xl font-bold">Top searches</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Searches made in the last 30 days.</p>{data.topSearches.length ? <div className="mt-4 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.topSearches} layout="vertical" margin={{ left: 12, right: 20 }}><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="query" width={100} tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => [value, 'Searches']} /><Bar dataKey="count" fill="#24392e" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></div> : <p className="py-24 text-center text-sm text-[var(--foreground-muted)]">No searches recorded yet.</p>}</div>
    </section>    <section className="grid lg:grid-cols-3 gap-6">
      {/* <div className="rounded-2xl border border-[var(--border)] bg-white p-6"><h2 className="font-serif text-xl font-bold">Shopping funnel</h2><div className="mt-5 space-y-4 text-sm"><p>Product views <strong className="float-right">{data.funnel.productViews}</strong></p><p>Cart adds <strong className="float-right">{data.funnel.cartAdds} · {data.funnel.viewToCartRate.toFixed(1)}%</strong></p><p>Purchases <strong className="float-right">{data.funnel.purchases} · {data.funnel.cartToPurchaseRate.toFixed(1)}%</strong></p></div></div>
      <div className="rounded-2xl border border-[var(--border)] bg-white p-6"><h2 className="font-serif text-xl font-bold">Engagement</h2><div className="mt-5 grid grid-cols-2 gap-4 text-sm"><p>Searches <strong className="block text-xl">{data.engagement.searches}</strong></p><p>Feed clicks <strong className="block text-xl">{data.engagement.feedClicks}</strong></p><p>Feed impressions <strong className="block text-xl">{data.engagement.feedImpressions}</strong></p><p>Product views <strong className="block text-xl">{data.engagement.productViews}</strong></p></div></div> */}
      {/* <div className="rounded-2xl border border-[var(--border)] bg-white p-6"><h2 className="font-serif text-xl font-bold">Top searches</h2><div className="mt-4 space-y-2 text-sm">{data.topSearches.length ? data.topSearches.map((item: any) => <p key={item.query}>{item.query}<strong className="float-right">{item.count}</strong></p>) : <p className="text-[var(--foreground-muted)]">No searches recorded.</p>}</div></div> */}
    </section>
    <section className="grid lg:grid-cols-2 gap-6">
      {/* <div className="rounded-2xl border border-[var(--border)] bg-white p-6"><h2 className="font-serif text-xl font-bold">Category interest and time spent</h2><p className="mt-1 text-xs text-[var(--foreground-muted)]">Time is calculated from recorded product dwell events.</p><div className="mt-5 space-y-3">{data.categoryInterests.length ? data.categoryInterests.map((item: any) => <div key={item.name} className="rounded-lg bg-[#f7f6f2] p-3 text-sm"><strong>{item.name}</strong><span className="float-right">{item.activeMinutes} min</span><p className="mt-1 text-xs text-[var(--foreground-muted)]">{item.count} recorded interactions</p></div>) : <p className="text-sm text-[var(--foreground-muted)]">No category activity recorded.</p>}</div></div> */}
      {/* <div className="rounded-2xl border border-[var(--border)] bg-white p-6"><h2 className="font-serif text-xl font-bold">Recent activity</h2><div className="mt-4 max-h-80 overflow-y-auto space-y-3">{data.recentActivity.length ? data.recentActivity.map((item: any, index: number) => <div key={index} className="border-b border-[var(--border)] pb-3 text-sm"><strong>{item.type.replaceAll('_', ' ')}</strong><span className="float-right text-xs text-[var(--foreground-muted)]">{date(item.at)}</span><p className="text-xs text-[var(--foreground-muted)]">{item.productTitle || item.query || item.category || 'Store activity'}{item.durationMs ? ` · ${Math.round(item.durationMs / 1000)} sec` : ''}</p></div>) : <p className="text-sm text-[var(--foreground-muted)]">No activity recorded.</p>}</div></div> */}
    </section>
  </div>;
}
