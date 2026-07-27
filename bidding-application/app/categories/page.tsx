'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getCategories, type CategoryTreeNode } from '@/lib/api';

function CategoryLinks({ categories }: { categories: CategoryTreeNode[] }) {
  return (
    <ul className="category-branch">
      {categories.map((category) => (
        <li key={category.id}>
          <Link href={`/categories/${category.path}`}>{category.name}</Link>
          {category.children.length > 0 && <CategoryLinks categories={category.children} />}
        </li>
      ))}
    </ul>
  );
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryTreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCategories()
      .then((result) => setCategories(result.categories))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="categories-page">
      <header className="categories-hero">
        <p className="eyebrow">Explore the collection</p>
        <h1>Garment categories</h1>
        <p>Browse every garment family, sleeve style, and bottom length in one place.</p>
        <Link href="/shop">Shop all garments</Link>
      </header>
      {loading ? <p className="categories-loading">Loading categories…</p> : (
        <div className="category-directory">
          {categories.map((category, index) => (
            <article className="category-directory-card" key={category.id}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h2><Link href={`/categories/${category.path}`}>{category.name}</Link></h2>
              {category.children.length > 0
                ? <CategoryLinks categories={category.children} />
                : <p>View all {category.name.toLowerCase()} garments.</p>}
              <Link className="category-shop-link" href={`/shop?category=${encodeURIComponent(category.path)}`}>Shop {category.name} →</Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
