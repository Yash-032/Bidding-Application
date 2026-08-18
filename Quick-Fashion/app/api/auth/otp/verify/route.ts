import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/auth/auth.service';
import { toErrorResponse, ValidationError } from '@/lib/utils/errors';

export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json();
    if (typeof email !== 'string' || typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new ValidationError('Enter the six digit code');
    return NextResponse.json(await new AuthService().verifyEmailOtp(email.trim().toLowerCase(), code));
  } catch (error) { const { body, status } = toErrorResponse(error); return NextResponse.json(body, { status }); }
}