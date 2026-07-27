'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCart, removeCartItem, updateCartItem, type CartData } from '@/lib/api';
import { useAuth } from '@/app/contexts/AuthContext';

export default function CartPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [cart, setCart] = useState<CartData | null>(null);
  useEffect(() => { if (!loading && !user) router.push('/auth'); if (user) getCart().then(setCart).catch(console.error); }, [user, loading, router]);
  const total = cart?.items.reduce((sum, item) => sum + Number(item.product.priceInRupees) * item.quantity, 0) || 0;
  return <div className="shop-page"><header className="shop-header"><p className="eyebrow">Your selection</p><h1>Shopping bag</h1><p>Review all sizes and quantities before one secure checkout.</p></header>
    {!cart ? <p>Loading your bag…</p> : !cart.items.length ? <div className="shop-empty"><h2>Your bag is empty</h2><Link href="/shop">Continue shopping</Link></div> :
    <div className="cart-layout"><div className="cart-list">{cart.items.map((item) => <article className="cart-row" key={item.id}>
      <img src={item.product.images[0] || ''} alt={item.product.title} /><div><p className="eyebrow">{item.product.categoryNode?.name || item.product.category}</p><h2>{item.product.title}</h2><p>Size {item.size}</p><select value={item.quantity} onChange={async (e) => setCart(await updateCartItem(item.id, Number(e.target.value)))}>{[1,2,3,4,5].map((n) => <option key={n}>{n}</option>)}</select><button onClick={async () => setCart(await removeCartItem(item.id))}>Remove</button></div><strong>₹{(Number(item.product.priceInRupees)*item.quantity).toLocaleString('en-IN')}</strong>
    </article>)}</div><aside className="cart-total"><p className="eyebrow">Order summary</p><div><span>Subtotal</span><strong>₹{total.toLocaleString('en-IN')}</strong></div><p>All products will be processed together as one order and one payment.</p><Link className="detail-buy" href="/checkout">Checkout entire bag</Link></aside></div>}
  </div>;
}
