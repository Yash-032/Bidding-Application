import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { imageSigningSecret } from './config';

export const base64url = (value: Buffer) => value.toString('base64url');
export const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex');
export const randomId = (bytes = 18) => base64url(randomBytes(bytes)).toLowerCase();

export function signTile(input: { imageId: string; tileId: string; nonce: string; expiresAt: number; sessionId: string }) {
  return base64url(createHmac('sha256', imageSigningSecret()).update(
    `${input.imageId}.${input.tileId}.${input.nonce}.${input.expiresAt}.${input.sessionId}`,
  ).digest());
}

export function validSignature(expected: string, supplied: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function obfuscateRawTile(raw: Buffer) {
  const prefix = randomBytes(16);
  const key = randomBytes(32);
  const body = Buffer.allocUnsafe(raw.length);
  for (let index = 0; index < raw.length; index += 1) body[index] = raw[index] ^ key[index % key.length];
  const encoded = Buffer.concat([prefix, body]);
  return { encoded, decodeKey: base64url(key), sha256: sha256(encoded) };
}
