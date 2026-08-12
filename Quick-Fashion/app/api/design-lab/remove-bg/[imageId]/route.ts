import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureProtectedRemoveBgDerivative } from '@/lib/design-lab/remove-bg';
import { chooseVariant } from '@/lib/protected-images/processor';
import { protectedImageConfig } from '@/lib/protected-images/config';
import { issueNonceGrants, type TileNonceGrantEntry } from '@/lib/protected-images/redis';
import { signTile } from '@/lib/protected-images/crypto';
import { IMAGE_SESSION_COOKIE, getOrCreateImageSession } from '@/lib/protected-images/session';
import type { StoredVariants } from '@/lib/protected-images/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ imageId: string }> }) {
  try {
    const derivativeId = await ensureProtectedRemoveBgDerivative((await params).imageId);
    const image = await prisma.productImage.findUnique({ where: { id: derivativeId } });
    if (!image) throw new Error('Protected remove.bg derivative is unavailable');

    const requestedWidth = Math.max(160, Math.min(1600, Number(request.nextUrl.searchParams.get('w') || 960)));
    const variant = chooseVariant(image.variants as StoredVariants, requestedWidth);
    if (!variant) throw new Error('Protected remove.bg derivative has no variant');

    const { sessionId, isNew } = getOrCreateImageSession(request);
    const expiresAt = Math.floor(Date.now() / 1000) + protectedImageConfig.manifestTtlSeconds;
    const prepared = variant.tiles.map((tile) => {
      const nonce = randomUUID();
      return {
        tile,
        nonce,
        grant: { sessionId, imageId: image.id, tileId: tile.id, storageKey: tile.storageKey },
      };
    });

    await issueNonceGrants(
      prepared.map(({ nonce, grant }): TileNonceGrantEntry => ({ nonce, grant })),
      protectedImageConfig.manifestTtlSeconds,
    );

    const response = NextResponse.json({
      imageId: image.id,
      width: variant.width,
      height: variant.height,
      expiresAt,
      tiles: prepared.map(({ tile, nonce }) => ({
        id: tile.id,
        x: tile.x,
        y: tile.y,
        width: tile.width,
        height: tile.height,
        sha256: tile.sha256,
        decodeKey: tile.decodeKey,
        codec: tile.codec,
        url: `/api/protected-image-tiles/${image.id}/${tile.id}?n=${encodeURIComponent(nonce)}&e=${expiresAt}&s=${encodeURIComponent(signTile({ imageId: image.id, tileId: tile.id, nonce, expiresAt, sessionId }))}`,
      })),
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });

    if (isNew) response.cookies.set(IMAGE_SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 8,
    });
    return response;
  } catch (error) {
    console.error('[design-lab-remove-bg]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not prepare background-removed garment' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
