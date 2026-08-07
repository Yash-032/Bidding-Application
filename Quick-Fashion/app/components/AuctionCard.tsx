'use client';

import Link from 'next/link';
import { type ProductListItem } from '@/lib/api';
import CountdownTimer from './CountdownTimer';
import ProtectedProductImage from './ProtectedProductImage';

export default function AuctionCard({ product, reason }: { product: ProductListItem; reason?: string | null }) {
  const auction = product.auction;
  const isLive = auction?.status === 'ACTIVE';

  return (
    <article className="product-card">
      <Link href={`/products/${product.id}`} className="product-image">
        <ProtectedProductImage image={product.protectedImages[0]} alt={product.title} />
        {isLive && <span className="status-label is-live">Live auction available</span>}
        <span className="quick-view">View piece</span>
      </Link>
      <div className="product-info">
        <div>
          {reason && reason !== 'New arrival' && <p className="product-recommendation-reason">{reason}</p>}
          <p className="product-kicker">{isLive ? 'Available to buy or bid' : product.categoryNode?.name || 'Quick Fashion collection'}</p>
          <h3><Link href={`/products/${product.id}`}>{product.title}</Link></h3>
        </div>
        <p className="product-price">₹{Number(product.priceInRupees || 0).toLocaleString('en-IN')}</p>
      </div>
      {isLive && auction && <div className="card-timer"><span>Closing in</span><CountdownTimer endTime={auction.endTime} antiSnipingWindowSeconds={auction.antiSnipingWindowSeconds} /></div>}
      <div className="card-actions">
        <Link href={`/products/${product.id}`} className="button-dark">Choose option</Link>
        <Link href={isLive ? `/auctions/${product.id}` : `/products/${product.id}`} className="button-outline">{isLive ? 'Place a bid' : 'View details'}</Link>
      </div>
    </article>
  );
}
