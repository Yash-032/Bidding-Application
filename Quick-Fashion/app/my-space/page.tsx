'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ProductSliderCard from '@/app/components/ProductSliderCard';
import AuctionCard from '@/app/components/AuctionCard';
import { getUserAssignedProducts, listProducts, type ProductListItem } from '@/lib/api';
import { useAuth } from '@/app/contexts/AuthContext';

export default function MySpacePage() {
  const { user, loading } = useAuth();
  const [userProducts, setUserProducts] = useState<ProductListItem[]>([]);
  const [allProducts, setAllProducts] = useState<ProductListItem[]>([]);
  const [fetching, setFetching] = useState(true);

  const sliderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    setFetching(true);
    Promise.all([
      getUserAssignedProducts().catch(() => ({ products: [] })),
      listProducts(),
    ])
      .then(([userData, catalogData]) => {
        setUserProducts(userData.products);
        setAllProducts(catalogData.products);
      })
      .finally(() => setFetching(false));
  }, [user]);

  const scrollSlider = (direction: 'left' | 'right') => {
    if (!sliderRef.current) return;
    const distance = 340;
    sliderRef.current.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  if (loading || (user && fetching)) {
    return (
      <main className="shop-page max-w-7xl mx-auto px-4 py-12">
        <div className="animate-pulse space-y-8">
          <div className="h-10 bg-neutral-200 rounded w-1/3" />
          <div className="h-64 bg-neutral-200 rounded-2xl w-full" />
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="shop-page max-w-4xl mx-auto px-4 py-20 text-center">
        <h1 className="text-3xl font-serif font-bold text-neutral-900">Your Personal Product Gallery</h1>
        <p className="mt-3 text-neutral-600">Sign in to view custom garments curated and created exclusively for you.</p>
        <Link
          href="/auth"
          className="mt-6 inline-block rounded-full bg-black px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-neutral-800"
        >
          Sign in to your space &rarr;
        </Link>
      </main>
    );
  }

  return (
    <main className="shop-page max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-16">
      {/* Header section */}
      <header className="shop-header">
        <p className="eyebrow">YOUR PERSONAL STORE</p>
        <h1>Personal Garment Gallery</h1>
        <p>
          {userProducts.length > 0
            ? `Exclusive custom garments designed specifically for ${user.email}.`
            : 'Explore your personal catalog and collection below.'}
        </p>
      </header>

      {/* User Specific Products Section (Slider fashion) */}
      <section className="relative space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)] font-semibold">CURATED FOR YOU</p>
            <h2 className="text-2xl font-serif font-bold text-[var(--foreground)]">Your Custom Collection</h2>
          </div>
          {userProducts.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => scrollSlider('left')}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-lg font-bold text-neutral-700 shadow-sm transition hover:bg-neutral-100"
                aria-label="Scroll left"
              >
                &larr;
              </button>
              <button
                onClick={() => scrollSlider('right')}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-lg font-bold text-neutral-700 shadow-sm transition hover:bg-neutral-100"
                aria-label="Scroll right"
              >
                &rarr;
              </button>
            </div>
          )}
        </div>

        {userProducts.length > 0 ? (
          <div
            ref={sliderRef}
            className="flex gap-6 overflow-x-auto scroll-smooth pb-4 pt-2 scrollbar-none snap-x snap-mandatory"
          >
            {userProducts.map((product) => (
              <div key={product.id} className="w-[280px] sm:w-[320px] shrink-0 snap-start">
                <ProductSliderCard product={product} />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center bg-neutral-50/50">
            <p className="text-sm font-medium text-neutral-600">
              No personalized garments assigned to your account yet. Our stylists are preparing your custom gallery.
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Explore our full Quick Fashion collection below in the meantime.
            </p>
          </div>
        )}
      </section>

      {/* General Catalog Collection Section */}
      {/* <section className="space-y-6 pt-6 border-t border-[var(--border)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)] font-semibold">EXPLORE</p>
            <h2 className="text-2xl font-serif font-bold text-[var(--foreground)]">Quick Fashion Collection</h2>
          </div>
          <Link href="/shop" className="text-sm font-semibold text-emerald-700 hover:underline">
            View full shop catalog &rarr;
          </Link>
        </div>

        <div className="product-grid">
          {allProducts.map((product) => (
            <AuctionCard key={product.id} product={product} />
          ))}
        </div>
      </section> */}
    </main>
  );
}