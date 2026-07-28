'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';
import { useToast } from '@/app/components/Toast';
import {
  adminAdjustCredits,
  adminCreateAuction,
  adminVoidAuction,
  createProduct,
  getCategories,
  triggerActivation,
  triggerSettlement,
  type CategoryTreeNode,
} from '@/lib/api';

const productSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
type CategoryOption = CategoryTreeNode & { depth: number };

function flattenCategories(categories: CategoryTreeNode[], depth = 0): CategoryOption[] {
  return categories.flatMap((category) => [
    { ...category, depth },
    ...flattenCategories(category.children, depth + 1),
  ]);
}

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);

  // Credit adjustment form states
  const [targetUserId, setTargetUserId] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  // Void auction form states
  const [voidAuctionId, setVoidAuctionId] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  // Scheduler execution status states
  const [schedulingActive, setSchedulingActive] = useState(false);
  const [schedulingSettle, setSchedulingSettle] = useState(false);
  const [auctionForm, setAuctionForm] = useState({ productId: '', auctionModel: 'ENGLISH', startingPriceCredits: '', startTime: '', endTime: '', minIncrement: '1', bidFee: '', priceStepPerBid: '', antiSnipingWindowSeconds: '30' });
  const [creatingAuction, setCreatingAuction] = useState(false);
  const [categories, setCategories] = useState<CategoryTreeNode[]>([]);
  const [productForm, setProductForm] = useState({ title: '', description: '', priceInRupees: '', categoryPath: '', stockQuantity: '1' });
  const [imageUrls, setImageUrls] = useState(['']);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [selectedProductSizes, setSelectedProductSizes] = useState(['M']);
  const [creatingProduct, setCreatingProduct] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push('/auth');
      return;
    }
    if (user.role !== 'ADMIN') {
      toast('Access denied. Admin portal requires administrative privileges.', 'error');
      router.push('/');
      return;
    }
    setLoading(false);
  }, [user, router]);

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    getCategories()
      .then((result) => setCategories(result.categories))
      .catch((error) => toast(error instanceof Error ? error.message : 'Could not load categories', 'error'));
  }, [user, toast]);

  const handleCreateProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    const images = imageUrls.map((url) => url.trim()).filter(Boolean);
    if (!images.length) return toast('Add at least one product image URL.', 'error');
    if (!selectedProductSizes.length) return toast('Select at least one available size.', 'error');

    setCreatingProduct(true);
    try {
      const result = await createProduct({
        title: productForm.title.trim(),
        description: productForm.description.trim(),
        images,
        priceInRupees: productForm.priceInRupees,
        categoryPath: productForm.categoryPath,
        availableSizes: selectedProductSizes,
        stockQuantity: Number(productForm.stockQuantity),
      });
      setAuctionForm((current) => ({ ...current, productId: result.product.id }));
      setProductForm({ title: '', description: '', priceInRupees: '', categoryPath: '', stockQuantity: '1' });
      setImageUrls(['']);
      setSelectedProductSizes(['M']);
      toast(`Product created. ID: ${result.product.id}`, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not create product', 'error');
    } finally {
      setCreatingProduct(false);
    }
  };

  const handleAdjustCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUserId || !adjustAmount || !adjustReason) {
      toast('All credit adjustment fields are required', 'error');
      return;
    }

    setAdjusting(true);
    try {
      const res = await adminAdjustCredits(targetUserId, adjustAmount, adjustReason);
      toast(`Successfully updated wallet! Available: 🪙 ${res.availableBalance}`, 'success');
      setTargetUserId('');
      setAdjustAmount('');
      setAdjustReason('');
    } catch (err: any) {
      toast(err.message || 'Failed to adjust credits', 'error');
    } finally {
      setAdjusting(false);
    }
  };

  const handleVoidAuction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidAuctionId || !voidReason) {
      toast('Auction ID and reason are required to void', 'error');
      return;
    }

    setVoiding(true);
    try {
      const res = await adminVoidAuction(voidAuctionId, voidReason);
      toast(`Auction voided. Cancelled status. Refunded bids count: ${res.refundedBidCount}`, 'success');
      setVoidAuctionId('');
      setVoidReason('');
    } catch (err: any) {
      toast(err.message || 'Failed to void auction', 'error');
    } finally {
      setVoiding(false);
    }
  };

  const runActivationTask = async () => {
    setSchedulingActive(true);
    try {
      const res = await triggerActivation();
      toast(`Activation task run successfully. Activated ${res.activatedCount} auctions.`, 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to activate auctions', 'error');
    } finally {
      setSchedulingActive(false);
    }
  };

  const runSettlementTask = async () => {
    setSchedulingSettle(true);
    try {
      const res = await triggerSettlement();
      toast(`Settlement task run successfully. Settled ${res.settledCount} auctions.`, 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to settle auctions', 'error');
    } finally {
      setSchedulingSettle(false);
    }
  };

  const previewImageUrls = imageUrls.map((url) => url.trim()).filter(Boolean);
  const selectedPreviewImage = previewImageUrls[previewImageIndex];

  useEffect(() => {
    setPreviewImageIndex((current) => previewImageUrls.length ? Math.min(current, previewImageUrls.length - 1) : 0);
  }, [previewImageUrls.length]);

  if (loading) {
    return (
      <div className="page-container flex flex-col gap-6">
        <div className="skeleton h-12 w-1/4" />
        <div className="skeleton h-60 w-full" />
      </div>
    );
  }

  return (
    <div className="page-container max-w-6xl">
      <div className="mb-10">
        <h1 className="page-title text-white">Admin Operations Portal</h1>
        <p className="page-subtitle mb-0">Manage products, wallet adjustments, auction lifecycles, and void operations.</p>
      </div>

      <section className="admin-product-panel glass-card-static">
        <div className="admin-product-heading">
          <div>
            <p className="eyebrow">Catalog management</p>
            <h2>Add a product</h2>
            <p>Create a complete shop listing. The new product ID is copied into the auction form automatically.</p>
          </div>
        </div>

        <form onSubmit={handleCreateProduct} className="admin-product-form">
          <div className="admin-product-fields">
            <div className="admin-field-wide"><label className="input-label">Product title</label><input className="input-field" required value={productForm.title} onChange={(event) => setProductForm({ ...productForm, title: event.target.value })} placeholder="Classic Half Sleeve Cotton Shirt" /></div>
            <div className="admin-field-wide"><label className="input-label">Description</label><textarea className="input-field" required value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} placeholder="Describe the material, fit, finish, and intended use." /></div>
            <div><label className="input-label">Retail price (₹)</label><input className="input-field" type="number" min="1" step="1" required value={productForm.priceInRupees} onChange={(event) => setProductForm({ ...productForm, priceInRupees: event.target.value })} /></div>
            <div><label className="input-label">Stock quantity</label><input className="input-field" type="number" min="0" step="1" required value={productForm.stockQuantity} onChange={(event) => setProductForm({ ...productForm, stockQuantity: event.target.value })} /></div>
            <div className="admin-field-wide"><label className="input-label">Category</label><select className="input-field" required value={productForm.categoryPath} onChange={(event) => setProductForm({ ...productForm, categoryPath: event.target.value })}><option value="">Select a leaf category</option>{flattenCategories(categories).map((category) => <option key={category.id} value={category.path} disabled={category.children.length > 0}>{`${'— '.repeat(category.depth)}${category.name} (${category.path})`}</option>)}</select></div>

            <fieldset className="admin-field-wide admin-sizes">
              <legend className="input-label">Available sizes</legend>
              <div className="size-options">{productSizes.map((size) => <button type="button" key={size} className={selectedProductSizes.includes(size) ? 'active' : ''} onClick={() => setSelectedProductSizes((current) => current.includes(size) ? current.filter((item) => item !== size) : [...current, size])}>{size}</button>)}</div>
            </fieldset>

            <fieldset className="admin-field-wide admin-images">
              <legend className="input-label">Product image URLs</legend>
              {imageUrls.map((url, index) => (
                <div className="admin-image-row" key={index}>
                  <input className="input-field" type="url" required={index === 0} value={url} onChange={(event) => setImageUrls((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={`Image ${index + 1} URL`} />
                  {imageUrls.length > 1 && <button type="button" onClick={() => setImageUrls((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>}
                </div>
              ))}
              <button className="admin-add-image" type="button" onClick={() => setImageUrls((current) => [...current, ''])}>+ Add another image URL</button>
            </fieldset>
            <button className="btn-primary admin-publish-product" disabled={creatingProduct}>{creatingProduct ? 'Publishing product…' : 'Publish product'}</button>
          </div>

          <aside className="admin-product-preview">
            <p className="eyebrow">Image preview</p>
            <div className="admin-preview-frame" aria-live="polite">
              {selectedPreviewImage ? <img src={selectedPreviewImage} alt={`Product preview ${previewImageIndex + 1}`} /> : <span>Add image URLs to preview them here.</span>}
            </div>
            {previewImageUrls.length > 1 && <div className="admin-preview-navigation">
              <button type="button" onClick={() => setPreviewImageIndex((current) => (current - 1 + previewImageUrls.length) % previewImageUrls.length)} aria-label="Previous preview image">←</button>
              <span>{previewImageIndex + 1} / {previewImageUrls.length}</span>
              <button type="button" onClick={() => setPreviewImageIndex((current) => (current + 1) % previewImageUrls.length)} aria-label="Next preview image">→</button>
            </div>}
            <strong>{productForm.title || 'Untitled product'}</strong>
            <small>{productForm.priceInRupees ? `₹${Number(productForm.priceInRupees).toLocaleString('en-IN')}` : 'Price preview'}</small>
          </aside>
        </form>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-slideUp">
        <div className="glass-card-static p-6 space-y-6">
          <div><h3 className="text-lg font-bold mb-2">Create product auction</h3><p className="text-xs text-[var(--foreground-muted)]">Select an existing shop product and explicitly schedule it for bidding.</p></div>
          <form className="space-y-4" onSubmit={async (event) => {
            event.preventDefault(); setCreatingAuction(true);
            try { await adminCreateAuction(auctionForm.productId, { ...auctionForm, startTime: new Date(auctionForm.startTime).toISOString(), endTime: new Date(auctionForm.endTime).toISOString() }); toast('Auction scheduled for this product.', 'success'); }
            catch (error) { toast(error instanceof Error ? error.message : 'Could not create auction', 'error'); }
            finally { setCreatingAuction(false); }
          }}>
            <div><label className="input-label">Product ID</label><input className="input-field" required value={auctionForm.productId} onChange={(e) => setAuctionForm({...auctionForm, productId:e.target.value})} /></div>
            <div><label className="input-label">Auction strategy</label><select className="input-field" value={auctionForm.auctionModel} onChange={(e) => setAuctionForm({...auctionForm, auctionModel:e.target.value})}><option value="ENGLISH">English — highest bid wins</option><option value="PENNY" disabled>Penny — coming after bid-fee settlement support</option><option value="SEALED_BID" disabled>Sealed bid — coming after private-bid support</option></select><p className="text-xs text-[var(--foreground-muted)] mt-2">English auctions are fully supported. Other strategies remain unavailable until their distinct settlement rules are implemented.</p></div>
            <div><label className="input-label">Starting bid credits</label><input className="input-field" type="number" min="1" required value={auctionForm.startingPriceCredits} onChange={(e) => setAuctionForm({...auctionForm, startingPriceCredits:e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="input-label">Start</label><input className="input-field" type="datetime-local" required value={auctionForm.startTime} onChange={(e) => setAuctionForm({...auctionForm, startTime:e.target.value})} /></div><div><label className="input-label">End</label><input className="input-field" type="datetime-local" required value={auctionForm.endTime} onChange={(e) => setAuctionForm({...auctionForm, endTime:e.target.value})} /></div></div>
            <div><label className="input-label">Minimum increment</label><input className="input-field" type="number" min="1" value={auctionForm.minIncrement} onChange={(e) => setAuctionForm({...auctionForm, minIncrement:e.target.value})} /></div>
            {auctionForm.auctionModel === 'PENNY' && <div className="grid grid-cols-2 gap-3"><div><label className="input-label">Bid fee (credits)</label><input className="input-field" type="number" min="1" required value={auctionForm.bidFee} onChange={(e) => setAuctionForm({...auctionForm, bidFee:e.target.value})} /></div><div><label className="input-label">Price step</label><input className="input-field" type="number" min="1" required value={auctionForm.priceStepPerBid} onChange={(e) => setAuctionForm({...auctionForm, priceStepPerBid:e.target.value})} /></div></div>}
            <div><label className="input-label">Anti-sniping window (seconds)</label><input className="input-field" type="number" min="0" value={auctionForm.antiSnipingWindowSeconds} onChange={(e) => setAuctionForm({...auctionForm, antiSnipingWindowSeconds:e.target.value})} /></div>
            <button className="w-full btn-primary" disabled={creatingAuction}>{creatingAuction ? 'Scheduling…' : 'Schedule auction'}</button>
          </form>
        </div>
        {/* Left Column: Adjust Credits Form */}
        <div className="glass-card-static p-6 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-black mb-2">Adjust User Credits</h3>
            <p className="text-xs text-[var(--foreground-muted)]">Manually credit or debit user balances. Negative values debit.</p>
          </div>

          <form onSubmit={handleAdjustCredits} className="space-y-4">
            <div>
              <label className="input-label">Target User ID</label>
              <input
                type="text"
                placeholder="Paste UUID..."
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="input-label">Adjustment Amount (Credits)</label>
              <input
                type="number"
                placeholder="e.g. 500 or -200"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="input-label">Reason</label>
              <textarea
                placeholder="Reason for bookkeeping log..."
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <button
              type="submit"
              disabled={adjusting}
              className="w-full btn-primary text-sm font-bold"
            >
              {adjusting ? 'Adjusting...' : 'Apply Wallet Adjustment'}
            </button>
          </form>
        </div>

        {/* Center Column: Void Auction Form */}
        <div className="glass-card-static p-6 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-black mb-2">Void / Cancel Auction</h3>
            <p className="text-xs text-[var(--foreground-muted)]">Voids an auction, marks it CANCELLED, and releases/refunds all active bids.</p>
          </div>

          <form onSubmit={handleVoidAuction} className="space-y-4">
            <div>
              <label className="input-label">Auction ID</label>
              <input
                type="text"
                placeholder="Paste Auction UUID..."
                value={voidAuctionId}
                onChange={(e) => setVoidAuctionId(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="input-label">Reason for Voiding</label>
              <textarea
                placeholder="e.g. Seller request, suspicious bidding..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <button
              type="submit"
              disabled={voiding}
              className="w-full btn-danger text-sm font-bold border border-red-500/20"
            >
              {voiding ? 'Voiding...' : '⚠️ Void Auction & Refund Users'}
            </button>
          </form>
        </div>

        {/* Right Column: LifeCycle Scheduler Task Triggers */}
        <div className="glass-card-static p-6 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-black mb-2">Lifecycle Schedulers</h3>
            <p className="text-xs text-[var(--foreground-muted)]">Manually trigger automated activation and settlement engines.</p>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-[var(--background-secondary)] rounded-xl border border-[var(--border)]">
              <h4 className="font-semibold text-sm text-black mb-2">Auction Activation</h4>
              <p className="text-xs text-[var(--foreground-muted)] mb-4">
                Looks up all scheduled auctions whose start time has passed and changes status to ACTIVE.
              </p>
              <button
                onClick={runActivationTask}
                disabled={schedulingActive}
                className="w-full btn-secondary btn-small font-bold"
              >
                {schedulingActive ? 'Activating...' : 'Run Activation Engine'}
              </button>
            </div>

            <div className="p-4 bg-[var(--background-secondary)] rounded-xl border border-[var(--border)]">
              <h4 className="font-semibold text-sm text-black mb-2">Auction Settlement</h4>
              <p className="text-xs text-[var(--foreground-muted)] mb-4">
                Closes expired ACTIVE auctions, assigns orders, deducts winners, and releases losers.
              </p>
              <button
                onClick={runSettlementTask}
                disabled={schedulingSettle}
                className="w-full btn-secondary btn-small font-bold"
              >
                {schedulingSettle ? 'Settling...' : 'Run Settlement Engine'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
