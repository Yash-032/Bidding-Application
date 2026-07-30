import { NextRequest, NextResponse } from 'next/server';
import { protectedImageConfig } from '@/lib/protected-images/config';
import { validateTileClaims } from '@/lib/protected-images/access';
import { checkRateLimit, consumeNonce } from '@/lib/protected-images/redis';
import { readImageSession } from '@/lib/protected-images/session';
import { getPrivateObject } from '@/lib/protected-images/storage';
import { sha256 } from '@/lib/protected-images/crypto';

export const runtime = 'nodejs';

const reject = (reason: string, status = 403) => {
  console.warn(JSON.stringify({ event: 'protected_image_tile_rejected', reason }));
  return new NextResponse(null, { status, headers: { 'Cache-Control': 'no-store' } });
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; tileId: string }> }) {
  const { id: imageId, tileId } = await params;
  const sessionId = readImageSession(request) ?? '';
  const nonce = request.nextUrl.searchParams.get('n') ?? '';
  const expiresAt = Number(request.nextUrl.searchParams.get('e'));
  const suppliedSignature = request.nextUrl.searchParams.get('s') ?? '';
  const invalidClaims = validateTileClaims({
    imageId, tileId, nonce, expiresAt, sessionId, signature: suppliedSignature,
  });
  if (invalidClaims) return reject(invalidClaims, invalidClaims === 'expired' ? 410 : 403);
  if (!['same-origin', 'same-site', 'none'].includes(request.headers.get('sec-fetch-site') ?? 'none')) return reject('cross_site');
  const automationSignals = [
    !request.headers.get('user-agent'),
    !request.headers.get('accept-language'),
    !request.headers.get('sec-fetch-mode'),
  ].filter(Boolean).length;
  if (automationSignals) {
    console.warn(JSON.stringify({ event: 'protected_image_bot_signal', imageId, automationSignals }));
  }

  try {
    const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown';
    const networkKey = sha256(Buffer.from(forwardedFor)).slice(0, 24);
    const [sessionAllowed, networkAllowed] = await Promise.all([
      checkRateLimit(`session:${sessionId}`, protectedImageConfig.rateLimitPerMinute),
      checkRateLimit(`network:${networkKey}`, protectedImageConfig.rateLimitPerMinute * 4),
    ]);
    if (!sessionAllowed || !networkAllowed) return reject('rate_limited', 429);
    const grant = await consumeNonce(nonce, sessionId);
    if (!grant) return reject('missing_reused_or_cross_session_nonce', 410);
    if (grant.imageId !== imageId || grant.tileId !== tileId) {
      return reject('modified_tile_grant', 403);
    }

    const payload = await getPrivateObject(grant.storageKey);
    console.info(JSON.stringify({ event: 'protected_image_tile_served', imageId, tileId, bytes: payload.length }));
    return new NextResponse(payload, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'protected_image_tile_failed', imageId, tileId, error: error instanceof Error ? error.message : String(error) }));
    return reject('backend_failure', 503);
  }
}
