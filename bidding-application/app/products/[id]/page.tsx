'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { addToCart, getProductDetail, type ProductDetail } from '@/lib/api';
import { useAuth } from '@/app/contexts/AuthContext';
import { useRouter } from 'next/navigation';

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [size, setSize] = useState('M');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    getProductDetail(id).then(setProduct).catch(() => setProduct(null)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="page-container">Loading garment…</div>;
  if (!product) return <div className="shop-empty"><h2>Garment not found</h2><Link href="/shop">Return to shop</Link></div>;

  const image = product.images?.[0] || 'https://images.unsplash.com/photo-1617137968427-85924c800a22?auto=format&fit=crop&w=1200&q=90';
  const isLive = product.auction?.status === 'ACTIVE';
  return (
    <div className="product-detail">
      <div className="detail-image"><img src={image} alt={product.title} /></div>
      <div className="detail-copy">
        <Link href="/shop" className="back-link">← Back to shop</Link>
        <p className="eyebrow">The Reserve collection</p><h1>{product.title}</h1>
        <p className="detail-price">₹{Number(product.priceInRupees).toLocaleString('en-IN')}</p>
        <p className="detail-description">{product.description}</p>
        <div className="size-heading"><span>Select size</span><button>Size guide</button></div>
        <div className="size-options">{product.availableSizes.map((item) => <button className={size === item ? 'active' : ''} onClick={() => setSize(item)} key={item}>{item}</button>)}</div>
        <button className="detail-buy" disabled={adding || product.stockQuantity < 1} onClick={async () => {
          if (!user) return router.push('/auth');
          setAdding(true);
          try { await addToCart(product.id, size); setNotice('Added to your bag.'); } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not add to bag'); } finally { setAdding(false); }
        }}>{product.stockQuantity < 1 ? 'Out of stock' : adding ? 'Adding…' : 'Add to bag'}</button>
        {notice && <p className="integration-message">{notice} {notice.startsWith('Added') && <Link href="/cart">View bag →</Link>}</p>}
        {isLive && <div className="auction-option"><p><strong>Also available in a live auction</strong><br />This garment has been selected for administrator-controlled bidding.</p><Link href={`/auctions/${product.id}`}>View live auction →</Link></div>}
        <div className="detail-benefits"><span>Complimentary delivery over ₹10,000</span><span>Secure payment gateway</span><span>Easy returns within 14 days</span></div>
      </div>
    </div>
  );
}
