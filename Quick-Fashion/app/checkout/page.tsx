'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCart, getToken, type CartData } from '@/lib/api';
import { clearGuestCart, getGuestCart } from '@/lib/guestCart';
import { useAuth } from '@/app/contexts/AuthContext';
import ProtectedProductImage from '@/app/components/ProtectedProductImage';

type Success = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

declare global {
  interface Window {
    Razorpay: new (options: any) => {
      open: () => void;
      on: (event: string, callback: (response: any) => void) => void;
    };
  }
}

const loadCheckout = () =>
  new Promise<boolean>((resolve) => {
    if (window.Razorpay) {
      return resolve(true);
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

export default function CheckoutPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [cart, setCart] = useState<CartData | null>(null);

  const [form, setForm] = useState({
    name: '',
    email: user?.email || '',
    phone: '',
    address: '',
    city: '',
    pinCode: '',
  });

  const [message, setMessage] = useState('');
  const [paying, setPaying] = useState(false);
  const mockPaymentsAvailable = process.env.NODE_ENV !== 'production';

  useEffect(() => {
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
  }, [user]);

  useEffect(() => {
    if (user?.email) {
      setForm((values) => ({
        ...values,
        email: values.email || user.email,
      }));
    }
  }, [user]);

  const isGuest = !user || (typeof window !== 'undefined' && localStorage.getItem('quick-fashion-guest-mode') === 'true');
  const totalItemsCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) || 0;
  const guestFeeTotal = isGuest ? totalItemsCount * 49 : 0;

  const subtotal =
    cart?.items.reduce(
      (sum, item) => sum + Number(item.product.priceInRupees) * item.quantity,
      0
    ) || 0;

  const grandSubtotal = subtotal + guestFeeTotal;
  const shipping = grandSubtotal >= 10000 ? 0 : 500;
  const totalAmount = grandSubtotal + shipping;

  const set = (key: keyof typeof form, value: string) => {
    setForm((values) => ({
      ...values,
      [key]: value,
    }));
  };

  const getAuthHeaders = (): Record<string, string> => {
    const token = getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  };

  const pay = async () => {
    if (!cart?.items.length) {
      return setMessage('Your bag is empty.');
    }

    if (Object.values(form).some((value) => !value.trim())) {
      return setMessage('Complete every contact and delivery field.');
    }

    setPaying(true);
    setMessage('');

    try {
      const checkoutLoaded = await loadCheckout();
      if (!checkoutLoaded) {
        throw new Error('Could not load secure payment checkout');
      }

      const guestItems = !user
        ? cart.items.map((item) => ({
            productId: item.product.id,
            size: item.size,
            quantity: item.quantity,
          }))
        : undefined;

      const response = await fetch('/api/payments/razorpay/order', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          deliveryAddress: form,
          guestItems,
        }),
      });

      const order = await response.json();

      if (!response.ok) {
        throw new Error(order.error || 'Could not create order');
      }

      const razorpay = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'Quick Fashion',
        description: order.productName,
        order_id: order.razorpayOrderId,
        prefill: order.customer,
        theme: {
          color: '#1c2e25',
        },
        modal: {
          ondismiss: () => {
            setPaying(false);
          },
        },
        handler: async (payment: Success) => {
          setMessage('Verifying payment…');

          const verificationResponse = await fetch('/api/payments/razorpay/verify', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payment),
          });

          const result = await verificationResponse.json();

          if (!verificationResponse.ok) {
            setMessage(result.error || 'Verification pending');
            setPaying(false);
            return;
          }

          if (!user) {
            clearGuestCart();
          }

          setCart({
            id: cart.id,
            items: [],
          });

          setMessage(`Payment successful. Order ${result.orderId}`);
          setPaying(false);
        },
      });

      razorpay.on('payment.failed', (response: any) => {
        setMessage(response.error.description || 'Payment failed');
        setPaying(false);
      });

      razorpay.open();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Payment could not start');
      setPaying(false);
    }
  };

  const mockPay = async () => {
    if (!cart?.items.length) {
      return setMessage('Your bag is empty.');
    }

    if (Object.values(form).some((value) => !value.trim())) {
      return setMessage('Complete every contact and delivery field.');
    }

    setPaying(true);
    setMessage('');

    try {
      const guestItems = !user
        ? cart.items.map((item) => ({
            productId: item.product.id,
            size: item.size,
            quantity: item.quantity,
          }))
        : undefined;

      const response = await fetch('/api/payments/mock/checkout', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          deliveryAddress: form,
          guestItems,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Mock checkout failed');
      }

      if (!user) {
        clearGuestCart();
      }

      setCart({ id: cart.id, items: [] });
      setMessage(`Mock payment completed. Order ${result.orderId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Mock checkout failed');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="checkout-page">
      <div className="checkout-main">
        <Link href="/cart" className="back-link">
          ← Return to bag
        </Link>

        <p className="eyebrow">Secure checkout</p>

        <h1>Complete your purchase</h1>

        {/* Contact Section */}
        <section className="checkout-section">
          <div className="checkout-section-title">
            <span>1</span>
            <h2>Contact</h2>
          </div>

          <div className="form-grid">
            <input
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={(event) => set('email', event.target.value)}
            />

            <input
              placeholder="Phone"
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
            />
          </div>
        </section>

        {/* Delivery Section */}
        <section className="checkout-section">
          <div className="checkout-section-title">
            <span>2</span>
            <h2>Delivery</h2>
          </div>

          <div className="form-grid">
            <input
              placeholder="Full name"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
            />

            <input
              className="wide"
              placeholder="Address"
              value={form.address}
              onChange={(event) => set('address', event.target.value)}
            />

            <input
              placeholder="City"
              value={form.city}
              onChange={(event) => set('city', event.target.value)}
            />

            <input
              placeholder="PIN code"
              value={form.pinCode}
              onChange={(event) => set('pinCode', event.target.value)}
            />
          </div>
        </section>

        {/* Payment Section */}
        <section className="checkout-section">
          <div className="checkout-section-title">
            <span>3</span>
            <h2>Payment</h2>
          </div>

          <p className="payment-note">
            Your complete bag is processed as one server-verified payment.
          </p>

          <button
            className="pay-button"
            disabled={paying || !cart?.items.length}
            onClick={pay}
          >
            {paying
              ? 'Opening secure payment…'
              : `Pay ₹${totalAmount.toLocaleString('en-IN')}`}
          </button>

          {mockPaymentsAvailable && (
            <button
              className="pay-button mock-pay-button"
              disabled={paying || !cart?.items.length}
              onClick={mockPay}
            >
              {paying ? 'Processing…' : 'Mock successful payment (development)'}
            </button>
          )}

          {message && <p className="integration-message">{message}</p>}
        </section>
      </div>

      {/* Order Summary */}
      <aside className="order-summary">
        <p className="eyebrow">Your order</p>

        <h2>{cart?.items.length || 0} products</h2>

        <div className="checkout-items">
          {cart?.items.map((item) => (
            <div className="checkout-item" key={item.id}>
              <ProtectedProductImage
                image={item.product.protectedImages[0]}
                alt={item.product.title}
              />

              <div>
                <strong>{item.product.title}</strong>
                <span>
                  Size {item.size} · Qty {item.quantity}
                </span>
                {isGuest && (
                  <span style={{ fontSize: '0.75rem', color: '#666' }}>
                    Includes Guest +₹49/item
                  </span>
                )}
              </div>

              <b>
                ₹
                {(
                  (Number(item.product.priceInRupees) + (isGuest ? 49 : 0)) * item.quantity
                ).toLocaleString('en-IN')}
              </b>
            </div>
          ))}
        </div>

        <div className="summary-line">
          <span>Subtotal</span>
          <strong>₹{subtotal.toLocaleString('en-IN')}</strong>
        </div>

        {isGuest && (
          <div className="summary-line">
            <span>Guest Fee (+₹49/item)</span>
            <strong>+₹{guestFeeTotal.toLocaleString('en-IN')}</strong>
          </div>
        )}

        <div className="summary-line">
          <span>Delivery</span>
          <strong>{shipping ? `₹${shipping}` : 'Complimentary'}</strong>
        </div>

        <div className="summary-total">
          <span>Total</span>
          <strong>₹{totalAmount.toLocaleString('en-IN')}</strong>
        </div>
      </aside>
    </div>
  );
}
