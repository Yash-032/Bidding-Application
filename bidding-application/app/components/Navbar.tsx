'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  return (
    <>
      <div className="announcement-bar">Complimentary delivery on orders above ₹10,000 · Secure direct checkout</div>
      <nav className="main-nav">
        <div className="nav-inner">
          <div className="nav-left">
            <Link href="/categories">Categories</Link><Link href="/shop">Shop all</Link><Link href="/shop?category=shirt">Shirts</Link><Link href="/auctions">Auction</Link>
          </div>
          <Link href="/" className="brand-wordmark" aria-label="Quick Fashion home">Quick Fashion</Link>
          <div className="nav-right">
            {user?.role === 'ADMIN' && <Link href="/admin">Admin</Link>}
            {user && <Link href="/profile">Profile</Link>}
            {user && <Link href="/notifications">Updates</Link>}
            {user ? <button onClick={logout}>Sign out</button> : <Link href="/auth">Sign in</Link>}
            <Link href="/cart" aria-label="Shopping bag">Bag</Link>
          </div>
        </div>
        <div className="mobile-nav"><Link href="/shop">Shop</Link><Link href="/categories">Categories</Link><Link href="/auctions">Auction</Link><Link href="/cart">Bag</Link></div>
      </nav>
      {pathname === '/' && <div className="category-bar"><Link href="/shop">New arrivals</Link><Link href="/shop?category=shirt">Shirts</Link><Link href="/shop?category=t-shirt">T-Shirts</Link><Link href="/shop?category=bottoms">Bottoms</Link><Link href="/shop?category=jackets">Jackets</Link><Link href="/categories">All categories</Link></div>}
    </>
  );
}
