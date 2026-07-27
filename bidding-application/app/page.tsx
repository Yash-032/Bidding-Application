'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listProducts, type ProductListItem } from '@/lib/api';
import AuctionCard from './components/AuctionCard';

const collections = [
  {
    title: 'The Linen Edit',
    eyebrow: 'For sunlit afternoons',
    image: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=1200&q=85',
  },
  {
    title: 'Modern Tailoring',
    eyebrow: 'An enduring silhouette',
    image: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=1200&q=85',
  },
  {
    title: 'The Evening Collection',
    eyebrow: 'Quietly captivating',
    image: 'https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=1200&q=85',
  },
];

export default function Home() {
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProducts()
      .then((result) => setProducts(result.products))
      .catch((error) => console.error('Failed to load featured garments', error))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <section className="luxury-hero">
        <div className="luxury-hero-shade" />
        <div className="luxury-hero-content">
          <p className="eyebrow text-white/90">New Season · 2026</p>
          <h1>The Art of<br />Summer Dressing</h1>
          <p>Natural textures, considered tailoring, and pieces made to endure.</p>
          <div className="hero-actions">
            <Link href="/shop" className="button-light">Shop the collection</Link>
            <a href="#new-arrivals" className="button-ghost">View new arrivals</a>
          </div>
        </div>
      </section>

      <section className="editorial-section">
        <div className="section-heading">
          <p className="eyebrow">Discover the house</p>
          <h2>Stories of timeless style</h2>
          <p className="section-copy">A considered wardrobe for every chapter, selected for quality, character, and a life well lived.</p>
        </div>
        <div className="collection-grid">
          {collections.map((collection) => (
            <Link href={`/shop?category=${collection.title === 'Modern Tailoring' ? 'shirt' : collection.title === 'The Evening Collection' ? 'dress' : 't-shirt'}`} key={collection.title} className="collection-tile">
              <img src={collection.image} alt="" />
              <div className="collection-caption">
                <p>{collection.eyebrow}</p>
                <h3>{collection.title}</h3>
                <span>Shop now</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section id="new-arrivals" className="auction-feature">
        <div className="section-heading">
          <p className="eyebrow">Shop the latest edit</p>
          <h2>New arrivals</h2>
          <p className="section-copy">Discover garments selected for quality and enduring style. Purchase any piece directly; selected items may also be offered in an administrator-run auction.</p>
        </div>

        {loading ? (
          <div className="product-grid">
            {[1, 2, 3].map((item) => <div className="skeleton product-skeleton" key={item} />)}
          </div>
        ) : products.length ? (
          <div className="product-grid">
            {products.slice(0, 4).map((product) => <AuctionCard key={product.id} product={product} />)}
          </div>
        ) : (
          <div className="empty-editorial">
            <p className="eyebrow">New collection coming soon</p>
            <h3>Our next edit is being prepared.</h3>
            <p>Join our private list to be first to shop the release.</p>
          </div>
        )}
        <div className="center-action">
          <Link href="/shop" className="button-dark">Shop all garments</Link>
        </div>
      </section>

      <section className="service-strip">
        <div><strong>Complimentary delivery</strong><span>On orders above ₹10,000</span></div>
        <div><strong>Secure payments</strong><span>Encrypted, gateway-protected checkout</span></div>
        <div><strong>Client services</strong><span>Personal assistance, seven days a week</span></div>
      </section>

      <footer className="site-footer">
        <div>
          <p className="brand-wordmark footer-mark">THE RESERVE</p>
          <p className="footer-note">A curated house of modern garments and exceptional auctions.</p>
        </div>
        <div><h4>Shop</h4><Link href="/shop">New arrivals</Link><Link href="/categories">All categories</Link><Link href="/shop?category=bottoms">Bottoms</Link></div>
        <div><h4>Services</h4><Link href="/auctions">Private auctions</Link><Link href="/wallet">Payments</Link><Link href="/notifications">Order updates</Link></div>
        <div><h4>Private list</h4><p>Stories, private previews, and auction releases.</p><form className="footer-form" onSubmit={(e) => e.preventDefault()}><input type="email" aria-label="Email address" placeholder="Email address" /><button aria-label="Join private list">→</button></form></div>
      </footer>
    </div>
  );
}
