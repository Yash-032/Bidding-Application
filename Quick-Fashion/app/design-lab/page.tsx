'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, MoveRight } from 'lucide-react';
import DesignLabCanvasImage from '@/app/design-lab/DesignLabCanvasImage';
import type { CategoryTreeNode, ProductListItem } from '@/lib/api';
import { categoryArtworkVersions } from '@/lib/design-lab/category-artwork-versions';
import { loadDesignLabCatalog, productBelongsToPath } from './lib';

type CategoryCard = {
  category: CategoryTreeNode;
  product?: ProductListItem;
};

const hiddenDesignLabCategories = new Set(['core essentials', 'summer drop']);
const categoryArtworkPaths = new Set([
  'shirt', 't-shirt', 'tops', 'bottoms', 'dress', 'sweater',
  'sweatshirt', 'hoodie', 'crop-tops', 'shrug', 'jackets', 'denim-jackets',
]);

function CategoryArtwork({ category, product, lens = false }: CategoryCard & { lens?: boolean }) {
  const baseClassName = lens ? 'dl-canvas-contain dl-category-lens-image' : 'dl-canvas-contain';
  const artwork = categoryArtworkVersions[category.path as keyof typeof categoryArtworkVersions];
  const artworkShapeClass = artwork && artwork.height > artwork.width
    ? 'dl-category-artwork-portrait'
    : '';
  const className = `${baseClassName} ${artworkShapeClass}`.trim();

  if (categoryArtworkPaths.has(category.path)) {
    return (
      <DesignLabCanvasImage
        manifestUrl={`/api/design-lab/category-image/${encodeURIComponent(category.path)}`}
        cacheKey={`category:artwork:${category.path}:${artwork?.version ?? 'unknown'}`}
        aspectRatio={artwork ? `${artwork.width} / ${artwork.height}` : '1 / 1'}
        pixelRatioCap={lens ? 3 : 3}
        alt={lens ? '' : `${category.name} category`}
        className={className}
        style={{
          '--dl-artwork-scale': artwork?.displayScale ?? 1.08,
          '--dl-artwork-hover-scale': artwork?.hoverScale ?? 1.12,
        } as CSSProperties}
      />
    );
  }

  if (product?.protectedImages?.[0]) {
    return (
      <DesignLabCanvasImage
        image={product.protectedImages[0]}
        pixelRatioCap={lens ? 3 : 2}
        alt={lens ? '' : product.title}
        className={className}
      />
    );
  }

  return lens ? null : <div className="dl-empty-garment">Coming soon</div>;
}

export default function DesignLabHomePage() {
  const [categories, setCategories] = useState<CategoryTreeNode[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState<'next' | 'previous'>('next');
  const wheelLock = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadDesignLabCatalog()
      .then((data) => {
        if (cancelled) return;
        setCategories(data.categories);
        setProducts(data.products);
      })
      .catch((error) => {
        if (!cancelled) console.error('[design-lab-catalog]', error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const cards = useMemo<CategoryCard[]>(
    () => categories
      .filter((category) => !hiddenDesignLabCategories.has(category.name.trim().toLowerCase()))
      .map((category) => ({
        category,
        product: products.find((product) => productBelongsToPath(product, category.path)),
      })),
    [categories, products],
  );

  const pageSize = 3;
  const totalPages = Math.max(1, Math.ceil(cards.length / pageSize));
  const visibleCards = cards.slice(page * pageSize, page * pageSize + pageSize);

  const move = (step: number) => {
    if (totalPages < 2) return;
    setDirection(step > 0 ? 'next' : 'previous');
    setPage((current) => (current + step + totalPages) % totalPages);
  };

  if (loading) {
    return <main className="dl-shell dl-loading"><span /><p>Curating categories</p></main>;
  }

  return (
    <main className="dl-shell">
      <header className="dl-header">
        <div>
          <p className="dl-kicker">Quick Fashion / Design Lab</p>
          <h1>Explore by category</h1>
        </div>
        <Link href="/categories">View all <MoveRight size={17} /></Link>
      </header>

      <section
        className="dl-category-carousel"
        data-direction={direction}
        aria-label="Garment categories"
        onWheel={(event) => {
          if (Math.abs(event.deltaY) < 20 || wheelLock.current) return;
          wheelLock.current = true;
          move(event.deltaY > 0 ? 1 : -1);
          window.setTimeout(() => { wheelLock.current = false; }, 650);
        }}
      >
        <button className="dl-edge-arrow previous" type="button" onClick={() => move(-1)} aria-label="Previous categories">
          <ArrowLeft size={21} />
        </button>

        <div className="dl-category-grid" key={page}>
          {visibleCards.map(({ category, product }, cardIndex) => (
            <Link
              className="dl-category-card"
              href={`/design-lab/category/${category.path}`}
              key={category.id}
              style={{ '--card-index': cardIndex } as React.CSSProperties}
            >
              <div
                className="dl-category-visual"
                onPointerMove={(event) => {
                  if (event.pointerType === 'touch') return;
                  const bounds = event.currentTarget.getBoundingClientRect();
                  event.currentTarget.style.setProperty('--lens-x', `${event.clientX - bounds.left}px`);
                  event.currentTarget.style.setProperty('--lens-y', `${event.clientY - bounds.top}px`);
                }}
                onPointerLeave={(event) => {
                  event.currentTarget.style.removeProperty('--lens-x');
                  event.currentTarget.style.removeProperty('--lens-y');
                }}
              >
                <span className="dl-card-number">0{page * pageSize + cardIndex + 1}</span>
                <CategoryArtwork category={category} product={product} />
                {(categoryArtworkPaths.has(category.path) || product?.protectedImages?.[0]) && (
                  <span className="dl-category-art-cursor" aria-hidden="true" />
                )}
              </div>
              <div className="dl-category-label">
                <div>
                  <h2>{category.name}</h2>
                  <p>{category.productCount ? `${category.productCount} pieces` : 'New arrivals'}</p>
                </div>
                <span><ArrowRight size={17} /></span>
              </div>
            </Link>
          ))}
        </div>

        <button className="dl-edge-arrow next" type="button" onClick={() => move(1)} aria-label="Next categories">
          <ArrowRight size={21} />
        </button>
      </section>

      <nav className="dl-pagination" aria-label="Category pages">
        {Array.from({ length: totalPages }, (_, dot) => (
          <button
            type="button"
            key={dot}
            className={dot === page ? 'active' : ''}
            onClick={() => {
              setDirection(dot > page ? 'next' : 'previous');
              setPage(dot);
            }}
            aria-label={`Show category page ${dot + 1}`}
          />
        ))}
      </nav>

      <p className="dl-scroll-hint">Scroll or use the arrows to explore</p>
    </main>
  );
}
