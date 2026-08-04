'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getCategories, listProducts, type CategoryTreeNode, type ProductListItem } from '@/lib/api';
import AuctionCard from '@/app/components/AuctionCard';

function findCategory(categories: CategoryTreeNode[], path: string): CategoryTreeNode | undefined {
  for (const category of categories) {
    if (category.path === path) return category;
    const child = findCategory(category.children, path);
    if (child) return child;
  }
}

function ShopContent() {
  const params = useSearchParams();
  const router = useRouter();
  const requestedCategory = params.get('category') || '';
  const [category, setCategory] = useState(requestedCategory);
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<CategoryTreeNode[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => setCategory(requestedCategory), [requestedCategory]);
  useEffect(() => {
    getCategories().then((result) => setCategories(result.categories)).catch(console.error);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      listProducts({ category: category || undefined, search: search.trim() || undefined })
        .then((result) => setProducts(result.products))
        .catch(console.error)
        .finally(() => setLoading(false));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [category, search]);

  const selectedCategory = useMemo(() => findCategory(categories, category), [categories, category]);
  const chooseCategory = (path: string) => {
    setCategory(path);
    const query = new URLSearchParams();
    if (path) query.set('category', path);
    router.replace(query.size ? `/shop?${query}` : '/shop', { scroll: false });
  };

  return (
    <div className="shop-page">
      <header className="shop-header">
        <p className="eyebrow">The collection</p>
        <h1>{selectedCategory ? selectedCategory.name : 'Shop garments'}</h1>
        <p>Search the collection or narrow it by garment category and sub-category.</p>
      </header>
      <div className="shop-toolbar">
        <div className="category-pills" aria-label="Product categories">
          <button className={!category ? 'active' : ''} onClick={() => chooseCategory('')}>Shop all</button>
          {categories.map((item) => <button key={item.id} className={category === item.path ? 'active' : ''} onClick={() => chooseCategory(item.path)}>{item.name}</button>)}
          <Link className="browse-categories-link" href="/categories">Browse sub-categories →</Link>
        </div>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search garments" aria-label="Search garments" />
      </div>
      <div className="shop-count">{loading ? 'Curating the collection…' : `${products.length} ${products.length === 1 ? 'piece' : 'pieces'}`}</div>
      {loading ? <div className="product-grid"><div className="skeleton product-skeleton" /><div className="skeleton product-skeleton" /><div className="skeleton product-skeleton" /></div>
        : products.length ? <div className="product-grid">{products.map((product) => <AuctionCard key={product.id} product={product} />)}</div>
        : <div className="shop-empty"><h2>No garments found</h2><p>Try another category or clear your search.</p><button onClick={() => { chooseCategory(''); setSearch(''); }}>View all products</button></div>}
    </div>
  );
}

export default function ShopPage() {
  return <Suspense fallback={<div className="page-container">Loading the collection…</div>}><ShopContent /></Suspense>;
}
