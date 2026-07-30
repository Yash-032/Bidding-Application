import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth/session';
import { protectedImageConfig } from '@/lib/protected-images/config';
import { chooseVariant } from '@/lib/protected-images/processor';
import {
  issueNonceGrants,
  type TileNonceGrantEntry,
} from '@/lib/protected-images/redis';
import { signTile } from '@/lib/protected-images/crypto';
import { IMAGE_SESSION_COOKIE, getOrCreateImageSession } from '@/lib/protected-images/session';
import type { StoredVariants } from '@/lib/protected-images/types';

export const runtime = 'nodejs';

function shuffle<T>(values: T[]) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const image = await prisma.productImage.findUnique({
      where: { id: (await params).id },
      include: { product: { select: { isActive: true } } },
    });
    const user = image?.productId ? null : await getSessionUser(request);
    const authorized = image && image.status !== 'DELETED' && (
      image.product?.isActive || (image.status === 'STAGED' && user?.id === image.uploaderId)
    );
    if (!authorized) return NextResponse.json({ error: 'Protected image not found' }, { status: 404 });

    const requestedWidth = Math.max(160, Math.min(4096, Number(request.nextUrl.searchParams.get('w') || 960)));
    const variant = chooseVariant(image.variants as StoredVariants, requestedWidth);
    if (!variant) throw new Error('Protected image has no renderable variants');

    const { sessionId, isNew } = getOrCreateImageSession(request);
    const expiresAt = Math.floor(Date.now() / 1000) + protectedImageConfig.manifestTtlSeconds;
    const preparedTiles = shuffle(variant.tiles).map((tile) => {
      const nonce = randomUUID();
      return {
        tile,
        nonce,
        grant: {
          sessionId,
          imageId: image.id,
          tileId: tile.id,
          storageKey: tile.storageKey,
        },
      };
    });
    await issueNonceGrants(
      preparedTiles.map(
        ({ nonce, grant }): TileNonceGrantEntry => ({ nonce, grant }),
      ),
      protectedImageConfig.manifestTtlSeconds,
    );
    const tiles = preparedTiles.map(({ tile, nonce }) => {
      const signature = signTile({ imageId: image.id, tileId: tile.id, nonce, expiresAt, sessionId });
      return {
        id: tile.id, x: tile.x, y: tile.y, width: tile.width, height: tile.height,
        sha256: tile.sha256, decodeKey: tile.decodeKey, codec: tile.codec,
        url: `/api/protected-images/${image.id}/tile/${tile.id}?n=${encodeURIComponent(nonce)}&e=${expiresAt}&s=${encodeURIComponent(signature)}`,
      };
    });
    const response = NextResponse.json({
      imageId: image.id,
      width: variant.width,
      height: variant.height,
      grid: protectedImageConfig.grid,
      expiresAt,
      tiles,
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache' } });
    if (isNew) response.cookies.set(IMAGE_SESSION_COOKIE, sessionId, {
      httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 8,
    });
    return response;
  } catch (error) {
    console.error(JSON.stringify({ event: 'protected_image_manifest_failed', error: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ error: 'Protected image is temporarily unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
