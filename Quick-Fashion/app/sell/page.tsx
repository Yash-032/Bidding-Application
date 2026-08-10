'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';
import { useToast } from '@/app/components/Toast';
import { createProduct, getCategories, uploadProductImages, type CategoryTreeNode } from '@/lib/api';

const sizes = ['XS', 'S', 'M', 'L', 'XL'];
type CategoryOption = CategoryTreeNode & { depth: number };

function flattenCategories(categories: CategoryTreeNode[], depth = 0): CategoryOption[] {
  return categories.flatMap((category) => [
    { ...category, depth },
    ...flattenCategories(category.children, depth + 1),
  ]);
}

export default function SellPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({ title: '', description: '', price: '', categoryPath: '', stock: '1', shoulderWidth: '', chest: '', waist: '', hip: '', neck: '', sleeveLength: '', armLength: '', thigh: '', calf: '' });
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [categories, setCategories] = useState<CategoryTreeNode[]>([]);
  const [selectedSizes, setSelectedSizes] = useState(['M']);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
    } else if (user.role === 'BUYER') {
      router.replace('/');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    getCategories().then((result) => setCategories(result.categories)).catch(() => {
      toast('Could not load product categories.', 'error');
    });
  }, [toast]);

  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const fitFields = ['shoulderWidth', 'chest', 'waist', 'hip', 'neck', 'sleeveLength', 'armLength', 'thigh', 'calf'] as const;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      if (!imageFiles.length) throw new Error('Upload at least one product image');
      const protectedUpload = await uploadProductImages(imageFiles);
      await createProduct({ title: form.title, description: form.description, protectedImageIds: protectedUpload.images.map((image) => image.id), priceInRupees: form.price, categoryPath: form.categoryPath, availableSizes: selectedSizes, stockQuantity: Number(form.stock), fitMeasurements: Object.fromEntries(fitFields.map((field) => [field, Number(form[field])])) });
      toast('Product added to the shop. An admin can optionally create an auction for it.', 'success');
      router.push('/shop');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not add product', 'error');
    } finally { setLoading(false); }
  };

  return (
    <div className="page-container max-w-3xl">
      <h1 className="page-title">Add a shop product</h1>
      <p className="page-subtitle">Products are published for regular shopping. Auctions are created separately by administrators.</p>
      <form onSubmit={submit} className="glass-card-static p-6 space-y-5">
        <div><label className="input-label">Product title</label><input className="input-field" required value={form.title} onChange={(e) => set('title', e.target.value)} /></div>
        <div><label className="input-label">Description</label><textarea className="input-field" required value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
        <div><label className="input-label">Protected product images</label><input className="input-field" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple required onChange={(event) => setImageFiles(Array.from(event.target.files ?? []))} /><small>Files are kept private and tiled automatically.</small></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div><label className="input-label">Retail price</label><input className="input-field" type="number" min="1" required value={form.price} onChange={(e) => set('price', e.target.value)} /></div>
          <div><label className="input-label">Category</label><select className="input-field" required value={form.categoryPath} onChange={(e) => set('categoryPath', e.target.value)}><option value="">Select a category</option>{flattenCategories(categories).map((category) => <option key={category.id} value={category.path} disabled={category.children.length > 0}>{`${''.repeat(category.depth)}${category.name}`}</option>)}</select></div>
          <div><label className="input-label">Stock quantity</label><input className="input-field" type="number" min="0" required value={form.stock} onChange={(e) => set('stock', e.target.value)} /></div>
        </div>
        <fieldset className="space-y-3"><legend className="input-label">Garment measurements (cm)</legend><p className="text-sm text-[var(--foreground-muted)]">Enter the finished garment measurements. They are used only for fit matching.</p><div className="grid grid-cols-2 sm:grid-cols-3 gap-4">{fitFields.map((field) => <label key={field} className="input-label capitalize">{field.replace(/([A-Z])/g, " $1")}<input className="input-field mt-1" type="number" min="0.1" step="0.1" required value={form[field]} onChange={(event) => set(field, event.target.value)} /></label>)}</div></fieldset> <div><label className="input-label">Available sizes</label><div className="size-options">{sizes.map((size) => <button type="button" key={size} className={selectedSizes.includes(size) ? 'active' : ''} onClick={() => setSelectedSizes((current) => current.includes(size) ? current.filter((item) => item !== size) : [...current, size])}>{size}</button>)}</div></div>
        <button className="btn-primary" disabled={loading}>{loading ? 'Publishing…' : 'Publish to shop'}</button>
      </form>
    </div>
  );
}
