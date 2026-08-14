'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getCategories, getPersonalizedFeed, listProducts, searchProducts, type CategoryTreeNode, type ProductListItem } from '@/lib/api';
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
  const [products, setProducts] = useState<(ProductListItem & { reason?: string | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPersonalized, setIsPersonalized] = useState(false);
  const requestVersion = useRef(0);

  useEffect(() => setCategory(requestedCategory), [requestedCategory]);
  useEffect(() => {
    getCategories().then((result) => setCategories(result.categories)).catch(console.error);
  }, []);
  
  useEffect(() => {
    // Debounce typing only. Initial loads and category changes should feel immediate.
    const delay = search.trim() ? 350 : 0;
    const timer = window.setTimeout(() => {
      const version = ++requestVersion.current;
      setLoading(true);

      // When no search and no category filter, show personalized feed
      const usePersonalized = !search.trim() && !category;

      const request = search.trim()
        ? searchProducts(search.trim(), category || undefined).then((r) => ({ products: r.products, personalized: false }))
        : usePersonalized
          ? getPersonalizedFeed().then((r) => ({ products: r.products, personalized: r.personalized }))
          : listProducts({ category: category || undefined }).then((r) => ({ products: r.products, personalized: false }));

      request.then((result) => {
        if (version === requestVersion.current) {
          setProducts(result.products);
          setIsPersonalized(result.personalized);
        }
      })
        .catch((error) => { if (version === requestVersion.current) console.error(error); })
        .finally(() => { if (version === requestVersion.current) setLoading(false); });
    }, delay);
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
        </div>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search garments" aria-label="Search garments" />
      </div>
      <div className="shop-count">{loading ? 'Curating the collection' : `${products.length} ${products.length === 1 ? 'piece' : 'pieces'}${isPersonalized ? ' · Picked for you' : ''}`}</div>
      {loading ? <div className="product-grid"><div className="skeleton product-skeleton" /><div className="skeleton product-skeleton" /><div className="skeleton product-skeleton" /></div>
        : products.length ? <div className="product-grid">{products.map((product) => <AuctionCard key={product.id} product={product} reason={isPersonalized ? (product as ProductListItem & { reason?: string | null }).reason : undefined} />)}</div>
        : <div className="shop-empty"><h2>No garments found</h2><p>Try another category or clear your search.</p><button onClick={() => { chooseCategory(''); setSearch(''); }}>View all products</button></div>}
    </div>
  );
}

export default function ShopPage() {
  return <Suspense fallback={<div className="page-container">Loading the collection</div>}><ShopContent /></Suspense>;
}
