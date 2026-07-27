import crypto from 'crypto';

const API_BASE = 'https://api.razorpay.com/v1';

export class RazorpayConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RazorpayConfigurationError';
  }
}

function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    throw new RazorpayConfigurationError('Razorpay credentials are not configured');
  }
  if (
    !/^rzp_(test|live)_/.test(keyId) ||
    /replace|example|your[_-]?key/i.test(keyId) ||
    /replace|example|your[_-]?secret/i.test(keySecret)
  ) {
    throw new RazorpayConfigurationError(
      'Razorpay credentials are placeholders. Add a matching Key ID and Key Secret to .env, then restart the server.',
    );
  }
  return { keyId, keySecret };
}

async function razorpayFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { keyId, keySecret } = credentials();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) {
    const description = data?.error?.description || 'Razorpay request failed';
    throw new Error(description);
  }
  return data as T;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  captured: boolean;
}

export function getRazorpayKeyId() {
  return credentials().keyId;
}

export function createRazorpayOrder(input: { amount: number; receipt: string; notes: Record<string, string> }) {
  return razorpayFetch<RazorpayOrder>('/orders', {
    method: 'POST',
    body: JSON.stringify({
      amount: input.amount,
      currency: 'INR',
      receipt: input.receipt,
      notes: input.notes,
    }),
  });
}

export function fetchRazorpayPayment(paymentId: string) {
  return razorpayFetch<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  const { keySecret } = credentials();
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  const actualBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function verifyWebhookSignature(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error('Razorpay webhook secret is not configured');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const actualBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}
