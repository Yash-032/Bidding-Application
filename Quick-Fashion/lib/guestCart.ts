/* ============================================================
   Guest Cart Utility
   Stores & manages cart items in localStorage for unauthenticated users
   ============================================================ */

export interface GuestCartProduct {
  id: string;
  title: string;
  priceInRupees: string;
  protectedImages: Array<{ id: string; width: number; height: number }>;
  category: string;
  categoryId: string | null;
  categoryNode: { id: string; name: string; path: string } | null;
  availableSizes: string[];
  stockQuantity: number;
  isActive: boolean;
}

export interface GuestCartItem {
  id: string;
  size: string;
  quantity: number;
  product: GuestCartProduct;
}

const GUEST_CART_KEY = 'quick_fashion_guest_cart';

export function getGuestCart(): GuestCartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(GUEST_CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveGuestCart(items: GuestCartItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event('guest_cart_updated'));
  } catch (error) {
    console.error('Failed to save guest cart to localStorage', error);
  }
}

export function addGuestCartItem(product: GuestCartProduct, size: string, quantity = 1): GuestCartItem[] {
  const items = getGuestCart();
  const itemId = `guest_${product.id}_${size}`;
  const existingIndex = items.findIndex((i) => i.id === itemId);

  if (existingIndex >= 0) {
    items[existingIndex].quantity = Math.min(10, items[existingIndex].quantity + quantity);
  } else {
    items.push({
      id: itemId,
      size,
      quantity: Math.min(10, quantity),
      product: {
        id: product.id,
        title: product.title,
        priceInRupees: String(product.priceInRupees),
        protectedImages: product.protectedImages || [],
        category: product.category || 'OTHER',
        categoryId: product.categoryId || null,
        categoryNode: product.categoryNode || null,
        availableSizes: product.availableSizes || [],
        stockQuantity: product.stockQuantity ?? 10,
        isActive: product.isActive ?? true,
      },
    });
  }

  saveGuestCart(items);
  return items;
}

export function updateGuestCartItem(itemId: string, quantity: number): GuestCartItem[] {
  let items = getGuestCart();
  if (quantity <= 0) {
    items = items.filter((i) => i.id !== itemId);
  } else {
    items = items.map((i) => (i.id === itemId ? { ...i, quantity: Math.min(10, Math.max(1, quantity)) } : i));
  }
  saveGuestCart(items);
  return items;
}

export function removeGuestCartItem(itemId: string): GuestCartItem[] {
  const items = getGuestCart().filter((i) => i.id !== itemId);
  saveGuestCart(items);
  return items;
}

export function clearGuestCart(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(GUEST_CART_KEY);
  window.dispatchEvent(new Event('guest_cart_updated'));
}
