'use client';

import Link from 'next/link';
import { type ProductListItem } from '@/lib/api';
import CountdownTimer from './CountdownTimer';

export default function AuctionCard({ product }: { product: ProductListItem }) {
  const auction = product.auction;
  const isLive = auction?.status === 'ACTIVE';
  const imageUrl = product.images?.[0] || 'https://images.unsplash.com/photo-1617137968427-85924c800a22?auto=format&fit=crop&w=900&q=85';

  return (
    <article className="product-card">
      <Link href={`/products/${product.id}`} className="product-image">
        <img src={imageUrl} alt={product.title} />
        {isLive && <span className="status-label is-live">Live auction available</span>}
        <span className="quick-view">View piece</span>
      </Link>
      <div className="product-info">
        <div>
          <p className="product-kicker">{isLive ? 'Available to buy or bid' : product.categoryNode?.name || 'The Reserve collection'}</p>
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
