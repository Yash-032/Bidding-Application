'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import ProtectedProductImage from '@/app/components/ProtectedProductImage';
import type { ProductListItem } from '@/lib/api';

export default function ProductSliderCard({ product }: { product: ProductListItem }) {
  const [isHovered, setIsHovered] = useState(false);

  const frontImage = useMemo(() => {
    return (
      product.protectedImages.find((img) => img.viewType === 'FRONT') ||
      product.protectedImages[0]
    );
  }, [product.protectedImages]);

  const backImage = useMemo(() => {
    return (
      product.protectedImages.find((img) => img.viewType === 'BACK') ||
      (product.protectedImages.length > 1 ? product.protectedImages[1] : null)
    );
  }, [product.protectedImages]);

  const modelImage = useMemo(() => {
    return product.protectedImages.find((img) => img.viewType === 'MODEL');
  }, [product.protectedImages]);

  const activeImage = isHovered && backImage ? backImage : frontImage;

  return (
    <Link
      href={`/products/${product.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background-card,#ffffff)] shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#e4dfd6]">
        {/* Active view image container with smooth opacity transition */}
        <div className="absolute inset-0 transition-opacity duration-500">
          <ProtectedProductImage
            key={activeImage?.id}
            image={activeImage}
            alt={`${product.title} ${isHovered && backImage ? 'Back View' : 'Front View'}`}
            eager
          />
        </div>

        {/* View Badge indicator: Only show Back View badge on hover */}
        {isHovered && backImage && (
          <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1">
            <span className="rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-white uppercase backdrop-blur-md">
              Back View
            </span>
          </div>
        )}

        {/* Hover prompt tooltip if back image is available */}
        {backImage && !isHovered && (
          <div className="absolute bottom-3 right-3 z-10 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-medium text-black opacity-0 shadow-sm transition-opacity duration-300 group-hover:opacity-100 backdrop-blur-sm">
            Hover for Back View ↻
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <span className="text-[11px] font-semibold tracking-widest text-[var(--foreground-muted)] uppercase">
          {product.categoryNode?.name || product.category}
        </span>
        <h3 className="mt-1 line-clamp-1 text-base font-serif font-semibold text-[var(--foreground)]">
          {product.title}
        </h3>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-lg font-bold text-[var(--foreground)]">
            ₹{Number(product.priceInRupees).toLocaleString('en-IN')}
          </span>
          <span className="text-xs font-semibold text-emerald-600 underline group-hover:text-emerald-700">
            View full garment &rarr;
          </span>
        </div>
      </div>
    </Link>
  );
}
