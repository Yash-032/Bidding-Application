import crypto from 'node:crypto';

export type PixaMeasurements = {
  updatedAt?: string;
  unit?: string;
  shoulderWidth?: number;
  chest?: number;
  waist?: number;
  hip?: number;
  neck?: number;
  sleeveLength?: number;
  armLength?: number;
  thigh?: number;
  calf?: number;
};

export type PixaProfile = {
  sub: string;
  email: string;
  measurements?: PixaMeasurements | null;
};

export type PixaTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
};

export type PixaTokenResult = {
  profile: PixaProfile;
  refreshToken?: string;
};

type JsonObject = Record<string, unknown>;

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

export function createPixaState() {
  return crypto.randomBytes(32).toString('base64url');
}

export function statesMatch(expected: string | undefined, received: string | null) {
  if (!expected || !received) return false;
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length
    && crypto.timingSafeEqual(expectedBytes, receivedBytes);
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
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const body: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const record = isObject(body) ? body : {};
    const message = stringValue(record.error_description, record.error, record.message)
      ?? `Pixa request failed (${response.status})`;
    throw new Error(message);
  }

  return body;
}

function normalizeProfile(payload: unknown): PixaProfile {
  const response = isObject(payload) ? payload : {};
  const data = isObject(response.data) ? response.data : response;
  const profileEnvelope = isObject(data.profile) ? data.profile : data;
  const user = isObject(profileEnvelope.user) ? profileEnvelope.user : profileEnvelope;
  const measurements = isObject(user.measurements)
    ? user.measurements
    : isObject(profileEnvelope.measurements)
      ? profileEnvelope.measurements
      : isObject(data.measurements)
        ? data.measurements
        : response.measurements === null || data.measurements === null
          ? null
          : undefined;

  return {
    sub: stringValue(user.sub, user.subject, user.id, user.userId) ?? '',
    email: stringValue(user.email) ?? '',
    measurements: measurements as PixaMeasurements | null | undefined,
  };
}

export async function getPixaProfile(accessToken: string) {
  const payload = await requestJson(required('PIXA_ME_URL'), {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
    },
  });
  return normalizeProfile(payload);
}

async function requestTokens(body: Record<string, string>): Promise<PixaTokenSet> {
  const payload = await requestJson(required('PIXA_TOKEN_URL'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      ...body,
      client_id: required('PIXA_CLIENT_ID'),
      client_secret: required('PIXA_CLIENT_SECRET'),
    }),
  });

  const response = isObject(payload) ? payload : {};
  const token = isObject(response.data) ? response.data : response;
  const accessToken = stringValue(token.access_token, token.accessToken);

  if (!accessToken) throw new Error('Pixa did not return an access token');

  return {
    accessToken,
    refreshToken: stringValue(token.refresh_token, token.refreshToken),
    expiresIn: numberValue(token.expires_in, token.expiresIn),
  };
}

const usedMockCodes = new Set<string>();

export async function exchangePixaCode(code: string): Promise<PixaTokenResult> {
  if (process.env.PIXA_ADAPTER === 'mock') {
    const raw = process.env.MOCK_PIXA_PROFILE;
    const expectedCode = process.env.MOCK_PIXA_AUTHORIZATION_CODE;
    const expiresAt = process.env.MOCK_PIXA_CODE_EXPIRES_AT;
    if (
      !raw
      || !expectedCode
      || code !== expectedCode
      || usedMockCodes.has(code)
      || (expiresAt && Date.parse(expiresAt) <= Date.now())
    ) {
      throw new Error('Mock Pixa code is invalid, expired, or already used');
    }
    usedMockCodes.add(code);
    return {
      profile: normalizeProfile(JSON.parse(raw)),
      refreshToken: process.env.MOCK_PIXA_REFRESH_TOKEN,
    };
  }

  const tokens = await requestTokens({
    grant_type: 'authorization_code',
    code,
    redirect_uri: required('PIXA_CALLBACK_URL'),
  });

  return {
    profile: await getPixaProfile(tokens.accessToken),
    refreshToken: tokens.refreshToken,
  };
}

export function refreshPixaTokens(refreshToken: string) {
  return requestTokens({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

export async function refreshPixaProfile(refreshToken: string): Promise<PixaTokenResult> {
  const tokens = await refreshPixaTokens(refreshToken);
  return {
    profile: await getPixaProfile(tokens.accessToken),
    refreshToken: tokens.refreshToken,
  };
}
