'use client';
import { useEffect, useState } from 'react';
export function clearGuestMode() { if (typeof window !== 'undefined') localStorage.removeItem('quick-fashion-guest-mode'); }
export function GuestPrice({ price }: { price: string | number }) {
  const [guest, setGuest] = useState(false);
  useEffect(() => setGuest(localStorage.getItem('quick-fashion-guest-mode') === 'true'), []);
  const amount = Number(price || 0) + (guest ? 49 : 0);
  return <p className="product-price">₹{amount.toLocaleString('en-IN')}{guest && <small className="guest-surcharge"> Guest +₹49</small>}</p>;
}