'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuctionCard from '@/app/components/AuctionCard';
import { getFitRecommendations, type ProductListItem } from '@/lib/api';

export default function MyFitShopPage() {
  const [products, setProducts] = useState<
    (ProductListItem & { fitDistance: number })[]
  >([]);
  const [error, setError] = useState('');

  useEffect(() => {
    getFitRecommendations()
      .then((data) => {
        setProducts(data.products);
      })
      .catch((reason: Error) => {
        setError(reason.message);
      });
  }, []);

  return (
    <div className="shop-page">
      <header className="shop-header">
        <p className="eyebrow">Pixa fit match</p>

        <h1>Garments for your fit</h1>

        <p>
          These in-stock garments are ranked by the nearest measurement profile.
        </p>
      </header>

      {error ? (
        <div className="shop-empty">
          <h2>Your fit profile needs attention</h2>

          <p>{error}</p>

          <Link href="/fit">View fit profile</Link>
        </div>
      ) : products.length ? (
        <div className="product-grid">
          {products.map((product) => (
            <AuctionCard
              key={product.id}
              product={product}
            />
          ))}
        </div>
      ) : (
        <div className="shop-empty">
          <p>Finding your closest matches…</p>
        </div>
      )}
    </div>
  );
}