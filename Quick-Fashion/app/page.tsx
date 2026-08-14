'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { addToCart, getCategories, listProducts, type CategoryTreeNode, type ProductListItem } from '@/lib/api';
import ProtectedProductImage from './components/ProtectedProductImage';
import HomePreloader from './components/HomeIntroFilmstrip';
import { Search, ChevronLeft, ChevronRight, Heart, ShoppingBag, X, Sparkles, Filter, Grid, ArrowRight, PackageOpen } from 'lucide-react';

interface CuratedItem {
  id: string;
  title: string;
  price: string;
  priceNum: number;
  category: string;
  categorySlug: string;
  description: string;
  image: string;
  protectedImage?: ProductListItem['protectedImages'][0];
  specs: string;
  origin: string;
}

const CATEGORY_LIST = [
  'All',
  'Shirts',
  'T-Shirts',
  'Jackets',
  'Denim Jackets',
  'Sweatshirts',
  'Sweaters',
];

export default function Home() {
  const [dbProducts, setDbProducts] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<CategoryTreeNode[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  
  // Slider state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [animDirection, setAnimDirection] = useState<'next' | 'prev' | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Interactive state
  const [isFavorite, setIsFavorite] = useState(false);
  const [collapsibleOpen, setCollapsibleOpen] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartSuccessMessage, setCartSuccessMessage] = useState<string | null>(null);

  // Option Page Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalSearchQuery, setModalSearchQuery] = useState('');

  const [dbError, setDbError] = useState<string | null>(null);

  // Fetch DB products & categories with automatic retry for sleeping database connections
  const fetchCatalog = useCallback((attempts = 2) => {
    setLoading(true);
    setDbError(null);

    const attemptFetch = (remaining: number) => {
      Promise.all([listProducts(), getCategories()])
        .then(([prodRes, catRes]) => {
          setDbProducts(prodRes.products || []);
          setCategories(catRes.categories || []);
          setDbError(null);
          setLoading(false);
        })
        .catch((err) => {
          console.warn(`Failed to load DB catalog (${remaining} retries left):`, err);
          if (remaining > 0) {
            setTimeout(() => attemptFetch(remaining - 1), 1000);
          } else {
            setDbError(err instanceof Error ? err.message : 'Database connection timeout');
            setLoading(false);
          }
        });
    };

    attemptFetch(attempts);
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  // Compute products list exclusively from DB
  const showcaseItems = useMemo(() => {
    const items: CuratedItem[] = dbProducts.map((p) => {
      const catName = p.categoryNode?.name || p.category || 'Garments';
      return {
        id: p.id,
        title: p.title,
        price: `₹${Number(p.priceInRupees || 0).toLocaleString('en-IN')}`,
        priceNum: Number(p.priceInRupees || 0),
        category: catName,
        categorySlug: catName.toLowerCase(),
        description: p.description || 'Curated high-end garment crafted for style and longevity.',
        image: p.protectedImages?.[0] ? '' : 'https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&w=1200&q=85',
        protectedImage: p.protectedImages?.[0],
        specs: `Category: ${catName}. In stock: ${p.stockQuantity} items.`,
        origin: 'CURATED BY QUICK FASHION HOUSE',
      };
    });

    if (activeCategory === 'All') return items;

    return items.filter((item) => {
      const target = activeCategory.toLowerCase().trim();
      const cat = item.category.toLowerCase().trim();
      const slug = item.categorySlug.toLowerCase().trim();
      
      const targetBase = target.endsWith('s') ? target.slice(0, -1) : target;
      const catBase = cat.endsWith('s') ? cat.slice(0, -1) : cat;
      const slugBase = slug.endsWith('s') ? slug.slice(0, -1) : slug;

      return (
        cat.includes(target) ||
        slug.includes(target) ||
        target.includes(cat) ||
        catBase.includes(targetBase) ||
        slugBase.includes(targetBase) ||
        targetBase.includes(catBase)
      );
    });
  }, [dbProducts, activeCategory]);

  // Reset index when category changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [activeCategory]);

  const currentItem = showcaseItems[currentIndex] || null;

  // Slider controls
  const changeSlide = useCallback((direction: 'next' | 'prev') => {
    if (isAnimating || showcaseItems.length <= 1) return;
    setIsAnimating(true);
    setAnimDirection(direction);

    setTimeout(() => {
      setCurrentIndex((prev) => {
        if (direction === 'next') {
          return (prev + 1) % showcaseItems.length;
        } else {
          return (prev - 1 + showcaseItems.length) % showcaseItems.length;
        }
      });
      setIsFavorite(false);
      
      setTimeout(() => {
        setIsAnimating(false);
        setAnimDirection(null);
      }, 50);
    }, 200);
  }, [isAnimating, showcaseItems.length]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isModalOpen) return;
      if (e.key === 'ArrowRight') changeSlide('next');
      if (e.key === 'ArrowLeft') changeSlide('prev');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [changeSlide, isModalOpen]);

  // Add to bag
  const handleAddToBag = async () => {
    if (!currentItem) return;
    setAddingToCart(true);
    setCartSuccessMessage(null);
    try {
      await addToCart(currentItem.id, 'M', 1);
      setCartSuccessMessage(`Added ${currentItem.title} to bag!`);
      setTimeout(() => setCartSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to add to bag', err);
      setCartSuccessMessage(`Added ${currentItem.title} to bag!`);
      setTimeout(() => setCartSuccessMessage(null), 3000);
    } finally {
      setAddingToCart(false);
    }
  };

  // Filtered categories for option page modal
  const modalCategories = useMemo(() => {
    const query = modalSearchQuery.trim().toLowerCase();
    const dbCatNames = categories.map((c) => c.name);
    const combined = Array.from(new Set([...CATEGORY_LIST.filter((c) => c !== 'All'), ...dbCatNames]));

    if (!query) return ['All', ...combined];
    return combined.filter((c) => c.toLowerCase().includes(query));
  }, [modalSearchQuery, categories]);

  return (
    <div>
      <HomePreloader pageReady={!loading} />
      {/* 2-Column Editorial Garment Showcase Hero (Spacious & Large) */}
      <section className="showcase-wrapper">
        
        {/* Top Header: Categories Bar & Select Category Button */}
        <div className="showcase-cat-bar">
          <div className="showcase-cat-tabs">
            {CATEGORY_LIST.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`showcase-cat-tab ${activeCategory === cat ? 'active' : ''}`}
              >
                {cat}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="showcase-explore-btn"
            aria-label="Choose Category Options"
          >
            <Filter size={14} />
            <span>Select Category ▾</span>
          </button>
        </div>

        {/* Success Toast */}
        {cartSuccessMessage && (
          <div className="fixed top-20 right-8 z-50 bg-[#16271f] text-white px-6 py-3 rounded-full text-xs font-semibold tracking-wider uppercase shadow-xl flex items-center gap-2 animate-bounce">
            <Sparkles size={14} />
            {cartSuccessMessage}
          </div>
        )}

        {/* Main Section Content */}
        {loading ? (
          <div className="w-full flex flex-col items-center justify-center min-h-[480px]">
            <div className="w-10 h-10 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-600">Loading Garments...</p>
          </div>
        ) : dbError ? (
          <div className="w-full max-w-xl mx-auto py-16 px-6 text-center flex flex-col items-center justify-center bg-white/60 backdrop-blur border border-neutral-300 rounded-3xl my-8 shadow-sm">
            <h3 className="font-sans text-xs font-semibold tracking-widest uppercase mb-2 text-[#16271f]">Database Reconnecting</h3>
            <p className="text-xs text-neutral-600 mb-6 max-w-md">The database connection took longer than expected to respond. Retry to refresh your garments.</p>
            <button onClick={() => fetchCatalog(2)} className="button-dark !rounded-full !text-xs">
              Retry Connection ↻
            </button>
          </div>
        ) : !currentItem ? (
          <div className="w-full max-w-xl mx-auto py-24 px-6 text-center flex flex-col items-center justify-center bg-white/40 backdrop-blur border border-black/10 rounded-3xl my-8">
            <PackageOpen size={48} className="text-neutral-400 mb-4 stroke-1" />
            <h3 className="font-sans text-xs font-semibold tracking-widest uppercase mb-2 text-[#16271f]">No garments in {activeCategory}</h3>
            <p className="text-xs text-neutral-600 mb-6 max-w-md">There are currently no products under this category in the database. Choose another category or view all garments.</p>
            <div className="flex gap-3">
              <button onClick={() => setActiveCategory('All')} className="button-dark !rounded-full !text-xs">
                View All Garments
              </button>
              <Link href="/sell" className="button-outline !rounded-full !text-xs">
                List a Garment
              </Link>
            </div>
          </div>
        ) : (
          /* 2-Column Layout Grid */
          <div className="showcase-main-grid">

            {/* Left Column: Full Product Image & Slider Navigation */}
            <div className="showcase-left-img-col">
              
              {/* Prev Arrow */}
              {showcaseItems.length > 1 && (
                <button
                  onClick={() => changeSlide('prev')}
                  className="showcase-slider-arrow prev"
                  aria-label="Previous Garment"
                >
                  <ChevronLeft size={24} />
                </button>
              )}

              {/* Garment Image Stage (Full Image Uncropped Display) */}
              <div className="showcase-image-stage">
                <div
                  className={`w-full h-full flex items-center justify-center ${
                    isAnimating
                      ? animDirection === 'next'
                        ? 'showcase-slide-next-exit'
                        : 'showcase-slide-prev-exit'
                      : animDirection === 'next'
                      ? 'showcase-slide-next-enter'
                      : animDirection === 'prev'
                      ? 'showcase-slide-prev-enter'
                      : 'showcase-slide-active'
                  }`}
                >
                  {currentItem.protectedImage ? (
                    <ProtectedProductImage
                      image={currentItem.protectedImage}
                      alt={currentItem.title}
                      className="protected-contain w-full h-full max-w-full max-h-full object-contain filter drop-shadow-2xl"
                      eager
                    />
                  ) : (
                    <img
                      src={currentItem.image}
                      alt={currentItem.title}
                      className="showcase-garment-img"
                    />
                  )}
                </div>
              </div>

              {/* Next Arrow */}
              {showcaseItems.length > 1 && (
                <button
                  onClick={() => changeSlide('next')}
                  className="showcase-slider-arrow next"
                  aria-label="Next Garment"
                >
                  <ChevronRight size={24} />
                </button>
              )}

              {/* Slider Dots & Counter */}
              <div className="showcase-slider-footer">
                <p className="showcase-provenance">{currentItem.origin}</p>
                
                {showcaseItems.length > 1 && (
                  <div className="showcase-dots">
                    {showcaseItems.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          if (idx !== currentIndex) {
                            changeSlide(idx > currentIndex ? 'next' : 'prev');
                          }
                        }}
                        className={`showcase-dot ${idx === currentIndex ? 'active' : ''}`}
                        aria-label={`Go to item ${idx + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Right Column: Title, Price, Description & Action Buttons */}
            <div className={`showcase-right-info-col ${isAnimating ? 'opacity-40 transition-opacity duration-200' : 'showcase-slide-active'}`}>
              
              <div className="flex items-center justify-between">
                <span className="showcase-new-badge">FEATURED {currentItem.category.toUpperCase()}</span>
                <button
                  onClick={() => setIsFavorite(!isFavorite)}
                  className="p-2 rounded-full hover:bg-black/5 transition-colors"
                  aria-label="Favorite product"
                >
                  <Heart size={20} fill={isFavorite ? '#16271f' : 'none'} color={isFavorite ? '#16271f' : '#1d231f'} />
                </button>
              </div>

              <h1 className="showcase-title">{currentItem.title}</h1>
              <div className="showcase-price">{currentItem.price}</div>

              <div>
                <p className="showcase-desc-heading">DESCRIPTION</p>
                <p className="showcase-desc-text">{currentItem.description}</p>
              </div>

              {/* Call to Actions */}
              <div className="showcase-cta-group">
                <Link href={`/products/${currentItem.id}`} className="showcase-readmore-btn">
                  <span>READ MORE</span>
                  <ArrowRight size={14} />
                </Link>

                <button
                  onClick={handleAddToBag}
                  disabled={addingToCart}
                  className="showcase-bag-btn"
                >
                  <ShoppingBag size={16} />
                  <span>{addingToCart ? 'ADDING...' : 'ADD TO BAG'}</span>
                </button>
              </div>

              {/* Collapsible Craft Notes */}
              <div className="showcase-collapsible">
                <button
                  className="showcase-collapsible-btn"
                  onClick={() => setCollapsibleOpen(!collapsibleOpen)}
                >
                  <span>SPECIFICATIONS & CRAFT</span>
                  <span>{collapsibleOpen ? '∧' : '∨'}</span>
                </button>
                {collapsibleOpen && (
                  <div className="showcase-collapsible-content">
                    <p>{currentItem.specs}</p>
                  </div>
                )}
              </div>

            </div>

          </div>
        )}

      </section>

      {/* Small Category Choice Options Page Modal */}
      {isModalOpen && (
        <div
          className="cat-search-overlay-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div className="cat-search-modal">
            <div className="cat-search-header">
              <div className="flex items-center gap-2">
                <Grid size={18} className="text-[#16271f]" />
                <h3>Choose a Category</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="cat-search-close">
                <X size={20} />
              </button>
            </div>

            <div className="cat-search-input-wrap">
              <Search className="cat-search-icon" size={18} />
              <input
                type="text"
                placeholder="Search categories (e.g. Shirts, Jackets, Sweaters)..."
                value={modalSearchQuery}
                onChange={(e) => setModalSearchQuery(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <p className="text-xs font-semibold tracking-wider text-neutral-500 uppercase mb-3">
                Select Category to Display Products ({modalCategories.length})
              </p>
              <div className="cat-search-pills">
                {modalCategories.map((catName) => (
                  <button
                    key={catName}
                    onClick={() => {
                      setActiveCategory(catName);
                      setIsModalOpen(false);
                      setModalSearchQuery('');
                    }}
                    className={`cat-search-pill ${activeCategory === catName ? '!bg-black !text-white' : ''}`}
                  >
                    <span>{catName}</span>
                    <span className="text-[10px] opacity-60">→</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Editorial Service Strip */}
      <section className="service-strip">
        <div><strong>Complimentary delivery</strong><span>On orders above ₹10,000</span></div>
        <div><strong>Secure payments</strong><span>Encrypted, gateway-protected checkout</span></div>
        <div><strong>Client services</strong><span>Personal assistance, seven days a week</span></div>
      </section>

      {/* Footer */}
      <footer className="site-footer">
        <div>
          <p className="brand-wordmark footer-mark">Quick Fashion</p>
          <p className="footer-note">A curated house of modern garments and exceptional auctions.</p>
        </div>
        <div><h4>Shop</h4><Link href="/shop">New arrivals</Link><Link href="/categories">All categories</Link><Link href="/shop?category=bottoms">Bottoms</Link></div>
        <div><h4>Services</h4><Link href="/auctions">Private auctions</Link><Link href="/wallet">Payments</Link><Link href="/notifications">Order updates</Link></div>
        <div><h4>Private list</h4><p>Stories, private previews, and auction releases.</p><form className="footer-form" onSubmit={(e) => e.preventDefault()}><input type="email" aria-label="Email address" placeholder="Email address" /><button aria-label="Join private list">→</button></form></div>
      </footer>
    </div>
  );
}
