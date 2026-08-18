'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { addToCart, getProductDetail, recordProductInteraction, type ProductDetail } from '@/lib/api';
import { addGuestCartItem } from '@/lib/guestCart';
import { useAuth } from '@/app/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import ProtectedProductImage from '@/app/components/ProtectedProductImage';
import { GuestPrice } from '@/app/components/GuestPrice';

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [size, setSize] = useState('M');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');
  const [currentImage, setCurrentImage] = useState(0);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const galleryRef = useRef<HTMLDivElement>(null);
  const dwellStartRef = useRef<number>(0);
  const accumulatedDwellRef = useRef<number>(0);
  const dwellSentRef = useRef(false);

  useEffect(() => {
    setCurrentImage(0);
    setDescriptionExpanded(false);
    getProductDetail(id).then(setProduct).catch(() => setProduct(null)).finally(() => setLoading(false));
  }, [id]);

  // ---- Interaction tracking: PRODUCT_VIEW + PRODUCT_DWELL ----

  const sendDwell = useCallback(() => {
    if (dwellSentRef.current) return;
    // Accumulate any remaining active time
    if (dwellStartRef.current > 0) {
      accumulatedDwellRef.current += Date.now() - dwellStartRef.current;
      dwellStartRef.current = 0;
    }
    const durationMs = Math.min(accumulatedDwellRef.current, 60 * 60 * 1000);
    if (durationMs >= 1000) { // Only track if they spent at least 1 second
      dwellSentRef.current = true;
      recordProductInteraction('PRODUCT_DWELL', id, durationMs).catch(() => undefined);
    }
  }, [id]);

  useEffect(() => {
    // Record PRODUCT_VIEW immediately
    recordProductInteraction('PRODUCT_VIEW', id).catch(() => undefined);

    dwellStartRef.current = Date.now();
    accumulatedDwellRef.current = 0;
    dwellSentRef.current = false;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (dwellStartRef.current > 0) {
          accumulatedDwellRef.current += Date.now() - dwellStartRef.current;
          dwellStartRef.current = 0;
        }
      } else {
        // Resume: restart the timer
        dwellStartRef.current = Date.now();
      }
    };

    const handleBeforeUnload = () => sendDwell();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // Send dwell on React unmount (SPA navigation)
      sendDwell();
    };
  }, [id, sendDwell]);

  if (loading) return <div className="page-container">Loading garment…</div>;
  if (!product) return <div className="shop-empty"><h2>Garment not found</h2><Link href="/shop">Return to shop</Link></div>;

  const images = product.protectedImages;
  const isLive = product.auction?.status === 'ACTIVE';
  const hasLongDescription = product.description.length > 220;
  const showImage = (index: number) => {
    const nextIndex = (index + images.length) % images.length;
    setCurrentImage(nextIndex);
    galleryRef.current?.scrollTo({ left: galleryRef.current.clientWidth * nextIndex, behavior: 'smooth' });
  };
  return (
    <div className="product-detail">
      <div className="detail-image">
        <div className="detail-carousel-track" ref={galleryRef} tabIndex={0} aria-label={`Swipeable image gallery for ${product.title}`} onScroll={(event) => {
          const width = event.currentTarget.clientWidth;
          if (width) setCurrentImage(Math.min(images.length - 1, Math.max(0, Math.round(event.currentTarget.scrollLeft / width))));
        }}>
          {images.map((image, index) => (
            <figure className="detail-gallery-item" key={image.id}>
              <ProtectedProductImage image={image} alt={`${product.title} view ${index + 1}`} className="protected-contain" eager={index === 0} />
            </figure>
          ))}
        </div>
        {images.length > 1 && <div className="detail-carousel-controls">
          <button type="button" onClick={() => showImage(currentImage - 1)} aria-label="Previous product image">←</button>
          <div className="detail-carousel-dots" aria-label={`Image ${currentImage + 1} of ${images.length}`}>{images.map((_, index) => <button type="button" key={index} className={index === currentImage ? 'active' : ''} onClick={() => showImage(index)} aria-label={`View image ${index + 1}`} />)}</div>
          <span>{String(currentImage + 1).padStart(2, '0')} / {String(images.length).padStart(2, '0')}</span>
          <button type="button" onClick={() => showImage(currentImage + 1)} aria-label="Next product image">→</button>
        </div>}
      </div>
      <div className={`detail-copy${descriptionExpanded ? ' detail-copy-scrollable' : ''}`}>
        <Link href="/shop" className="back-link">← Back to shop</Link>
        <p className="eyebrow">Quick Fashion collection</p><h1>{product.title}</h1>
        <GuestPrice price={product.priceInRupees} />
        <div className="detail-description-wrap">
          <p className={`detail-description${descriptionExpanded ? ' expanded' : ''}`}>{product.description}</p>
          {hasLongDescription && <button type="button" className="detail-description-toggle" aria-expanded={descriptionExpanded} onClick={() => setDescriptionExpanded((expanded) => !expanded)}>{descriptionExpanded ? 'Show less' : 'Show more'}</button>}
        </div>
        <div className="size-heading"><span>Select size</span><button>Size guide</button></div>
        <div className="size-options">{product.availableSizes.map((item) => <button className={size === item ? 'active' : ''} onClick={() => setSize(item)} key={item}>{item}</button>)}</div>
        <button className="detail-buy" disabled={adding || product.stockQuantity < 1} onClick={async () => {
          setAdding(true);
          try {
            if (user) {
              await addToCart(product.id, size);
            } else {
              addGuestCartItem(product, size);
            }
            setNotice('Added to your bag.');
          } catch (error) {
            setNotice(error instanceof Error ? error.message : 'Could not add to bag');
          } finally {
            setAdding(false);
          }
        }}>{product.stockQuantity < 1 ? 'Out of stock' : adding ? 'Adding…' : 'Add to bag'}</button>
        {notice && <p className="integration-message">{notice} {notice.startsWith('Added') && <Link href="/cart">View bag →</Link>}</p>}
        {isLive && <div className="auction-option"><p><strong>Also available in a live auction</strong><br />This garment has been selected for administrator-controlled bidding.</p><Link href={`/auctions/${product.id}`}>View live auction →</Link></div>}
        <div className="detail-benefits"><span>Complimentary delivery over ₹10,000</span><span>Secure payment gateway</span><span>Easy returns within 14 days</span></div>
      </div>
    </div>
  );
}
