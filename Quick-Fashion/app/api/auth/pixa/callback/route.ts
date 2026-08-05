import { NextRequest, NextResponse } from 'next/server';
import { exchangePixaCode, statesMatch } from '@/lib/pixa/adapter';
import { linkPixaAccount } from '@/lib/pixa/service';
import { signSessionToken } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code'); const state = request.nextUrl.searchParams.get('state'); const savedState = request.cookies.get('pixa_oauth_state')?.value;
  if (!code || !statesMatch(savedState, state)) return NextResponse.json({ error: 'Invalid or expired Pixa sign-in state' }, { status: 400 });
  try { const result = await exchangePixaCode(code); if (!result.profile.sub || !result.profile.email) throw new Error('Pixa profile is incomplete'); if (!result.refreshToken) throw new Error('Pixa did not return a refresh token'); const { user, measurement } = await linkPixaAccount(result.profile, result.refreshToken); const response = NextResponse.redirect(new URL(measurement.status === 'PHOTO_REQUIRED' ? '/fit?measurements=required' : '/fit', request.url)); response.cookies.set('pixa_oauth_state', '', { httpOnly: true, maxAge: 0, path: '/api/auth/pixa' }); response.cookies.set('quick_fashion_session', signSessionToken({ id: user.id, email: user.email, role: user.role, isVerified: user.isVerified }), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 604800, path: '/' }); return response; } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Pixa sign-in failed' }, { status: 401 }); }
}