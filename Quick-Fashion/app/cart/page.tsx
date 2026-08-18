'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getCart, removeCartItem, updateCartItem, type CartData } from '@/lib/api';
import { getGuestCart, removeGuestCartItem, updateGuestCartItem } from '@/lib/guestCart';
import { useAuth } from '@/app/contexts/AuthContext';
import ProtectedProductImage from '@/app/components/ProtectedProductImage';

export default function CartPage() {
  const { user, loading } = useAuth();
  const [cart, setCart] = useState<CartData | null>(null);

  useEffect(() => {
    if (loading) return;

    if (user) {
      getCart()
        .then(setCart)
        .catch(console.error);
    } else {
      const guestItems = getGuestCart();
      setCart({
        id: 'guest_cart',
        items: guestItems as any,
      });
    }
  }, [user, loading]);

  const handleUpdateQuantity = async (itemId: string, quantity: number) => {
    if (user) {
      const updated = await updateCartItem(itemId, quantity);
      setCart(updated);
    } else {
      const updatedGuestItems = updateGuestCartItem(itemId, quantity);
      setCart({ id: 'guest_cart', items: updatedGuestItems as any });
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (user) {
      const updated = await removeCartItem(itemId);
      setCart(updated);
    } else {
      const updatedGuestItems = removeGuestCartItem(itemId);
      setCart({ id: 'guest_cart', items: updatedGuestItems as any });
    }
  };

  const isGuest = !user || (typeof window !== 'undefined' && localStorage.getItem('quick-fashion-guest-mode') === 'true');
  const totalItemsCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) || 0;
  const guestFeeTotal = isGuest ? totalItemsCount * 49 : 0;
  const subtotal =
    cart?.items.reduce(
      (sum, item) => sum + Number(item.product.priceInRupees) * item.quantity,
      0
    ) || 0;
  const grandTotal = subtotal + guestFeeTotal;

  return (
    <div className="shop-page">
      <header className="shop-header">
        <p className="eyebrow">Your selection</p>
        <h1>Shopping bag</h1>
        <p>Review all sizes and quantities before one secure checkout.</p>
      </header>

      {!cart ? (
        <p>Loading your bag…</p>
      ) : !cart.items.length ? (
        <div className="shop-empty">
          <h2>Your bag is empty</h2>
          <Link href="/shop">Continue shopping</Link>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-list">
            {cart.items.map((item) => (
              <article className="cart-row" key={item.id}>
                <ProtectedProductImage
                  image={item.product.protectedImages[0]}
                  alt={item.product.title}
                />
                <div>
                  <p className="eyebrow">
                    {item.product.categoryNode?.name || item.product.category}
                  </p>
                  <h2>{item.product.title}</h2>
                  <p>Size {item.size}</p>
                  <select
                    value={item.quantity}
                    onChange={(e) => handleUpdateQuantity(item.id, Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                  <button onClick={() => handleRemoveItem(item.id)}>Remove</button>
                </div>
                <strong style={{ textAlign: 'right' }}>
                  ₹{((Number(item.product.priceInRupees) + (isGuest ? 49 : 0)) * item.quantity).toLocaleString('en-IN')}
                  {isGuest && (
                    <small style={{ display: 'block', fontSize: '0.75rem', color: '#666', fontWeight: 'normal', marginTop: '0.2rem' }}>
                      includes Guest +₹49/item
                    </small>
                  )}
                </strong>
              </article>
            ))}
          </div>

          <aside className="cart-total">
            <p className="eyebrow">Order summary</p>
            <div>
              <span>Subtotal</span>
              <strong>₹{subtotal.toLocaleString('en-IN')}</strong>
            </div>
            {isGuest && (
              <div>
                <span>Guest Fee (+₹49/item)</span>
                <strong>+₹{guestFeeTotal.toLocaleString('en-IN')}</strong>
              </div>
            )}
            <div style={{ borderTop: '1px solid #eee', paddingTop: '0.6rem', marginTop: '0.6rem' }}>
              <span>Total</span>
              <strong>₹{grandTotal.toLocaleString('en-IN')}</strong>
            </div>
            <p>All products will be processed together as one order and one payment.</p>
            <Link className="detail-buy" href="/checkout">
              Checkout entire bag
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
