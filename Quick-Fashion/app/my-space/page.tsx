'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuctionCard from '@/app/components/AuctionCard';
import { getFitRecommendations, listProducts, type ProductListItem } from '@/lib/api';
import { useAuth } from '@/app/contexts/AuthContext';
export default function MySpacePage() {
 const { user, loading } = useAuth(); const [fit, setFit] = useState<(ProductListItem & { fitDistance: number })[]>([]); const [all, setAll] = useState<ProductListItem[]>([]);
 useEffect(() => { if (!user) return; void Promise.all([getFitRecommendations().catch(() => ({ products: [] })), listProducts()]).then(([fitData, allData]) => { setFit(fitData.products); setAll(allData.products); }); }, [user]);
 if (loading) return <main className="shop-page"><p>Opening your space…</p></main>;
 if (!user) return <main className="shop-page"><h1>Your personal store</h1><p>Sign in to see your fit-led edit.</p><Link href="/auth">Create your space</Link></main>;
 return <main className="shop-page"><header className="shop-header"><p className="eyebrow">YOUR PERSONAL STORE</p><h1>Chosen around you.</h1><p>Your closest fit matches appear first, with the full Quick Fashion collection below.</p></header><section><div className="section-heading"><div><p className="eyebrow">FIT-NEAR GARMENTS</p><h2>Your measurement edit</h2></div><Link href="/shop/my-fit">See all matches</Link></div>{fit.length ? <div className="product-grid">{fit.slice(0,4).map((product) => <AuctionCard key={product.id} product={product} reason="Closest measurement match" />)}</div> : <div className="shop-empty"><p>We are preparing your fit edit. You can still explore every garment below.</p></div>}</section><section className="mt-16"><div className="section-heading"><div><p className="eyebrow">EXPLORE</p><h2>Everything else</h2></div><Link href="/design-lab">Shop all</Link></div><div className="product-grid">{all.slice(0,8).map((product) => <AuctionCard key={product.id} product={product} />)}</div></section></main>;
}