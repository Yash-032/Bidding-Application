'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AuctionCard from '@/app/components/AuctionCard';
import { getCategories, listProducts, type CategoryTreeNode, type ProductListItem } from '@/lib/api';

function flatten(categories: CategoryTreeNode[]): CategoryTreeNode[] {
  return categories.flatMap((category) => [category, ...flatten(category.children)]);
}

export default function CategoryPage() {
  const params = useParams<{ path: string[] }>();
  const path = params.path.map(decodeURIComponent).join('/');
  const [categories, setCategories] = useState<CategoryTreeNode[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getCategories(), listProducts({ category: path })])
      .then(([categoryResult, productResult]) => {
        setCategories(categoryResult.categories);
        setProducts(productResult.products);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [path]);

  const allCategories = useMemo(() => flatten(categories), [categories]);
  const category = allCategories.find((item) => item.path === path);
  const breadcrumbs = path.split('/').map((_, index, segments) => {
    const categoryPath = segments.slice(0, index + 1).join('/');
    return allCategories.find((item) => item.path === categoryPath);
  }).filter((item): item is CategoryTreeNode => Boolean(item));

  if (!loading && !category) {
    return <main className="category-detail-page"><div className="shop-empty"><h1>Category not found</h1><Link href="/categories">Browse all categories</Link></div></main>;
  }

  return (
    <main className="category-detail-page">
      <nav className="category-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/categories">Categories</Link>
        {breadcrumbs.map((item) => <span key={item.id}>/ <Link href={`/categories/${item.path}`}>{item.name}</Link></span>)}
      </nav>
      <header className="category-detail-hero">
        <p className="eyebrow">Garment category</p>
        <h1>{category?.name || 'Loading…'}</h1>
        <p>{category?.children.length ? `Choose a ${category.name.toLowerCase()} style or explore every piece below.` : `Explore every ${category?.name.toLowerCase() || 'garment'} in the collection.`}</p>
        {category && <Link className="detail-buy category-hero-action" href={`/shop?category=${encodeURIComponent(category.path)}`}>Shop this category</Link>}
      </header>

      {category?.children.length ? (
        <section className="subcategory-section">
          <div className="section-heading"><p className="eyebrow">Refine your search</p><h2>Sub-categories</h2></div>
          <div className="subcategory-grid">
            {category.children.map((child) => (
              <Link href={`/categories/${child.path}`} className="subcategory-card" key={child.id}>
                <span>{child.children.length ? `${child.children.length} styles` : 'View garments'}</span>
                <h3>{child.name}</h3>
                <b>Explore →</b>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="category-products">
        <div className="section-heading"><p className="eyebrow">Selected pieces</p><h2>Garments</h2></div>
        {loading ? <p>Loading garments…</p>
          : products.length ? <div className="product-grid">{products.map((product) => <AuctionCard product={product} key={product.id} />)}</div>
          : <div className="shop-empty"><h2>No garments yet</h2><p>Products assigned to this category will appear here automatically.</p><Link href="/shop">View the full collection</Link></div>}
      </section>
    </main>
  );
}
