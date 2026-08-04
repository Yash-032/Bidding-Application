'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { listProducts, type ProductListItem } from '@/lib/api';
import AuctionCard from '../components/AuctionCard';

function BrowseContent() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [endingSoon, setEndingSoon] = useState(false);

  useEffect(() => {
    const querySearch = searchParams.get('search') ?? '';
    setSearch(querySearch);
    
    async function loadAuctions() {
      setLoading(true);
      try {
        const res = await listProducts({
          search: querySearch || undefined,
          auctionsOnly: true,
          endingSoon: endingSoon,
        });
        setProducts(res.products);
      } catch (err) {
        console.error('Failed to load browse auctions', err);
      } finally {
        setLoading(false);
      }
    }
    loadAuctions();
  }, [searchParams, endingSoon]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sp = new URLSearchParams(window.location.search);
    if (search) {
      sp.set('search', search);
    } else {
      sp.delete('search');
    }
    window.history.pushState({}, '', `${window.location.pathname}?${sp.toString()}`);
  };

  const auctionProducts = products.filter((product) =>
    product.auction && ['ACTIVE', 'SCHEDULED'].includes(product.auction.status)
  );

  return (
    <div className="page-container">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-10">
        <div>
          <h1 className="page-title">Private Auctions</h1>
          <p className="page-subtitle mb-0">Bid only on garments selected and activated by an administrator. All other garments remain available in the regular shop.</p>
        </div>
        
        {/* Toggle Filters */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setEndingSoon(!endingSoon)}
            className={`btn-secondary btn-small ${endingSoon ? 'border-[var(--primary)] text-white bg-[var(--surface-active)]' : ''}`}
          >
            ⏰ Ending Soon First
          </button>
        </div>
      </div>

      {/* Search Input Bar */}
      <form onSubmit={handleSearchSubmit} className="mb-10 flex gap-3 max-w-xl">
        <input
          type="text"
          placeholder="Search items by title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field"
        />
        <button type="submit" className="btn-primary px-8">
          Filter
        </button>
      </form>

      {/* Listings Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="glass-card-static h-[380px] p-5 flex flex-col gap-4">
              <div className="skeleton aspect-video w-full" />
              <div className="skeleton h-6 w-3/4" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-10 w-full mt-auto" />
            </div>
          ))}
        </div>
      ) : auctionProducts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-slideUp">
          {auctionProducts.map((product) => (
            <AuctionCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="glass-card-static p-16 text-center max-w-md mx-auto">
          <span className="text-5xl mb-4 block">🔍</span>
          <h3 className="font-semibold text-lg text-white mb-2">No Matching Auctions</h3>
          <p className="text-sm text-[var(--foreground-muted)] mb-6">
            We couldn&apos;t find any auctions matching your search term. Try adjusting your query or filters.
          </p>
          <button
            onClick={() => {
              setSearch('');
              window.history.pushState({}, '', window.location.pathname);
            }}
            className="btn-secondary"
          >
            Reset Search
          </button>
        </div>
      )}
    </div>
  );
}

export default function BrowseAuctionsPage() {
  return (
    <Suspense fallback={
      <div className="page-container flex items-center justify-center min-h-[400px]">
        <div className="skeleton h-20 w-80" />
      </div>
    }>
      <BrowseContent />
    </Suspense>
  );
}
