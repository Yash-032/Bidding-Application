import { randomBytes } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';

export const IMAGE_SESSION_COOKIE = process.env.NODE_ENV === 'production'
  ? '__Host-protected_image_session'
  : 'protected_image_session';

export function readImageSession(request: NextRequest) {
  const value = request.cookies.get(IMAGE_SESSION_COOKIE)?.value;
  return value && /^[A-Za-z0-9_-]{32,128}$/.test(value) ? value : null;
}

export function getOrCreateImageSession(request: NextRequest) {
  const existing = readImageSession(request);
  return { sessionId: existing ?? randomBytes(32).toString('base64url'), isNew: !existing };
}

export function ensureImageSession(request: NextRequest, response: NextResponse) {
  const { sessionId, isNew } = getOrCreateImageSession(request);
  if (isNew) {
    response.cookies.set(IMAGE_SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 8,
    });
  }
  return sessionId;
}
