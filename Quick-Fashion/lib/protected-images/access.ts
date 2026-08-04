import { signTile, validSignature } from './crypto';

export type TileClaims = {
  imageId: string;
  tileId: string;
  nonce: string;
  expiresAt: number;
  sessionId: string;
  signature: string;
};

export function validateTileClaims(claims: TileClaims, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!claims.sessionId || !claims.nonce || !claims.signature || !Number.isInteger(claims.expiresAt)) return 'missing_claim' as const;
  if (claims.expiresAt < nowSeconds) return 'expired' as const;
  const expected = signTile(claims);
  if (!validSignature(expected, claims.signature)) return 'modified_or_cross_session' as const;
  return null;
}
