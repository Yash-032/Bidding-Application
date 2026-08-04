'use client';

import React, { useEffect, useState, use } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';
import { useToast } from '@/app/components/Toast';
import { getProductDetail, watchAuction, unwatchAuction, placeBid, getWallet, type ProductDetail } from '@/lib/api';
import CountdownTimer from '@/app/components/CountdownTimer';
import ProtectedProductImage from '@/app/components/ProtectedProductImage';

export default function AuctionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const auctionId = params.id as string;
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState('');
  const [isWatching, setIsWatching] = useState(false);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [submittingBid, setSubmittingBid] = useState(false);

  async function loadData() {
    try {
      const res = await getProductDetail(auctionId);
      setProduct(res);

      if (user) {
        const wallet = await getWallet();
        setWalletBalance(wallet.availableBalance);
      }
    } catch (err: any) {
      console.error(err);
      toast(err.message || 'Failed to load auction details', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // Poll for live bids and updates every 4 seconds
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, [auctionId, user]);

  const handleWatchToggle = async () => {
    if (!user) {
      toast('Please log in to watch auctions', 'error');
      router.push('/auth');
      return;
    }

    try {
      if (isWatching) {
        await unwatchAuction(product?.auction?.id || '');
        setIsWatching(false);
        toast('Removed from watchlist', 'success');
      } else {
        await watchAuction(product?.auction?.id || '');
        setIsWatching(true);
        toast('Added to watchlist', 'success');
      }
    } catch (err: any) {
      toast(err.message || 'Failed to update watchlist', 'error');
    }
  };

  const handlePlaceBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast('Please log in to place a bid', 'error');
      router.push('/auth');
      return;
    }

    if (!product?.auction) return;

    const amount = BigInt(bidAmount || '0');
    if (amount <= BigInt(0)) {
      toast('Please enter a valid bid amount', 'error');
      return;
    }

    setSubmittingBid(true);
    try {
      // Generate a unique idempotency key for this bid session
      const idempotencyKey = `bid-${user.id}-${Date.now()}`;
      await placeBid(product.auction.id, bidAmount, idempotencyKey);
      toast('Bid placed successfully!', 'success');
      setBidAmount('');
      loadData();
    } catch (err: any) {
      toast(err.message || 'Failed to place bid', 'error');
    } finally {
      setSubmittingBid(false);
    }
  };

  if (loading && !product) {
    return (
      <div className="page-container flex flex-col gap-6">
        <div className="skeleton h-12 w-1/3" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 skeleton h-[400px]" />
          <div className="skeleton h-[400px]" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="page-container text-center py-20">
        <h2 className="text-2xl font-bold text-black mb-2">Auction Not Found</h2>
        <p className="text-[var(--foreground-muted)]">The listing you requested does not exist or has been removed.</p>
      </div>
    );
  }

  const auction = product.auction;
  const isLive = auction?.status === 'ACTIVE';
  const isScheduled = auction?.status === 'SCHEDULED';
  const isClosed = auction?.status === 'CLOSED';
  const isCancelled = auction?.status === 'CANCELLED';

  const highestBid = auction?.bids?.[0] || null;
  const minRequiredBid = highestBid
    ? BigInt(highestBid.amountCredits) + BigInt(auction?.minIncrement || '1')
    : BigInt(auction?.startingPriceCredits || '0');

  return (
    <div className="page-container">
      {/* Back navigation & Watch button */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={() => router.back()}
          className="text-sm text-[var(--foreground-muted)] hover:text-black transition-colors"
        >
          &larr; Back to Catalog
        </button>

        {auction && (
          <button
            onClick={handleWatchToggle}
            className={`btn-secondary btn-small flex items-center gap-1.5 ${
              isWatching ? 'border-[var(--primary)] text-[var(--primary)]' : ''
            }`}
          >
            {isWatching ? '⭐️ Watching' : '☆ Watch Auction'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Content - Product Info */}
        <div className="lg:col-span-2 space-y-6 animate-slideUp">
          {/* Main Info Card */}
          <div className="glass-card-static p-6 overflow-hidden">
            <div className="relative aspect-video w-full bg-black/40 rounded-lg overflow-hidden mb-6">
              <ProtectedProductImage
                image={product.protectedImages[0]}
                alt={product.title}
                className="w-full h-full"
                eager
              />
            </div>

            <div className="flex items-center gap-3 mb-4">
              {isLive && <span className="badge badge-active">Live Auction</span>}
              {isScheduled && <span className="badge badge-scheduled">Scheduled</span>}
              {isClosed && <span className="badge badge-closed">Ended</span>}
              {isCancelled && <span className="badge badge-cancelled">Cancelled</span>}
              
              {auction && (
                <span className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-semibold">
                  Model: {auction.auctionModel}
                </span>
              )}
            </div>

            <h1 className="text-3xl font-extrabold text-black mb-4 leading-tight">{product.title}</h1>
            <p className="text-[var(--foreground-muted)] leading-relaxed mb-6 whitespace-pre-wrap">
              {product.description}
            </p>

            <div className="border-t border-[var(--border)] pt-6 flex items-center justify-between text-sm text-[var(--foreground-muted)]">
              <div>
                <span className="block text-xs uppercase tracking-wider text-[var(--foreground-subtle)] font-medium">Seller Contact</span>
                <span className="text-black font-medium">{product.seller?.email}</span>
              </div>
              <div className="text-right">
                <span className="block text-xs uppercase tracking-wider text-[var(--foreground-subtle)] font-medium">Starting Price</span>
                <span className="font-mono text-black font-semibold">🪙 {auction?.startingPriceCredits} Credits</span>
              </div>
            </div>
          </div>

          {/* Bid History */}
          <div className="glass-card-static p-6">
            <h3 className="text-lg font-bold text-black mb-4">Bid Log History</h3>
            
            {auction?.bids && auction.bids.length > 0 ? (
              <div className="flow-root">
                <ul className="-my-5 divide-y divide-[var(--border)]">
                  {auction.bids.map((bid, index) => (
                    <li key={bid.id} className="py-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full ${index === 0 && isLive ? 'bg-[var(--accent-emerald)] animate-pulse' : 'bg-[var(--border)]'}`} />
                        <div>
                          <p className="text-sm font-semibold text-black">
                            Bidder: {bid.user.profile?.fullName || `User ${bid.user.id.slice(0, 8)}`}
                            {index === 0 && <span className="text-xs text-[var(--foreground-muted)] font-normal ml-2">(Highest)</span>}
                          </p>
                          <p className="text-xs text-[var(--foreground-subtle)]">
                            {new Date(bid.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-[var(--accent-amber)]">🪙 {bid.amountCredits}</span>
                        <span className={`block text-[10px] uppercase font-bold tracking-wider ${
                          bid.status === 'WON' ? 'text-[var(--accent-emerald)]' :
                          bid.status === 'OUTBID' ? 'text-[var(--foreground-muted)]' :
                          bid.status === 'LOST' ? 'text-[var(--foreground-subtle)]' :
                          'text-[var(--accent-emerald)]'
                        }`}>
                          {bid.status}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-[var(--foreground-muted)] text-center py-8">No bids have been placed yet.</p>
            )}
          </div>
        </div>

        {/* Right Panel - Bidding Module */}
        <div className="space-y-6">
          <div className="glass-card p-6 border-[var(--primary)] shadow-[var(--shadow-glow)] animate-slideUp stagger-1">
            <h3 className="text-lg font-bold text-black mb-6">Auction Panel</h3>

            {auction ? (
              <div className="space-y-6">
                {/* Timer details */}
                <div className="bg-[var(--background-secondary)] p-4 rounded-xl border border-[var(--border)] text-center">
                  <span className="block text-xs uppercase tracking-wider text-[var(--foreground-muted)] mb-2 font-medium">
                    {isLive ? 'Time Remaining' : isScheduled ? 'Starts In' : 'Auction Status'}
                  </span>
                  
                  {isLive ? (
                    <CountdownTimer
                      endTime={auction.endTime}
                      antiSnipingWindowSeconds={auction.antiSnipingWindowSeconds}
                      className="text-lg"
                    />
                  ) : isScheduled ? (
                    <span className="text-white font-semibold">Starts: {new Date(auction.startTime).toLocaleString()}</span>
                  ) : (
                    <span className="text-black font-bold text-lg uppercase tracking-wider">{auction.status}</span>
                  )}
                </div>

                {/* Bid details summary */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[var(--background-secondary)] p-3 rounded-lg border border-[var(--border)]">
                    <span className="block text-[10px] uppercase tracking-wider text-[var(--foreground-subtle)]">Current Price</span>
                    <span className="font-mono text-gray font-bold text-lg">
                      🪙 {highestBid ? highestBid.amountCredits : auction.startingPriceCredits}
                    </span>
                  </div>
                  <div className="bg-[var(--background-secondary)] p-3 rounded-lg border border-[var(--border)]">
                    <span className="block text-[10px] uppercase tracking-wider text-[var(--foreground-subtle)]">Min Next Bid</span>
                    <span className="font-mono text-[var(--accent-emerald)] font-bold text-lg">
                      🪙 {minRequiredBid.toString()}
                    </span>
                  </div>
                </div>

                {/* Form to Bid */}
                {isLive && (
                  <form onSubmit={handlePlaceBid} className="space-y-4">
                    {walletBalance !== null && (
                      <div className="flex justify-between items-center text-xs text-[var(--foreground-muted)]">
                        <span>Your Wallet:</span>
                        <span className="font-semibold text-[var(--accent-amber)] font-mono">🪙 {walletBalance} Credits</span>
                      </div>
                    )}

                    <div>
                      <label className="input-label">Your Bid Amount</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[var(--foreground-subtle)]"></span>
                        <input
                          type="number"
                          placeholder={minRequiredBid.toString()}
                          value={bidAmount}
                          onChange={(e) => setBidAmount(e.target.value)}
                          className="input-field pl-8 font-mono"
                          required
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={submittingBid}
                      className="w-full btn-primary py-3 font-bold text-sm tracking-wide"
                    >
                      {submittingBid ? 'Submitting Bid...' : 'Place Bid ⚡'}
                    </button>
                  </form>
                )}

                {!isLive && (
                  <div className="text-center p-4 bg-white/5 rounded-lg border border-[var(--border)] text-sm text-[var(--foreground-muted)]">
                    {isScheduled && 'This auction has not started yet.'}
                    {isClosed && 'This auction has ended.'}
                    {isCancelled && 'This auction was voided by an administrator.'}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--foreground-muted)]">No auction is associated with this listing.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
