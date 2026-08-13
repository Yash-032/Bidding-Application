'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  return (
    <>
      <div className="announcement-bar">Complimentary delivery on orders above &#8377;10,000 &middot; Secure direct checkout</div>
      <nav className="main-nav">
        <div className="nav-inner">
          <div className="nav-left">
            <Link href="/categories">Categories</Link><Link href="/shop">Shop all</Link><Link href="/shop?category=shirt">Shirts</Link><Link href="/auctions">Live Bids</Link><Link href="/shop/visual-search" className="vs-nav-link">Visual Search</Link>
          </div>
          <Link
            href="/"
            className="brand-wordmark brand-texture-reveal"
            aria-label="Quick Fashion home"
            onPointerMove={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              event.currentTarget.style.setProperty('--brand-reveal-x', `${event.clientX - bounds.left}px`);
              event.currentTarget.style.setProperty('--brand-reveal-y', `${event.clientY - bounds.top}px`);
            }}
            onPointerLeave={(event) => {
              event.currentTarget.style.setProperty('--brand-reveal-x', '50%');
              event.currentTarget.style.setProperty('--brand-reveal-y', '50%');
            }}
          >
            <span className="brand-texture-base">Quick Fashion</span>
            <span className="brand-texture-hindi" aria-hidden="true"><span>क्विक फैशन</span></span>
          </Link>
          <div className="nav-right">
            {user?.role === 'ADMIN' && <Link href="/admin">Admin</Link>}
            {user && <Link href="/profile">Profile</Link>}
            {user && <Link href="/notifications">Updates</Link>}
            {user ? <button onClick={logout}>Sign out</button> : <Link href="/auth">Sign in</Link>}
            <Link href="/cart" aria-label="Shopping bag">Bag</Link>
            <a href="/api/auth/pixa/login" aria-label="login">Get Started with Pixa</a>
          </div>
        </div>
        <div className="mobile-nav"><Link href="/shop">Shop</Link><Link href="/categories">Categories</Link><Link href="/auctions">Auction</Link><Link href="/shop/visual-search">&#128247; Search</Link><Link href="/cart">Bag</Link></div>
      </nav>
    </>
  );
}
