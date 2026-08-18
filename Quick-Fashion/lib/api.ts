/* ============================
   API Client ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â typed fetch helpers with auth token management
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers,
        signal: init?.signal || controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (!res.ok) throw new ApiError(data.error ?? 'Something went wrong', res.status);
      return data as T;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ApiError('Request timed out. Please try again.', 504);
      }
      throw err;
    }
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

export async function requestEmailOtp(email: string) {
  return apiFetch<{ sent: boolean }>('/api/auth/otp/request', { method: 'POST', body: JSON.stringify({ email }) });
}

export async function verifyEmailOtp(email: string, code: string) {
  return apiFetch<{ verified: boolean }>('/api/auth/otp/verify', { method: 'POST', body: JSON.stringify({ email, code }) });
}

export async function savePersonalSpace(input: Record<string, unknown>) {
  return apiFetch<{ saved: boolean }>('/api/onboarding/personal-space', { method: 'POST', body: JSON.stringify(input) });
}

export async function uploadPersonalSpacePhotos(files: Record<string, File>) {
  const token = getToken(); const form = new FormData();
  Object.entries(files).forEach(([key, file]) => form.append(key, file));
  const response = await fetch('/api/onboarding/photos', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error ?? 'Photo upload failed', response.status);
  return data as { uploaded: boolean };
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
  protectedImages: ProtectedImageRef[];
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

export interface ProtectedImageRef {
  id: string;
  width: number;
  height: number;
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

export async function searchProducts(query: string, category?: string) {
  const params = new URLSearchParams({ q: query });
  if (category) params.set('category', category);
  return apiFetch<{ products: ProductListItem[] }>(`/api/search?${params.toString()}`);
}

export async function getPersonalizedFeed() {
  // Cache-bust: the feed depends on interactions recorded moments ago,
  // so every call must reach the server fresh (bypasses in-flight dedup
  // and browser disk cache).
  return apiFetch<{ personalized: boolean; products: (ProductListItem & { reason: string | null })[] }>(`/api/feed?_t=${Date.now()}`);
}

export async function recordProductInteraction(type: 'PRODUCT_VIEW' | 'PRODUCT_DWELL' | 'CART_ADD' | 'AUCTION_WATCH' | 'BID' | 'FEED_IMPRESSION' | 'FEED_CLICK' | 'HIDE', productId: string, durationMs?: number) {
  return apiFetch<{ recorded: true }>('/api/interactions', { method: 'POST', body: JSON.stringify({ type, productId, durationMs }) });
}

/** Records category exploration using the same interaction model as product views and dwell. */
export async function recordCategoryInteraction(
  type: 'PRODUCT_VIEW' | 'PRODUCT_DWELL',
  categoryId: string,
  durationMs?: number,
) {
  return apiFetch<{ recorded: true }>('/api/interactions', {
    method: 'POST',
    body: JSON.stringify({ type, categoryId, durationMs }),
    keepalive: true,
  });
}

export async function getProductDetail(id: string) {
  return apiFetch<ProductDetail>(`/api/products/${id}`);
}

export async function getFitRecommendations() {
  return apiFetch<{ products: (ProductListItem & { fitDistance: number })[] }>('/api/fit/recommendations');
}

export async function createProduct(body: {
  title: string;
  description: string;
  protectedImageIds: string[];
  priceInRupees: string;
  categoryPath: string;
  availableSizes: string[];
  stockQuantity: number;
  fitMeasurements?: Record<string, number>;
}) {
  return apiFetch<{ product: ProductListItem }>('/api/products', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function uploadProductImages(files: File[]) {
  const token = getToken();
  const form = new FormData();
  files.forEach((file) => form.append('images', file));
  const response = await fetch('/api/product-images/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error ?? 'Could not protect product images', response.status);
  return data as { images: ProtectedImageRef[] };
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
    protectedImages: ProtectedImageRef[];
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
  product: { id: string; sellerId: string; title: string; description: string; protectedImages: ProtectedImageRef[]; priceInRupees: string; createdAt: string };
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

/* ============================================================
   Visual Search
   ============================================================ */
export interface VisualSearchResult extends ProductListItem {
  featureVector: number[];
  similarityScore: number;
}

export interface VisualSearchResponse {
  results: VisualSearchResult[];
  totalScanned: number;
  detectedCategory?: 'shirt' | 't-shirt' | 'dress' | 'jacket' | 'bottoms' | null;
  categoryFallbackUsed?: boolean;
  queryVector: number[];
  analysisDetails?: {
    geminiLabels?: Record<string, string> | null;
    brightness?: number;
    colourVariance?: number;
  } | null;
}

/** Legacy: search by pre-computed feature vector */
export async function visualSearch(features: number[], category?: string) {
  return apiFetch<VisualSearchResponse>('/api/visual-search', {
    method: 'POST',
    body: JSON.stringify({ features, category: category || undefined }),
  });
}

/** New: search by uploading an image (server-side Gemini + sharp analysis) */
export async function visualSearchByImage(imageDataUrl: string, category?: string) {
  // Extract mime type from data URL
  const mimeMatch = imageDataUrl.match(/^data:(image\/\w+);/);
  const mimeType = mimeMatch?.[1] ?? 'image/jpeg';

  return apiFetch<VisualSearchResponse>('/api/visual-search', {
    method: 'POST',
    body: JSON.stringify({
      image: imageDataUrl,
      mimeType,
      category: category || undefined,
    }),
  });
}
