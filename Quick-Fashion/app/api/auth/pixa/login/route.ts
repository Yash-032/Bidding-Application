import { NextResponse } from 'next/server';
import { createPixaState, pixaLoginUrl } from '@/lib/pixa/adapter';

export async function GET() {
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