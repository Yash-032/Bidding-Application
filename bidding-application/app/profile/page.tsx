'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProfile, updateProfile } from '@/lib/api';
import type { WalletData } from '@/lib/api';
import { useAuth } from '@/app/contexts/AuthContext';

const sizes = ['XS', 'S', 'M', 'L', 'XL'];
export default function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', bio: '', gender: '', dateOfBirth: '', preferredSizes: [] as string[], address: '', city: '', pinCode: '' });
  const [notice, setNotice] = useState('');
  const [wallet, setWallet] = useState<WalletData | null>(null);
  useEffect(() => {
    if (!loading && !user) router.push('/auth');
    if (user) getProfile().then((data) => { setWallet(data.wallet); setForm({ fullName: data.profile?.fullName || '', email: data.email, phone: data.phone || '', bio: data.profile?.bio || '', gender: data.profile?.gender || '', dateOfBirth: data.profile?.dateOfBirth?.slice(0,10) || '', preferredSizes: data.profile?.preferredSizes || [], address: data.profile?.defaultAddress?.address || '', city: data.profile?.defaultAddress?.city || '', pinCode: data.profile?.defaultAddress?.pinCode || '' }); });
  }, [user, loading, router]);
  const set = (key: keyof typeof form, value: any) => setForm((current) => ({ ...current, [key]: value }));
  return <div className="page-container max-w-3xl"><h1 className="page-title">Your profile</h1><p className="page-subtitle">Save personal details, preferred garment sizes, and your default delivery address.</p>
    <form className="glass-card-static p-6 space-y-5" onSubmit={async (event) => { event.preventDefault(); await updateProfile({ fullName: form.fullName, phone: form.phone, bio: form.bio, gender: form.gender, dateOfBirth: form.dateOfBirth || null, preferredSizes: form.preferredSizes, defaultAddress: { address: form.address, city: form.city, pinCode: form.pinCode } }); setNotice('Profile saved.'); }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5"><div><label className="input-label">Full name</label><input className="input-field" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} /></div><div><label className="input-label">Email</label><input className="input-field" value={form.email} disabled /></div><div><label className="input-label">Phone</label><input className="input-field" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div><div><label className="input-label">Date of birth</label><input className="input-field" type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} /></div></div>
      <div><label className="input-label">Gender</label><input className="input-field" value={form.gender} onChange={(e) => set('gender', e.target.value)} /></div><div><label className="input-label">About you</label><textarea className="input-field" value={form.bio} onChange={(e) => set('bio', e.target.value)} /></div>
      <div><label className="input-label">Preferred sizes</label><div className="size-options">{sizes.map((size) => <button type="button" key={size} className={form.preferredSizes.includes(size) ? 'active' : ''} onClick={() => set('preferredSizes', form.preferredSizes.includes(size) ? form.preferredSizes.filter((item) => item !== size) : [...form.preferredSizes, size])}>{size}</button>)}</div></div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5"><div className="sm:col-span-3"><label className="input-label">Address</label><input className="input-field" value={form.address} onChange={(e) => set('address', e.target.value)} /></div><div><label className="input-label">City</label><input className="input-field" value={form.city} onChange={(e) => set('city', e.target.value)} /></div><div><label className="input-label">PIN code</label><input className="input-field" value={form.pinCode} onChange={(e) => set('pinCode', e.target.value)} /></div></div>
      <button className="btn-primary">Save profile</button>{notice && <span className="ml-4 text-sm">{notice}</span>}
    </form>
    <section className="glass-card-static p-6 mt-8">
      <div className="flex justify-between items-start gap-5 mb-6"><div><p className="eyebrow">Bidding wallet</p><h2 className="text-3xl">Virtual credits</h2><p className="text-sm text-[var(--foreground-muted)] mt-2">Credits can only be granted or adjusted by an administrator and are used exclusively for bidding.</p></div><div className="text-right"><strong className="text-3xl">{wallet?.availableBalance || '0'}</strong><span className="block text-xs">available</span><span className="block text-xs text-[var(--foreground-muted)]">{wallet?.lockedBalance || '0'} locked</span></div></div>
      <h3 className="text-xl mb-4">Ledger entries</h3>
      {wallet?.recentLedger.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b border-[var(--border)]"><th className="py-3">Type</th><th>Amount</th><th>Balance</th><th>Date</th></tr></thead><tbody>{wallet.recentLedger.map((entry) => <tr className="border-b border-[var(--border)]" key={entry.id}><td className="py-3">{entry.type.replaceAll('_',' ')}</td><td>{Number(entry.amount) > 0 ? '+' : ''}{entry.amount}</td><td>{entry.balanceAfter}</td><td>{new Date(entry.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div> : <p className="text-sm text-[var(--foreground-muted)]">No credit activity yet.</p>}
    </section>
  </div>;
}
