import { beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';

beforeAll(() => {
  process.env.IMAGE_SIGNING_SECRET = 'test-only-signing-secret-that-is-long-enough';
});

describe('protected tile claims', () => {
  it('requires a nonce and session', async () => {
    const { validateTileClaims } = await import('../lib/protected-images/access');
    expect(validateTileClaims({
      imageId: 'image', tileId: 'tile', nonce: '', expiresAt: 200, sessionId: '', signature: '',
    }, 100)).toBe('missing_claim');
  });

  it('rejects expired, modified, and cross-session URLs', async () => {
    const { signTile } = await import('../lib/protected-images/crypto');
    const { validateTileClaims } = await import('../lib/protected-images/access');
    const claims = { imageId: 'image', tileId: 'tile', nonce: 'nonce', expiresAt: 200, sessionId: 'session-a' };
    const signature = signTile(claims);
    expect(validateTileClaims({ ...claims, signature }, 201)).toBe('expired');
    expect(validateTileClaims({ ...claims, tileId: 'changed', signature }, 100)).toBe('modified_or_cross_session');
    expect(validateTileClaims({ ...claims, sessionId: 'session-b', signature }, 100)).toBe('modified_or_cross_session');
    expect(validateTileClaims({ ...claims, signature }, 100)).toBeNull();
  });
});

describe('upload processing', () => {
  it('creates a 4x4 grid of opaque, hashed payloads and keeps the original private', async () => {
    const { processProductImage } = await import('../lib/protected-images/processor');
    const { getPrivateObject, deletePrivatePrefix } = await import('../lib/protected-images/storage');
    const input = await sharp({
      create: { width: 64, height: 48, channels: 4, background: { r: 120, g: 30, b: 200, alpha: 1 } },
    }).png().toBuffer();
    const image = await processProductImage(input);
    try {
      expect(image.originalKey).not.toContain('public');
      expect(image.originalKey).not.toMatch(/\.(png|jpe?g|webp|avif)$/i);
      const variant = Object.values(image.variants)[0];
      expect(variant.tiles).toHaveLength(16);
      for (const tile of variant.tiles) {
        expect(tile.id).toMatch(/^[a-z0-9_-]+$/);
        expect(tile.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(tile.storageKey).not.toMatch(/\.(png|jpe?g|webp|avif)$/i);
        const bytes = await getPrivateObject(tile.storageKey);
        expect(bytes.subarray(0, 8)).not.toEqual(input.subarray(0, 8));
      }
      expect(await getPrivateObject(image.originalKey)).toEqual(input);
    } finally {
      await deletePrivatePrefix(image.id);
    }
  });

  it('accepts AVIF when Sharp reports its HEIF container with AV1 compression', async () => {
    const { processProductImage } = await import('../lib/protected-images/processor');
    const { deletePrivatePrefix } = await import('../lib/protected-images/storage');
    const input = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 20, g: 80, b: 140 } },
    }).avif().toBuffer();
    const image = await processProductImage(input);
    try {
      expect(Object.values(image.variants)[0].tiles).toHaveLength(16);
    } finally {
      await deletePrivatePrefix(image.id);
    }
  }, 15_000);
});

describe('atomic nonce contract', () => {
  it('uses one Redis GETDEL and allows a nonce exactly once', async () => {
    const { consumeNonceAtomically } = await import('../lib/protected-images/redis');
    const grant = {
      sessionId: 'session-a',
      imageId: 'image-a',
      tileId: 'tile-a',
      storageKey: 'image-a/variant/tile-a',
    };
    const values = new Map([['protected-image:nonce:one', JSON.stringify(grant)]]);
    const commands: string[][] = [];
    const fakeRedis = {
      async sendCommand(command: string[]) {
        commands.push(command);
        const value = values.get(command[1]) ?? null;
        values.delete(command[1]);
        return value;
      },
    };
    expect(await consumeNonceAtomically(fakeRedis, 'one', 'session-a')).toEqual(grant);
    expect(await consumeNonceAtomically(fakeRedis, 'one', 'session-a')).toBeNull();
    expect(commands).toEqual([
      ['GETDEL', 'protected-image:nonce:one'],
      ['GETDEL', 'protected-image:nonce:one'],
    ]);
  }, 15_000);
});
