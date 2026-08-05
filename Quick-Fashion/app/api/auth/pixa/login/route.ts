import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth/session';
import { createPixaState, pixaLoginUrl } from '@/lib/pixa/adapter';

export async function GET(request: NextRequest) {
  const session = await getSessionUser(request);
  if (session) {
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { pixaSubjectId: true, measurement: { select: { status: true } } },
    });
    if (user?.pixaSubjectId || user?.measurement) {
      const suffix = user.measurement?.status === 'PHOTO_REQUIRED' || !user.measurement ? '?measurements=required' : '';
      return NextResponse.redirect(new URL(`/fit${suffix}`, request.url));
    }
  }

  const state = createPixaState();
  const response = NextResponse.redirect(pixaLoginUrl(state));
  response.cookies.set('pixa_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/api/auth/pixa',
  });
  return response;
}