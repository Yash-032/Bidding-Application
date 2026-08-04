'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';
import { useToast } from '@/app/components/Toast';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  ShoppingBag, 
  DollarSign, 
  Package, 
  Activity, 
  AlertTriangle, 
  RefreshCw, 
  Layers, 
  CheckCircle2, 
  Percent, 
  Ban,
  Clock,
  ArrowRight,
  TrendingUp as TrendUpIcon,
  Flame,
  Archive,
  ShoppingCart
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';

type DateRange = 'today' | '7d' | '30d' | '3m' | '12m' | 'custom';
type RefreshRate = 'off' | '30s' | '60s';

const PIE_COLORS = ['#24392e', '#314c3e', '#416653', '#5a8c73', '#7cbda0', '#a4dec2', '#c7edd8'];

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  // Filters & State
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [refreshRate, setRefreshRate] = useState<RefreshRate>('30s');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [overview, setOverview] = useState<any>(null);
  const [revenue, setRevenue] = useState<any[]>([]);
  const [products, setProducts] = useState<any>(null);
  const [categories, setCategories] = useState<any>(null);
  const [customers, setCustomers] = useState<any>(null);
  const [inventory, setInventory] = useState<any>(null);
  const [carts, setCarts] = useState<any>(null);
  const [auctions, setAuctions] = useState<any>(null);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('bidding_token');
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const params = new URLSearchParams();
      if (dateRange !== 'custom') {
        const now = new Date();
        let start = new Date();
        if (dateRange === 'today') {
          start.setHours(0, 0, 0, 0);
        } else if (dateRange === '7d') {
          start.setDate(now.getDate() - 7);
        } else if (dateRange === '30d') {
          start.setDate(now.getDate() - 30);
        } else if (dateRange === '3m') {
          start.setMonth(now.getMonth() - 3);
        } else if (dateRange === '12m') {
          start.setMonth(now.getMonth() - 12);
        }
        params.set('startDate', start.toISOString());
        params.set('endDate', now.toISOString());
        params.set('groupBy', dateRange === 'today' ? 'hour' : dateRange === '12m' ? 'month' : 'day');
      } else {
        if (customStartDate) params.set('startDate', new Date(customStartDate).toISOString());
        if (customEndDate) params.set('endDate', new Date(customEndDate).toISOString());
        params.set('groupBy', 'day');
      }

      const queryStr = params.toString() ? `?${params.toString()}` : '';

      const [
        overviewRes, 
        revenueRes, 
        productsRes, 
        categoriesRes, 
        customersRes, 
        inventoryRes, 
        cartsRes, 
        auctionsRes
      ] = await Promise.all([
        fetch(`/api/admin/analytics/overview${queryStr}`, { headers }).then(r => r.json()),
        fetch(`/api/admin/analytics/revenue${queryStr}`, { headers }).then(r => r.json()),
        fetch(`/api/admin/analytics/products${queryStr}`, { headers }).then(r => r.json()),
        fetch(`/api/admin/analytics/categories${queryStr}`, { headers }).then(r => r.json()),
        fetch(`/api/admin/analytics/customers${queryStr}`, { headers }).then(r => r.json()),
        fetch(`/api/admin/analytics/inventory${queryStr}`, { headers }).then(r => r.json()),
        fetch(`/api/admin/analytics/carts${queryStr}`, { headers }).then(r => r.json()),
        fetch(`/api/admin/analytics/auctions${queryStr}`, { headers }).then(r => r.json()),
      ]);

      const firstError = [
        overviewRes, 
        revenueRes, 
        productsRes, 
        categoriesRes, 
        customersRes, 
        inventoryRes, 
        cartsRes, 
        auctionsRes
      ].find(r => r.error);
      
      if (firstError) {
        throw new Error(firstError.error);
      }

      setOverview(overviewRes);
      setRevenue(revenueRes);
      setProducts(productsRes);
      setCategories(categoriesRes);
      setCustomers(customersRes);
      setInventory(inventoryRes);
      setCarts(cartsRes);
      setAuctions(auctionsRes);
    } catch (err: any) {
      console.error('Error fetching dashboard analytics:', err);
      setError(err.message || 'Failed to connect to database analytics endpoints');
      toast(err.message || 'Could not load analytics. Refresh again.', 'error');
    } finally {
      setLoading(false);
    }
  }, [dateRange, customStartDate, customEndDate, toast]);

  // Initial Fetch & Auto Refresh Timer
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    if (refreshRate === 'off') return;
    const intervalTime = refreshRate === '30s' ? 30_000 : 60_000;
    const timer = setInterval(() => {
      fetchAllData();
    }, intervalTime);
    return () => clearInterval(timer);
  }, [refreshRate, fetchAllData]);

  // Formatter helpers
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const renderGrowth = (growthValue: number) => {
    if (growthValue == null || isNaN(growthValue)) return null;
    const isPositive = growthValue >= 0;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
        isPositive 
          ? 'bg-[#34d399]/10 text-emerald-700' 
          : 'bg-[#fb7185]/10 text-rose-700'
      }`}>
        {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {isPositive ? '+' : ''}{growthValue.toFixed(1)}%
      </span>
    );
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-[var(--border)] shadow-xs max-w-2xl mx-auto my-12 animate-slideUp">
        <AlertTriangle className="h-16 w-16 text-rose-500 mb-6" />
        <h2 className="text-2xl font-serif font-bold text-[#1d231f] mb-2">Analytics Connection Failed</h2>
        <p className="text-[var(--foreground-muted)] text-center mb-6">
          {error}
        </p>
        <button 
          onClick={fetchAllData}
          className="btn-primary flex items-center gap-2 px-6 py-3 cursor-pointer"
        >
          <RefreshCw size={16} /> Reconnect to Database
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn max-w-7xl mx-auto">
      {/* Dashboard Top bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--border)] pb-6">
        <div>
          <h1 className="page-title text-black text-3xl font-serif font-bold mb-1">Analytics Dashboard</h1>
          <p className="page-subtitle text-xs text-[var(--foreground-muted)] mb-0">
            Real-time shop sales, customer metrics, inventory alerts, and live auction intelligence.
          </p>
        </div>

        {/* Refreshes & Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Refresh Selector */}
          <div className="flex items-center gap-2 bg-[#efebe3] border border-[var(--border)] rounded-xl px-3 py-1.5 text-xs text-[#1d231f]">
            <Clock size={14} className="text-[#686b67]" />
            <span>Auto Refresh:</span>
            <select 
              value={refreshRate} 
              onChange={(e) => setRefreshRate(e.target.value as RefreshRate)}
              className="bg-transparent font-semibold focus:outline-hidden cursor-pointer"
            >
              <option value="off">Off</option>
              <option value="30s">30 Seconds</option>
              <option value="60s">60 Seconds</option>
            </select>
          </div>

          <button
            onClick={fetchAllData}
            disabled={loading}
            className="flex items-center gap-2 bg-[#24392e] text-white hover:bg-[#15271e] transition-colors rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/70 backdrop-blur-md border border-[var(--border)] rounded-2xl p-4 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['today', '7d', '30d', '3m', '12m', 'custom'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                dateRange === range
                  ? 'bg-[#24392e] text-white'
                  : 'text-[#4b4e4a] hover:bg-[#efebe3]'
              }`}
            >
              {range === 'today' && 'Today'}
              {range === '7d' && '7 Days'}
              {range === '30d' && '30 Days'}
              {range === '3m' && '3 Months'}
              {range === '12m' && '12 Months'}
              {range === 'custom' && 'Custom Range'}
            </button>
          ))}
        </div>

        {/* Custom date range fields */}
        {dateRange === 'custom' && (
          <div className="flex items-center gap-2 animate-fadeIn">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="border border-[var(--border)] rounded-xl px-3 py-1.5 text-xs focus:outline-hidden focus:border-[#24392e] bg-white text-black"
            />
            <span className="text-xs text-[var(--foreground-muted)]">to</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="border border-[var(--border)] rounded-xl px-3 py-1.5 text-xs focus:outline-hidden focus:border-[#24392e] bg-white text-black"
            />
            <button
              onClick={fetchAllData}
              className="bg-[#24392e] hover:bg-[#15271e] text-white text-xs px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* KPI 1: Revenue */}
        <div className="bg-white border border-[var(--border)] rounded-3xl p-6 shadow-2xs hover:shadow-xs transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform text-[#24392e]">
            <DollarSign size={80} />
          </div>
          {loading ? (
            <div className="space-y-3">
              <div className="h-4 w-1/3 bg-gray-200 animate-pulse rounded-full" />
              <div className="h-8 w-2/3 bg-gray-200 animate-pulse rounded-full" />
              <div className="h-4 w-1/2 bg-gray-200 animate-pulse rounded-full" />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">Total Revenue</p>
              <h3 className="text-3xl font-serif font-black text-black leading-none">
                {formatCurrency(overview?.totalRevenue ?? 0)}
              </h3>
              <div className="flex items-center gap-2 pt-1">
                {renderGrowth(overview?.growth?.revenue)}
                <span className="text-[10px] text-[var(--foreground-subtle)] font-medium">vs previous period</span>
              </div>
            </div>
          )}
        </div>

        {/* KPI 2: Total Orders */}
        <div className="bg-white border border-[var(--border)] rounded-3xl p-6 shadow-2xs hover:shadow-xs transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform text-[#24392e]">
            <ShoppingBag size={80} />
          </div>
          {loading ? (
            <div className="space-y-3">
              <div className="h-4 w-1/3 bg-gray-200 animate-pulse rounded-full" />
              <div className="h-8 w-2/3 bg-gray-200 animate-pulse rounded-full" />
              <div className="h-4 w-1/2 bg-gray-200 animate-pulse rounded-full" />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">Total Orders</p>
              <h3 className="text-3xl font-serif font-black text-black leading-none">
                {(overview?.totalOrders ?? 0).toLocaleString()}
              </h3>
              <div className="flex items-center gap-2 pt-1">
                {renderGrowth(overview?.growth?.orders)}
                <span className="text-[10px] text-[var(--foreground-subtle)] font-medium">vs previous period</span>
              </div>
            </div>
          )}
        </div>

        {/* KPI 3: Total Customers */}
        <div className="bg-white border border-[var(--border)] rounded-3xl p-6 shadow-2xs hover:shadow-xs transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform text-[#24392e]">
            <Users size={80} />
          </div>
          {loading ? (
            <div className="space-y-3">
              <div className="h-4 w-1/3 bg-gray-200 animate-pulse rounded-full" />
              <div className="h-8 w-2/3 bg-gray-200 animate-pulse rounded-full" />
              <div className="h-4 w-1/2 bg-gray-200 animate-pulse rounded-full" />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">Total Customers</p>
              <h3 className="text-3xl font-serif font-black text-black leading-none">
                {(overview?.totalCustomers ?? 0).toLocaleString()}
              </h3>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs font-bold text-[#24392e] bg-[#24392e]/10 px-2 py-0.5 rounded-full">Active</span>
                <span className="text-[10px] text-[var(--foreground-subtle)] font-medium">registered shoppers</span>
              </div>
            </div>
          )}
        </div>

        {/* KPI 4: Average Order Value */}
        <div className="bg-white border border-[var(--border)] rounded-3xl p-6 shadow-2xs hover:shadow-xs transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform text-[#24392e]">
            <Activity size={80} />
          </div>
          {loading ? (
            <div className="space-y-3">
              <div className="h-4 w-1/3 bg-gray-200 animate-pulse rounded-full" />
              <div className="h-8 w-2/3 bg-gray-200 animate-pulse rounded-full" />
              <div className="h-4 w-1/2 bg-gray-200 animate-pulse rounded-full" />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">Average Order Value</p>
              <h3 className="text-3xl font-serif font-black text-black leading-none">
                {formatCurrency(overview?.averageOrderValue ?? 0)}
              </h3>
              <div className="flex items-center gap-2 pt-1">
                {renderGrowth(overview?.growth?.aov)}
                <span className="text-[10px] text-[var(--foreground-subtle)] font-medium">vs previous period</span>
              </div>
            </div>
          )}
        </div>

        {/* KPI 5: Revenue Growth */}
        <div className="bg-white border border-[var(--border)] rounded-3xl p-6 shadow-2xs hover:shadow-xs transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform text-[#24392e]">
            <Percent size={80} />
          </div>
          {loading ? (
            <div className="space-y-3">
              <div className="h-4 w-1/3 bg-gray-200 animate-pulse rounded-full" />
              <div className="h-8 w-2/3 bg-gray-200 animate-pulse rounded-full" />
              <div className="h-4 w-1/2 bg-gray-200 animate-pulse rounded-full" />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">Revenue Growth</p>
              <h3 className="text-3xl font-serif font-black text-black leading-none">
                {(overview?.growth?.revenue ?? 0).toFixed(1)}%
              </h3>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Performance</span>
                <span className="text-[10px] text-[var(--foreground-subtle)] font-medium">rate vs prior period</span>
              </div>
            </div>
          )}
        </div>

        {/* KPI 6: New Customers */}
        <div className="bg-white border border-[var(--border)] rounded-3xl p-6 shadow-2xs hover:shadow-xs transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform text-[#24392e]">
            <Users size={80} />
          </div>
          {loading ? (
            <div className="space-y-3">
              <div className="h-4 w-1/3 bg-gray-200 animate-pulse rounded-full" />
              <div className="h-8 w-2/3 bg-gray-200 animate-pulse rounded-full" />
              <div className="h-4 w-1/2 bg-gray-200 animate-pulse rounded-full" />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">New Customers</p>
              <h3 className="text-3xl font-serif font-black text-black leading-none">
                {(overview?.newCustomers ?? 0).toLocaleString()}
              </h3>
              <div className="flex items-center gap-2 pt-1">
                {renderGrowth(overview?.growth?.customers)}
                <span className="text-[10px] text-[var(--foreground-subtle)] font-medium">vs previous period</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* High-priority Alerts Section */}
      <div className="bg-white border border-[var(--border)] rounded-3xl p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
          <AlertTriangle className="text-[#24392e]" size={20} />
          <h2 className="text-lg font-serif font-bold text-black">Operational & Sales Alerts</h2>
        </div>
        
        {loading ? (
          <div className="space-y-3">
            <div className="h-10 bg-gray-100 animate-pulse rounded-xl" />
            <div className="h-10 bg-gray-100 animate-pulse rounded-xl" />
          </div>
        ) : !inventory?.alerts || inventory.alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-[var(--foreground-muted)]">
            <CheckCircle2 className="text-emerald-500 h-10 w-10 mb-2" />
            <p className="text-sm font-semibold">All Systems Normal</p>
            <p className="text-xs">No critical inventory or sales anomalies found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {inventory.alerts.map((alert: any, idx: number) => (
              <div 
                key={idx} 
                className={`flex gap-3 p-4 rounded-2xl border text-xs leading-relaxed transition-all ${
                  alert.type === 'danger'
                    ? 'bg-rose-50 border-rose-100 text-rose-800'
                    : alert.type === 'warning'
                    ? 'bg-amber-50 border-amber-100 text-amber-800'
                    : alert.type === 'success'
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                    : 'bg-sky-50 border-sky-100 text-sky-800'
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  <AlertTriangle size={16} />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="font-bold">{alert.message}</p>
                  <p className="opacity-90">{alert.details}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Trends & Categories Visualization Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Area Chart (Col span 2) */}
        <div className="bg-white border border-[var(--border)] rounded-3xl p-6 shadow-2xs lg:col-span-2 flex flex-col min-h-[420px]">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-6">
            <div className="flex items-center gap-2">
              <BarChart3 className="text-[#24392e]" size={20} />
              <h2 className="text-lg font-serif font-bold text-black">Revenue & Order Trend over Time</h2>
            </div>
            <span className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wider">
              Grouped by {dateRange === 'today' ? 'Hour' : dateRange === '12m' ? 'Month' : 'Day'}
            </span>
          </div>

          <div className="flex-1 w-full text-xs min-h-[300px]">
            {loading ? (
              <div className="h-full w-full flex items-center justify-center bg-gray-50 rounded-2xl animate-pulse">
                <p className="text-[var(--foreground-muted)]">Loading trend visualization...</p>
              </div>
            ) : revenue.length === 0 ? (
              <div className="h-full w-full flex flex-col items-center justify-center text-center text-[var(--foreground-muted)]">
                <Archive size={40} className="mb-2" />
                <p className="font-semibold">No order data available for this range</p>
                <p className="text-[10px]">Mock or place new store checkouts to populate.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={revenue} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#24392e" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#24392e" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(tick) => {
                      try {
                        const date = new Date(tick);
                        if (dateRange === 'today') return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                      } catch {
                        return tick;
                      }
                    }} 
                    stroke="#888888"
                  />
                  <YAxis stroke="#888888" />
                  <Tooltip 
                    formatter={(val: any, name?: any) => {
                      if (name === 'revenue') return [formatCurrency(val), 'Revenue'];
                      return [val, 'Orders Count'];
                    }}
                    labelFormatter={(label) => {
                      try {
                        if (typeof label === 'string' || typeof label === 'number') {
                          return new Date(label).toLocaleString();
                        }
                        return String(label ?? '');
                      } catch {
                        return String(label ?? '');
                      }
                    }}
                    contentStyle={{ borderRadius: '12px', borderColor: '#d8d3ca' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#24392e" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorRevenue)" 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="orders" 
                    stroke="#fbbf24" 
                    strokeWidth={1}
                    fillOpacity={0.1} 
                    fill="#fbbf24" 
                  />
                  <Legend verticalAlign="top" height={36} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Category breakdown pie chart */}
        <div className="bg-white border border-[var(--border)] rounded-3xl p-6 shadow-2xs flex flex-col min-h-[420px]">
          <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3 mb-6">
            <Layers className="text-[#24392e]" size={20} />
            <h2 className="text-lg font-serif font-bold text-black">Category Revenue Share</h2>
          </div>

          <div className="flex-1 flex flex-col justify-center items-center">
            {loading ? (
              <div className="h-48 w-48 rounded-full border-4 border-gray-100 border-t-gray-300 animate-spin" />
            ) : !categories?.distribution || categories.distribution.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center text-[var(--foreground-muted)] text-xs h-full">
                <Archive size={40} className="mb-2" />
                <p className="font-semibold">No category metrics</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={categories.distribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="revenue"
                    >
                      {categories.distribution.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(val: any) => formatCurrency(val)} 
                      contentStyle={{ borderRadius: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Legend list */}
                <div className="w-full space-y-2 mt-4 max-h-[120px] overflow-y-auto pr-1 text-xs">
                  {categories.distribution.map((cat: any, index: number) => (
                    <div key={`${cat.id || cat.name}-${index}`} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <div 
                          className="h-3 w-3 rounded-full shrink-0" 
                          style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} 
                        />
                        <span className="font-medium text-[#4b4e4a] truncate">{cat.name}</span>
                      </div>
                      <span className="font-bold text-black">{cat.percentage.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Top Products & Category Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Selling Products List */}
        <div className="bg-white border border-[var(--border)] rounded-3xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <h2 className="text-lg font-serif font-bold text-black">Top Selling Products</h2>
            <span className="text-[10px] font-semibold text-[#24392e] bg-[#24392e]/10 px-2.5 py-1 rounded-full">Top Revenue</span>
          </div>

          {loading ? (
            <div className="space-y-3">
              <div className="h-12 bg-gray-50 animate-pulse rounded-xl" />
              <div className="h-12 bg-gray-50 animate-pulse rounded-xl" />
              <div className="h-12 bg-gray-50 animate-pulse rounded-xl" />
            </div>
          ) : !products?.topSelling || products.topSelling.length === 0 ? (
            <div className="text-center py-12 text-[var(--foreground-muted)] text-xs">
              No product sales records.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[380px] overflow-y-auto pr-2 space-y-2.5">
              {products.topSelling.map((prod: any, idx: number) => (
                <div key={prod.productId} className="flex items-center gap-4 pt-2.5 first:pt-0 text-xs">
                  <span className="font-bold text-gray-400 w-4">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-black truncate">{prod.title}</p>
                    <p className="text-[10px] text-[var(--foreground-muted)]">{prod.quantity} units sold</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[#24392e]">{formatCurrency(prod.revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Trending Categories growth */}
        <div className="bg-white border border-[var(--border)] rounded-3xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <h2 className="text-lg font-serif font-bold text-black">Category Sales Growth</h2>
            <span className="text-[10px] font-semibold text-[#24392e] bg-[#24392e]/10 px-2.5 py-1 rounded-full">Growth Trend</span>
          </div>

          {loading ? (
            <div className="space-y-3">
              <div className="h-12 bg-gray-50 animate-pulse rounded-xl" />
              <div className="h-12 bg-gray-50 animate-pulse rounded-xl" />
            </div>
          ) : !categories?.trending || categories.trending.length === 0 ? (
            <div className="text-center py-12 text-[var(--foreground-muted)] text-xs">
              No category historical data.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[380px] overflow-y-auto pr-2 space-y-2.5">
              {categories.trending.map((cat: any) => (
                <div key={cat.id} className="flex items-center justify-between gap-4 pt-2.5 first:pt-0 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-black truncate">{cat.name}</p>
                    <p className="text-[10px] text-[var(--foreground-muted)]">Current Revenue: {formatCurrency(cat.revenue)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {renderGrowth(cat.growth)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart & Size Demand Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cart Conversion Rate Card */}
        <div className="bg-white border border-[var(--border)] rounded-3xl p-6 shadow-2xs flex flex-col justify-between">
          <div className="border-b border-[var(--border)] pb-3 mb-4">
            <div className="flex items-center gap-2">
              <ShoppingCart size={18} className="text-[#24392e]" />
              <h2 className="text-base font-serif font-bold text-black">Cart Conversion Metrics</h2>
            </div>
          </div>
          
          {loading ? (
            <div className="space-y-4 py-4">
              <div className="h-16 w-16 rounded-full bg-gray-100 animate-pulse mx-auto" />
              <div className="h-4 bg-gray-100 animate-pulse w-2/3 mx-auto" />
            </div>
          ) : (
            <div className="space-y-6 py-2">
              <div className="text-center">
                <h3 className="text-5xl font-black text-[#24392e] font-serif leading-none mb-2">
                  {carts?.conversion?.rate?.toFixed(1) ?? 0}%
                </h3>
                <p className="text-xs font-semibold text-[var(--foreground-muted)]">Cart-to-Order Conversion Rate</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs pt-4 border-t border-[var(--border)]">
                <div className="text-center p-3 bg-[#fbfaf7] border border-[var(--border)] rounded-2xl">
                  <p className="font-black text-[#24392e] text-lg">{carts?.conversion?.completedOrders ?? 0}</p>
                  <p className="text-[10px] text-[var(--foreground-muted)]">Completed Orders</p>
                </div>
                <div className="text-center p-3 bg-[#fbfaf7] border border-[var(--border)] rounded-2xl">
                  <p className="font-black text-[#24392e] text-lg">{carts?.conversion?.activeCarts ?? 0}</p>
                  <p className="text-[10px] text-[var(--foreground-muted)]">Active Shopping Bags</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Most Added-To-Cart Products */}
        <div className="bg-white border border-[var(--border)] rounded-3xl p-6 shadow-2xs flex flex-col">
          <div className="border-b border-[var(--border)] pb-3 mb-4 flex items-center justify-between">
            <h2 className="text-base font-serif font-bold text-black">Most Added-to-Cart Items</h2>
            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">High Demand</span>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[250px] pr-2 space-y-3">
            {loading ? (
              <div className="space-y-2">
                <div className="h-10 bg-gray-50 animate-pulse rounded-lg" />
                <div className="h-10 bg-gray-50 animate-pulse rounded-lg" />
              </div>
            ) : !carts?.mostAdded || carts.mostAdded.length === 0 ? (
              <div className="text-center py-6 text-[var(--foreground-muted)] text-xs">
                No bag additions.
              </div>
            ) : (
              carts.mostAdded.map((item: any) => (
                <div key={item.productId} className="flex items-center justify-between gap-4 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-black truncate">{item.title}</p>
                    <p className="text-[10px] text-[var(--foreground-muted)]">Added {item.totalQuantity} times ({item.cartCount} bags)</p>
                  </div>
                  <span className="font-bold text-[#24392e]">{formatCurrency(item.price)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Size-wise sales and demand (Bar chart) */}
        <div className="bg-white border border-[var(--border)] rounded-3xl p-6 shadow-2xs flex flex-col">
          <div className="border-b border-[var(--border)] pb-3 mb-4">
            <h2 className="text-base font-serif font-bold text-black">Size Demand & Volume</h2>
          </div>

          <div className="flex-1 w-full text-[10px] min-h-[200px]">
            {loading ? (
              <div className="h-full flex items-center justify-center bg-gray-50 rounded-xl animate-pulse" />
            ) : !inventory?.sizes || inventory.sizes.length === 0 ? (
              <div className="text-center py-12 text-[var(--foreground-muted)]">
                No size details.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={inventory.sizes} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="size" stroke="#888888" />
                  <YAxis stroke="#888888" />
                  <Tooltip formatter={(v) => [v, 'Quantity Sold']} contentStyle={{ borderRadius: '12px' }} />
                  <Bar dataKey="quantity" fill="#24392e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Live Auction Metrics & Log Panel */}
      <div className="bg-white border border-[var(--border)] rounded-3xl p-6 shadow-2xs space-y-6">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2">
            <Activity className="text-[#24392e]" size={20} />
            <h2 className="text-lg font-serif font-bold text-black">Live & Completed Auction Performance</h2>
          </div>
          <span className="text-[10px] font-bold text-[var(--foreground-muted)] uppercase tracking-wider">Credits-Based Bidding</span>
        </div>

        {/* Live Counters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-[#fbfaf7] border border-[var(--border)] rounded-2xl text-center">
            {loading ? <div className="h-6 w-12 bg-gray-200 animate-pulse mx-auto rounded-full" /> : <p className="text-2xl font-black text-black font-serif">{auctions?.activeAuctions ?? 0}</p>}
            <p className="text-[10px] text-[var(--foreground-muted)] font-semibold mt-1">Active Auctions</p>
          </div>
          <div className="p-4 bg-[#fbfaf7] border border-[var(--border)] rounded-2xl text-center">
            {loading ? <div className="h-6 w-12 bg-gray-200 animate-pulse mx-auto rounded-full" /> : <p className="text-2xl font-black text-black font-serif">{auctions?.completedAuctions ?? 0}</p>}
            <p className="text-[10px] text-[var(--foreground-muted)] font-semibold mt-1">Completed Auctions</p>
          </div>
          <div className="p-4 bg-[#fbfaf7] border border-[var(--border)] rounded-2xl text-center">
            {loading ? <div className="h-6 w-12 bg-gray-200 animate-pulse mx-auto rounded-full" /> : <p className="text-2xl font-black text-black font-serif">{(auctions?.totalBids ?? 0).toLocaleString()}</p>}
            <p className="text-[10px] text-[var(--foreground-muted)] font-semibold mt-1">Bids Placed</p>
          </div>
          <div className="p-4 bg-[#fbfaf7] border border-[var(--border)] rounded-2xl text-center">
            {loading ? <div className="h-6 w-12 bg-gray-200 animate-pulse mx-auto rounded-full" /> : <p className="text-2xl font-black text-emerald-800 font-serif">🪙 {(auctions?.highestBid ?? 0).toLocaleString()}</p>}
            <p className="text-[10px] text-[var(--foreground-muted)] font-semibold mt-1">Highest Bid Overall</p>
          </div>
        </div>

        {/* Auctions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--foreground-muted)] uppercase tracking-wider text-[10px] font-bold">
                <th className="pb-3 pr-4">Auction Item</th>
                <th className="pb-3 px-4">Status</th>
                <th className="pb-3 px-4">Bids count</th>
                <th className="pb-3 px-4">Highest Bid</th>
                <th className="pb-3 px-4">Highest Bidder</th>
                <th className="pb-3 pl-4">Closing Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-4"><div className="h-4 bg-gray-100 rounded-full w-2/3" /></td>
                    <td className="py-4"><div className="h-4 bg-gray-100 rounded-full w-12" /></td>
                    <td className="py-4"><div className="h-4 bg-gray-100 rounded-full w-8" /></td>
                    <td className="py-4"><div className="h-4 bg-gray-100 rounded-full w-16" /></td>
                    <td className="py-4"><div className="h-4 bg-gray-100 rounded-full w-1/3" /></td>
                    <td className="py-4"><div className="h-4 bg-gray-100 rounded-full w-24" /></td>
                  </tr>
                ))
              ) : !auctions?.auctions || auctions.auctions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[var(--foreground-muted)]">No active or historic auctions.</td>
                </tr>
              ) : (
                auctions.auctions.map((a: any) => (
                  <tr key={a.id} className="hover:bg-[#fbfaf7] transition-colors">
                    <td className="py-4 pr-4 font-bold text-black">{a.title}</td>
                    <td className="py-4 px-4">
                      <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] uppercase ${
                        a.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : a.status === 'CLOSED'
                          ? 'bg-gray-100 text-gray-800'
                          : a.status === 'SCHEDULED'
                          ? 'bg-sky-100 text-sky-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 font-semibold text-[#1d231f]">{a.bidsCount}</td>
                    <td className="py-4 px-4 font-bold text-emerald-800">
                      {a.highestBidAmount > 0 ? `🪙 ${a.highestBidAmount.toLocaleString()}` : '-'}
                    </td>
                    <td className="py-4 px-4 text-[var(--foreground-muted)] truncate max-w-[150px]">{a.highestBidder}</td>
                    <td className="py-4 pl-4 text-[var(--foreground-muted)]">
                      {new Date(a.endTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Spenders & Recent Orders List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Spenders (Col span 1) */}
        <div className="bg-white border border-[var(--border)] rounded-3xl p-6 shadow-2xs flex flex-col min-h-[400px]">
          <div className="border-b border-[var(--border)] pb-3 mb-6">
            <h2 className="text-lg font-serif font-bold text-black">Top Customers</h2>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[300px] pr-2 space-y-4">
            {loading ? (
              Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="flex gap-4 animate-pulse">
                  <div className="h-8 w-8 rounded-full bg-gray-100 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-100 rounded-full w-2/3" />
                    <div className="h-3 bg-gray-100 rounded-full w-1/3" />
                  </div>
                </div>
              ))
            ) : !customers?.topCustomers || customers.topCustomers.length === 0 ? (
              <div className="text-center py-12 text-[var(--foreground-muted)] text-xs">
                No customer spend records.
              </div>
            ) : (
              customers.topCustomers.map((cust: any) => (
                <div key={cust.userId} className="flex items-center gap-3 text-xs">
                  <div className="h-8 w-8 rounded-full bg-[#efebe3] border border-[var(--border)] flex items-center justify-center font-bold text-[#24392e] uppercase shrink-0">
                    {cust.fullName ? cust.fullName.charAt(0) : cust.email.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-black truncate">{cust.fullName || 'N/A'}</p>
                    <p className="text-[10px] text-[var(--foreground-muted)] truncate">{cust.email} · {cust.orderCount} orders</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[#24392e]">{formatCurrency(cust.totalSpent)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Orders log (Col span 2) */}
        <div className="bg-white border border-[var(--border)] rounded-3xl p-6 shadow-2xs lg:col-span-2 flex flex-col min-h-[400px]">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-6">
            <h2 className="text-lg font-serif font-bold text-black">Recent Storefront Checkouts</h2>
            <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">Live Feed</span>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-[var(--foreground-muted)] uppercase tracking-wider text-[10px] font-bold">
                  <th className="pb-3 pr-4">Customer</th>
                  <th className="pb-3 px-4">Items Summary</th>
                  <th className="pb-3 px-4">Amount</th>
                  <th className="pb-3 px-4">Status</th>
                  <th className="pb-3 pl-4 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({ length: 4 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="py-3 pr-4"><div className="h-4 bg-gray-100 rounded-full w-2/3" /></td>
                      <td className="py-3 px-4"><div className="h-4 bg-gray-100 rounded-full w-full" /></td>
                      <td className="py-3 px-4"><div className="h-4 bg-gray-100 rounded-full w-12" /></td>
                      <td className="py-3 px-4"><div className="h-4 bg-gray-100 rounded-full w-16" /></td>
                      <td className="py-3 pl-4 text-right"><div className="h-4 bg-gray-100 rounded-full w-20" /></td>
                    </tr>
                  ))
                ) : !customers?.recentOrders || customers.recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[var(--foreground-muted)]">No recent store orders found.</td>
                  </tr>
                ) : (
                  customers.recentOrders.map((order: any) => (
                    <tr key={order.id} className="hover:bg-[#fbfaf7] transition-colors">
                      <td className="py-3 pr-4">
                        <p className="font-bold text-black truncate max-w-[120px]">{order.customerName}</p>
                        <p className="text-[10px] text-[var(--foreground-muted)] truncate max-w-[120px]">{order.customerEmail}</p>
                      </td>
                      <td className="py-3 px-4 text-[var(--foreground-muted)] truncate max-w-[200px]" title={order.productsSummary}>
                        {order.productsSummary}
                      </td>
                      <td className="py-3 px-4 font-bold text-[#1d231f]">{formatCurrency(order.amount)}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full font-semibold text-[9px] uppercase ${
                          order.status === 'PAID' || order.status === 'FULFILLED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : order.status === 'PAYMENT_PENDING'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="py-3 pl-4 text-right text-[var(--foreground-muted)]">
                        {new Date(order.date).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
