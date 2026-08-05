import crypto from 'node:crypto';

export type PixaMeasurements = {
  updatedAt?: string;
  unit?: string;
  shoulderWidth?: number; chest?: number; waist?: number; hip?: number;
  neck?: number; sleeveLength?: number; armLength?: number; thigh?: number; calf?: number;
};

export type PixaProfile = { sub: string; email: string; measurements?: PixaMeasurements | null };

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

export function createPixaState() { return crypto.randomBytes(32).toString('base64url'); }

export function statesMatch(expected: string | undefined, received: string | null) {
  if (!expected || !received) return false;
  const a = Buffer.from(expected); const b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function pixaLoginUrl(state: string) {
  const url = new URL(required('PIXA_LOGIN_URL'));
  url.searchParams.set('client_id', required('PIXA_CLIENT_ID'));
  url.searchParams.set('redirect_uri', required('PIXA_CALLBACK_URL'));
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  return url.toString();
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Pixa authorization failed');
  return body;
}

const usedMockCodes = new Set<string>();

export async function exchangePixaCode(code: string): Promise<PixaProfile> {
  // The mock adapter remains server-only. Browser URLs contain only an opaque code.
  if (process.env.PIXA_ADAPTER === 'mock') {
    const raw = process.env.MOCK_PIXA_PROFILE;
    const expectedCode = process.env.MOCK_PIXA_AUTHORIZATION_CODE;
    const expiresAt = process.env.MOCK_PIXA_CODE_EXPIRES_AT;
    if (!raw || !expectedCode || code !== expectedCode || usedMockCodes.has(code) || (expiresAt && Date.parse(expiresAt) <= Date.now())) {
      throw new Error('Mock Pixa code is invalid, expired, or already used');
    }
    usedMockCodes.add(code);
    return JSON.parse(raw) as PixaProfile;
  }
  const token = await requestJson(required('PIXA_TOKEN_URL'), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'authorization_code', code, client_id: required('PIXA_CLIENT_ID'), client_secret: required('PIXA_CLIENT_SECRET'), redirect_uri: required('PIXA_CALLBACK_URL') }),
  }) as { access_token?: string };
  if (!token.access_token) throw new Error('Pixa did not return an access token');
  return requestJson(required('PIXA_ME_URL'), { headers: { authorization: `Bearer ${token.access_token}` } }) as Promise<PixaProfile>;
}