'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';
import { useToast } from '@/app/components/Toast';
import { getWallet, adminAdjustCredits, type WalletData } from '@/lib/api';

export default function WalletPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyAmount, setBuyAmount] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  async function loadWallet() {
    try {
      const res = await getWallet();
      setWallet(res);
    } catch (err: any) {
      toast(err.message || 'Failed to fetch wallet info', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) {
      router.push('/auth');
      return;
    }
    loadWallet();
  }, [user, router]);

  const handleBuyMockCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(buyAmount);
    if (isNaN(amount) || amount <= 0) {
      toast('Please enter a valid credit amount', 'error');
      return;
    }

    try {
      // Simulate/mock payment by using direct adjustment (or just notification that the actual payment is pending integration)
      // Since payment system isn't implemented, we allow adding mock credits via admin adjustment API directly to let them test!
      // This is a great developer utility for testing the application workflow.
      await adminAdjustCredits(user?.id || '', buyAmount, 'Mock Credit Purchase (Testing Sandbox)');
      toast(`Successfully loaded 🪙 ${buyAmount} credits into your wallet!`, 'success');
      setBuyAmount('');
      setModalOpen(false);
      loadWallet();
    } catch (err: any) {
      toast(err.message || 'Failed to purchase credits', 'error');
    }
  };

  if (loading) {
    return (
      <div className="page-container flex flex-col gap-6">
        <div className="skeleton h-12 w-1/4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="skeleton h-40" />
          <div className="skeleton h-40" />
        </div>
      </div>
    );
  }

  return (
    <div className="page-container max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-10">
        <div>
          <h1 className="page-title text-white">My Wallet Balance</h1>
          <p className="page-subtitle mb-0">Manage credits, inspect statements, and buy virtual bid credits.</p>
        </div>

        <button onClick={() => setModalOpen(true)} className="btn-primary">
          🪙 Purchase Bid Credits
        </button>
      </div>

      {/* Balance Summary Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        {/* Available Balance */}
        <div className="glass-card-static p-6 border-l-4 border-[var(--accent-amber)] bg-gradient-to-r from-[var(--surface)] to-amber-500/5">
          <span className="block text-xs uppercase tracking-wider text-[var(--foreground-muted)] mb-2 font-medium">
            Available Credits
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white font-mono">
              🪙 {wallet?.availableBalance}
            </span>
            <span className="text-xs text-[var(--foreground-muted)]">Credits</span>
          </div>
          <p className="text-xs text-[var(--foreground-subtle)] mt-3">
            Available for immediate bidding. Released bids are instantly returned here.
          </p>
        </div>

        {/* Locked Balance */}
        <div className="glass-card-static p-6 border-l-4 border-[var(--primary)] bg-gradient-to-r from-[var(--surface)] to-violet-500/5">
          <span className="block text-xs uppercase tracking-wider text-[var(--foreground-muted)] mb-2 font-medium">
            Locked Credits
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white font-mono">
              🪙 {wallet?.lockedBalance}
            </span>
            <span className="text-xs text-[var(--foreground-muted)]">Credits</span>
          </div>
          <p className="text-xs text-[var(--foreground-subtle)] mt-3">
            Credits currently tied to active bids. Will return if outbid, or deducted if won.
          </p>
        </div>
      </div>

      {/* Ledger History List */}
      <div className="glass-card-static p-6">
        <h3 className="text-lg font-bold text-white mb-6">Recent Ledger Statements</h3>

        {wallet?.recentLedger && wallet.recentLedger.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-[10px] uppercase font-bold tracking-wider text-[var(--foreground-subtle)]">
                  <th className="pb-3 pl-3">Transaction</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Amount</th>
                  <th className="pb-3">Balance After</th>
                  <th className="pb-3 pr-3 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] text-sm text-white">
                {wallet.recentLedger.map((entry) => {
                  const isPositive = Number(entry.amount) > 0;
                  return (
                    <tr key={entry.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-4 pl-3">
                        <span className="font-mono text-xs text-[var(--foreground-muted)]">
                          {entry.referenceId ? `Ref: ${entry.referenceId.substring(0, 12)}...` : 'N/A'}
                        </span>
                      </td>
                      <td className="py-4">
                        <span className="badge font-bold text-[10px] bg-[var(--surface-active)] text-white border border-[var(--border)]">
                          {entry.type}
                        </span>
                      </td>
                      <td className={`py-4 font-mono font-semibold ${isPositive ? 'text-[var(--accent-emerald)]' : 'text-[var(--accent-rose)]'}`}>
                        {isPositive ? '+' : ''}🪙 {entry.amount}
                      </td>
                      <td className="py-4 font-mono text-[var(--foreground-muted)]">
                        🪙 {entry.balanceAfter}
                      </td>
                      <td className="py-4 pr-3 text-right text-xs text-[var(--foreground-subtle)]">
                        {new Date(entry.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[var(--foreground-muted)] text-center py-10">No ledger entries found.</p>
        )}
      </div>

      {/* Credit Purchase Mock Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full p-8 animate-fadeIn">
            <h3 className="text-xl font-bold text-white mb-2">Purchase Bid Credits</h3>
            <p className="text-xs text-[var(--foreground-muted)] mb-6">
              Enter the amount of virtual credits you want to add.
              <span className="block mt-2 font-medium text-[var(--accent-amber)]">
                💡 Note: Sandbox Mode enabled. Real payment gateway integrations are pending. Credits will be adjusted directly.
              </span>
            </p>

            <form onSubmit={handleBuyMockCredits} className="space-y-5">
              <div>
                <label className="input-label">Credits Amount</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[var(--foreground-subtle)]">🪙</span>
                  <input
                    type="number"
                    placeholder="100"
                    value={buyAmount}
                    onChange={(e) => setBuyAmount(e.target.value)}
                    className="input-field pl-8 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="btn-secondary font-semibold"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary font-bold">
                  Simulate Purchase
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
