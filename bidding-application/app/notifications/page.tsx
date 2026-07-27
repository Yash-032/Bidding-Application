'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';
import { useToast } from '@/app/components/Toast';
import { getNotifications, markNotificationRead, type NotificationItem } from '@/lib/api';

export default function NotificationsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);

  async function loadNotifications() {
    try {
      const res = await getNotifications(unreadOnly);
      setNotifications(res.notifications);
    } catch (err: any) {
      toast(err.message || 'Failed to fetch notifications', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) {
      router.push('/auth');
      return;
    }
    loadNotifications();
  }, [user, router, unreadOnly]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      toast('Notification marked as read', 'success');
      loadNotifications();
    } catch (err: any) {
      toast(err.message || 'Failed to mark notification read', 'error');
    }
  };

  const getNotificationDetails = (n: NotificationItem) => {
    // Simple helper to parse standard payloads from observer outputs
    const payload = n.payload as any;
    
    switch (n.type) {
      case 'OUTBID':
        return {
          title: '⚡ Outbid Alert',
          message: `Someone placed a higher bid of 🪙 ${payload?.amount || 'N/A'} on auction ${payload?.auctionId?.substring(0, 8) || ''}. Go raise your bid!`,
          color: 'text-[var(--accent-rose)] border-rose-500/20 bg-rose-500/5',
        };
      case 'AUCTION_WON':
        return {
          title: '🏆 Auction Won!',
          message: `Congratulations! You won the auction for product ${payload?.auctionId?.substring(0, 8) || ''} with a winning bid of 🪙 ${payload?.amount || 'N/A'}.`,
          color: 'text-[var(--accent-emerald)] border-emerald-500/20 bg-emerald-500/5',
        };
      case 'PAYMENT_SUCCESS':
        return {
          title: '🪙 Topup Successful',
          message: `Your payment was verified. Added 🪙 ${payload?.amount || 'N/A'} credits to your wallet.`,
          color: 'text-[var(--accent-amber)] border-amber-500/20 bg-amber-500/5',
        };
      case 'PAYMENT_FAILED':
        return {
          title: '❌ Topup Failed',
          message: `Your payment transaction failed to reconcile. Please check with your gateway reference.`,
          color: 'text-red-400 border-red-500/20 bg-red-500/5',
        };
      default:
        return {
          title: '🔔 System Notification',
          message: JSON.stringify(payload || {}),
          color: 'text-white border-[var(--border)] bg-[var(--surface)]',
        };
    }
  };

  if (loading && notifications.length === 0) {
    return (
      <div className="page-container flex flex-col gap-6 max-w-4xl">
        <div className="skeleton h-12 w-1/4" />
        <div className="skeleton h-20 w-full" />
        <div className="skeleton h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="page-container max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-10">
        <div>
          <h1 className="page-title text-white">Notifications</h1>
          <p className="page-subtitle mb-0">Stay updated on live bidding, outbids, and balance updates.</p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={() => setUnreadOnly(!unreadOnly)}
              className="mr-2 accent-[var(--primary)]"
            />
            Unread Only
          </label>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-4 animate-slideUp">
        {notifications.length > 0 ? (
          notifications.map((n) => {
            const details = getNotificationDetails(n);
            return (
              <div
                key={n.id}
                className={`border rounded-xl p-5 flex items-start justify-between gap-4 transition-all ${
                  !n.isRead ? 'ring-1 ring-[var(--primary)]' : ''
                } ${details.color}`}
              >
                <div>
                  <h4 className="font-bold text-md mb-1 flex items-center gap-2">
                    {details.title}
                    {!n.isRead && (
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)] animate-ping" />
                    )}
                  </h4>
                  <p className="text-sm text-[var(--foreground-muted)] mb-3 leading-relaxed">
                    {details.message}
                  </p>
                  <span className="text-[10px] text-[var(--foreground-subtle)] block">
                    Received: {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>

                {!n.isRead && (
                  <button
                    onClick={() => handleMarkAsRead(n.id)}
                    className="btn-secondary btn-small whitespace-nowrap text-xs cursor-pointer"
                  >
                    Mark read
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <div className="glass-card-static p-16 text-center">
            <span className="text-5xl mb-4 block">📭</span>
            <h3 className="font-semibold text-lg text-white mb-1">All Caught Up!</h3>
            <p className="text-sm text-[var(--foreground-muted)]">You have no new notifications at this time.</p>
          </div>
        )}
      </div>
    </div>
  );
}
