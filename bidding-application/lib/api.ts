/* ============================
   API Client — typed fetch helpers with auth token management
   ============================ */

const API_BASE = '';
const inFlightGets = new Map<string, Promise<unknown>>();

/* ---- Token management ---- */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('bidding_token');
}

export function setToken(token: string) {
  localStorage.setItem('bidding_token', token);
}

export function clearToken() {
  localStorage.removeItem('bidding_token');
}

/* ---- Typed fetch wrapper ---- */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const method = (init?.method || 'GET').toUpperCase();
  const execute = async () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string>),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    const data = await res.json();
    if (!res.ok) throw new ApiError(data.error ?? 'Something went wrong', res.status);
    return data as T;
  };

  if (method !== 'GET') return execute();

  const requestKey = `${token || 'anonymous'}:${path}`;
  const existing = inFlightGets.get(requestKey);
  if (existing) return existing as Promise<T>;

  const request = execute().finally(() => inFlightGets.delete(requestKey));
  inFlightGets.set(requestKey, request);
  return request;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/* ============================================================
   Auth
   ============================================================ */
export interface AuthUser { id: string; email: string; role: string }

export async function signup(email: string, password: string, phone?: string) {
  return apiFetch<{ user: AuthUser; verificationToken: string }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, phone }),
  });
}

export async function login(email: string, password: string) {
  const result = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(result.token);
  return result;
}

export async function verifyEmail(userId: string, token: string) {
  return apiFetch<{ verified: boolean }>('/api/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ userId, token }),
  });
}

/* ============================================================
   Products / Catalog
   ============================================================ */
export interface ProductAuction {
  id: string;
  productId: string;
  auctionModel: string;
  status: string;
  startTime: string;
  endTime: string;
  currentHighestBidId: string | null;
  startingPriceCredits: string;
  minIncrement: string;
  bidFee: string | null;
  priceStepPerBid: string | null;
  antiSnipingWindowSeconds: number;
  version: number;
}

export interface ProductListItem {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  images: string[];
  priceInRupees: string;
  category: string;
  categoryId: string | null;
  categoryNode: CategorySummary | null;
  availableSizes: string[];
  stockQuantity: number;
  isActive: boolean;
  createdAt: string;
  auction: ProductAuction | null;
}

export interface User {
  id: string;
  email: string;
  role: string;
  profile: { fullName: string | null } | null;
}

export interface BidItem {
  id: string;
  auctionId: string;
  user: User;
  amountCredits: string;
  status: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface ProductDetail extends ProductListItem {
  seller: { id: string; email: string };
  auction: (ProductAuction & { bids: BidItem[] }) | null;
}

export async function listProducts(params?: { search?: string; category?: string; auctionsOnly?: boolean; endingSoon?: boolean; page?: number }) {
  const sp = new URLSearchParams();
  if (params?.search) sp.set('search', params.search);
  if (params?.category) sp.set('category', params.category);
  if (params?.auctionsOnly) sp.set('auctionsOnly', 'true');
  if (params?.endingSoon) sp.set('endingSoon', 'true');
  if (params?.page) sp.set('page', String(params.page));
  return apiFetch<{ products: ProductListItem[] }>(`/api/products?${sp.toString()}`);
}

export async function getProductDetail(id: string) {
  return apiFetch<ProductDetail>(`/api/products/${id}`);
}

export async function createProduct(body: {
  title: string;
  description: string;
  images: string[];
  priceInRupees: string;
  categoryPath: string;
  availableSizes: string[];
  stockQuantity: number;
}) {
  return apiFetch<{ product: ProductListItem }>('/api/products', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  path: string;
  parentId: string | null;
}

export interface CategoryTreeNode extends CategorySummary {
  sortOrder: number;
  productCount: number;
  children: CategoryTreeNode[];
}

export const getCategories = () => apiFetch<{ categories: CategoryTreeNode[] }>('/api/categories');

export interface CartItem {
  id: string;
  size: string;
  quantity: number;
  product: {
    id: string;
    title: string;
    images: string[];
    priceInRupees: string;
    category: string;
    categoryId: string | null;
    categoryNode: Pick<CategorySummary, 'id' | 'name' | 'path'> | null;
    availableSizes: string[];
    stockQuantity: number;
    isActive: boolean;
  };
}
export interface CartData { id: string; items: CartItem[] }
export const getCart = () => apiFetch<CartData>('/api/cart');
export const addToCart = (productId: string, size: string, quantity = 1) => apiFetch<{ added: true; itemId: string }>('/api/cart', { method: 'POST', body: JSON.stringify({ productId, size, quantity }) });
export const updateCartItem = (itemId: string, quantity: number) => apiFetch<CartData>('/api/cart', { method: 'PATCH', body: JSON.stringify({ itemId, quantity }) });
export const removeCartItem = (itemId: string) => apiFetch<CartData>(`/api/cart?itemId=${encodeURIComponent(itemId)}`, { method: 'DELETE' });

export interface UserProfileData {
  id: string;
  email: string;
  phone: string | null;
  role: string;
  profile: { fullName: string | null; bio: string | null; gender: string | null; dateOfBirth: string | null; preferredSizes: string[]; defaultAddress: Record<string, string> | null } | null;
  wallet: WalletData | null;
}
export const getProfile = () => apiFetch<UserProfileData>('/api/profile');
export const updateProfile = (body: Record<string, unknown>) => apiFetch<UserProfileData>('/api/profile', { method: 'PATCH', body: JSON.stringify(body) });
export const adminCreateAuction = (productId: string, body: Record<string, unknown>) => apiFetch<{ auction: ProductAuction }>(`/api/admin/products/${productId}/auction`, { method: 'POST', body: JSON.stringify(body) });

/* ============================================================
   Auctions
   ============================================================ */
export interface AuctionDetail {
  id: string;
  productId: string;
  auctionModel: string;
  status: string;
  startTime: string;
  endTime: string;
  currentHighestBidId: string | null;
  minIncrement: string;
  bidFee: string | null;
  priceStepPerBid: string | null;
  antiSnipingWindowSeconds: number;
  version: number;
  product: { id: string; sellerId: string; title: string; description: string; images: string[]; priceInRupees: string; createdAt: string };
  bids: BidItem[];
}

export async function getAuctionDetail(id: string) {
  return apiFetch<AuctionDetail>(`/api/auctions/${id}`);
}

export async function placeBid(auctionId: string, amountCredits: string, idempotencyKey: string) {
  return apiFetch<{ bid: BidItem }>(`/api/auctions/${auctionId}/bids`, {
    method: 'POST',
    body: JSON.stringify({ amountCredits, idempotencyKey }),
  });
}

export async function watchAuction(auctionId: string) {
  return apiFetch<{ watching: boolean }>(`/api/auctions/${auctionId}/watch`, { method: 'POST' });
}

export async function unwatchAuction(auctionId: string) {
  return apiFetch<{ watching: boolean }>(`/api/auctions/${auctionId}/watch`, { method: 'DELETE' });
}

/* ============================================================
   Wallet
   ============================================================ */
export interface LedgerEntry {
  id: string;
  walletId: string;
  type: string;
  amount: string;
  referenceId: string | null;
  referenceType: string | null;
  balanceAfter: string;
  createdAt: string;
}

export interface WalletData {
  availableBalance: string;
  lockedBalance: string;
  recentLedger: LedgerEntry[];
}

export async function getWallet() {
  return apiFetch<WalletData>('/api/wallet');
}

/* ============================================================
   Notifications
   ============================================================ */
export interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  channel: string;
  payload: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

export async function getNotifications(unreadOnly = false) {
  const sp = unreadOnly ? '?unreadOnly=true' : '';
  return apiFetch<{ notifications: NotificationItem[] }>(`/api/notifications${sp}`);
}

export async function markNotificationRead(notificationId: string) {
  return apiFetch<{ read: boolean }>('/api/notifications', {
    method: 'PATCH',
    body: JSON.stringify({ notificationId }),
  });
}

/* ============================================================
   Admin
   ============================================================ */
export async function adminAdjustCredits(targetUserId: string, amount: string, reason: string) {
  return apiFetch<{ availableBalance: string; lockedBalance: string }>('/api/admin/credit-adjustment', {
    method: 'POST',
    body: JSON.stringify({ targetUserId, amount, reason }),
  });
}

export async function adminVoidAuction(auctionId: string, reason: string) {
  return apiFetch<{ voided: boolean; refundedBidCount: number }>(`/api/admin/auctions/${auctionId}/void`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

/* ============================================================
   Scheduler (Admin/Cron)
   ============================================================ */
export async function triggerActivation() {
  return apiFetch<{ activatedCount: number }>('/api/auctions/activate', { method: 'POST' });
}

export async function triggerSettlement() {
  return apiFetch<{ settledCount: number; results: unknown[] }>('/api/auctions/settle', { method: 'POST' });
}
