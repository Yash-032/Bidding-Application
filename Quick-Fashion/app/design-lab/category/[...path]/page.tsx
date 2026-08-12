'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ShoppingBag } from 'lucide-react';
import { useParams } from 'next/navigation';
import DesignLabCanvasImage from '@/app/design-lab/DesignLabCanvasImage';
import type { ProductListItem } from '@/lib/api';
import { loadDesignLabProducts } from '../../lib';

export default function DesignLabCategoryPage() {
  const params = useParams<{ path: string[] }>();
  const categoryPath = useMemo(() => (params.path ?? []).join('/'), [params.path]);
  const categoryName = decodeURIComponent(params.path?.at(-1) ?? 'Collection').replaceAll('-', ' ');
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<'next' | 'previous'>('next');
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [visitedIds, setVisitedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadDesignLabProducts(categoryPath)
      .then((items) => {
        if (!cancelled) setProducts(items);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('[design-lab-catalog]', error);
          setProducts([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [categoryPath]);

  const product = products[index];

  useEffect(() => {
    if (!product) return;
    setVisitedIds((current) => {
      if (current.has(product.id)) return current;
      const next = new Set(current);
      next.add(product.id);
      return next;
    });
  }, [product]);

  const move = (step: number) => {
    if (products.length < 2) return;
    setDirection(step > 0 ? 'next' : 'previous');
    setIndex((current) => (current + step + products.length) % products.length);
  };

  const mountedProducts = products.filter((item) => item.id === product?.id || visitedIds.has(item.id));
  const nextProducts = products.filter((_, itemIndex) => itemIndex !== index).slice(index, index + 2);

  if (loading) {
    return <main className="dl-shell dl-loading"><span /><p>Preparing {categoryName}</p></main>;
  }

  if (!product) {
    return (
      <main className="dl-shell dl-no-products">
        <p>No garments are listed in {categoryName} yet.</p>
        <Link href="/design-lab">Return to categories</Link>
      </main>
    );
  }

  return (
    <main className="dl-product-page">
      <Link className="dl-back-link" href="/design-lab"><ArrowLeft size={15} /> {categoryName}</Link>

      <section
        className="dl-product-stage"
        data-direction={direction}
        onTouchStart={(event) => setTouchStart(event.changedTouches[0]?.clientX ?? null)}
        onTouchEnd={(event) => {
          if (touchStart === null) return;
          const distance = (event.changedTouches[0]?.clientX ?? touchStart) - touchStart;
          if (Math.abs(distance) > 45) move(distance < 0 ? 1 : -1);
          setTouchStart(null);
        }}
      >
        <article className="dl-product-info" key={product.id}>
          <p className="dl-kicker">{categoryName}</p>
          <h1>{product.title}</h1>
          <p className="dl-product-description">{product.description}</p>
          <div className="dl-size-row">
            <span>Size</span>
            <div>{product.availableSizes.slice(0, 5).map((size) => <b key={size}>{size}</b>)}</div>
          </div>
          <div className="dl-price-row">
            <span className="dl-bag-icon"><ShoppingBag size={20} /></span>
            <div>
              <Link href={`/products/${product.id}`}>View garment</Link>
              <strong>₹{Number(product.priceInRupees).toLocaleString('en-IN')}</strong>
            </div>
          </div>
        </article>

        <div className="dl-main-garment">
          <div className="dl-garment-shadow" />
          <div className="dl-garment-stack">
            {mountedProducts.map((item) => {
              const active = item.id === product.id;
              return (
                <Link
                  href={`/products/${item.id}`}
                  key={item.id}
                  className={`dl-garment-slide ${active ? 'active' : 'cached'}`}
                  aria-hidden={!active}
                  tabIndex={active ? 0 : -1}
                >
                  <DesignLabCanvasImage
                    image={item.protectedImages[0]}
                    alt={item.title}
                    className="dl-canvas-contain"
                  />
                </Link>
              );
            })}
          </div>
        </div>

        <aside className="dl-product-next">
          <p>Up next</p>
          <div className="dl-next-list">
            {nextProducts.map((item) => (
              <button type="button" key={item.id} onClick={() => {
                setDirection('next');
                setIndex(products.findIndex((candidate) => candidate.id === item.id));
              }}>
                <DesignLabCanvasImage
                  image={item.protectedImages[0]}
                  alt={item.title}
                  className="dl-canvas-contain"
                />
                <span>{item.title}</span>
              </button>
            ))}
          </div>
        </aside>

        <button className="dl-product-arrow previous" type="button" onClick={() => move(-1)} aria-label="Previous garment">
          <ArrowLeft size={22} />
        </button>
        <button className="dl-product-arrow next" type="button" onClick={() => move(1)} aria-label="Next garment">
          <ArrowRight size={22} />
        </button>
      </section>

      <div className="dl-product-progress">
        <span>{String(index + 1).padStart(2, '0')}</span>
        <i><b style={{ width: `${((index + 1) / products.length) * 100}%` }} /></i>
        <span>{String(products.length).padStart(2, '0')}</span>
      </div>
    </main>
  );
}
