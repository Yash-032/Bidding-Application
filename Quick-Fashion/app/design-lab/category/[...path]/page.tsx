'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ShoppingBag } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import DesignLabCanvasImage from '@/app/design-lab/DesignLabCanvasImage';
import { GuestPrice } from '@/app/components/GuestPrice';
import { recordCategoryInteraction, type ProductListItem } from '@/lib/api';
import { loadDesignLabProducts } from '../../lib';

function garmentTitleLines(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 3) return [words.join(' ')];

  const lines: string[] = [];
  const firstLineSize = words.length === 4 ? 2 : 3;
  lines.push(words.splice(0, firstLineSize).join(' '));

  while (words.length) {
    lines.push(words.splice(0, 3).join(' '));
  }

  return lines;
}

export default function DesignLabCategoryPage() {
  const params = useParams<{ path: string[] }>();
  const searchParams = useSearchParams();
  const categoryId = searchParams.get('categoryId');
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
    if (!categoryId) return;

    const startedAt = Date.now();
    let dwellSent = false;

    recordCategoryInteraction('PRODUCT_VIEW', categoryId).catch(() => undefined);

    const sendDwell = () => {
      if (dwellSent) return;
      dwellSent = true;

      const durationMs = Date.now() - startedAt;
      // Avoid false events from React Strict Mode's immediate development re-mount.
      if (durationMs < 1000) return;

      recordCategoryInteraction('PRODUCT_DWELL', categoryId, durationMs).catch(() => undefined);
    };

    window.addEventListener('pagehide', sendDwell);
    return () => {
      window.removeEventListener('pagehide', sendDwell);
      sendDwell();
    };
  }, [categoryId]);

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
  const nextProduct = products.length > 1 ? products[(index + 1) % products.length] : null;

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
          <h1 aria-label={product.title}>
            {garmentTitleLines(product.title).map((line, lineIndex) => (
              <span key={`${line}-${lineIndex}`}>{line}</span>
            ))}
          </h1>
          <p className="dl-product-description">{product.description}</p>
          <div className="dl-size-row">
            <span>Size</span>
            <div>{product.availableSizes.slice(0, 5).map((size) => <b key={size}>{size}</b>)}</div>
          </div>
          <div className="dl-price-row">
            <span className="dl-bag-icon"><ShoppingBag size={20} /></span>
            <div>
              <Link href={`/products/${product.id}`}>View garment</Link>
              <GuestPrice price={product.priceInRupees} />
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

        {nextProduct && (
          <aside className="dl-product-next" aria-label={`Next garment: ${nextProduct.title}`}>
            <div className="dl-next-list">
              <button type="button" onClick={() => move(1)} aria-label={`Show ${nextProduct.title}`}>
                <DesignLabCanvasImage
                  image={nextProduct.protectedImages[0]}
                  alt=""
                  className="dl-canvas-contain"
                />
              </button>
            </div>
          </aside>
        )}

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
