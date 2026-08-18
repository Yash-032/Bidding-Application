import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/auth/auth.service';
import { toErrorResponse, ValidationError } from '@/lib/utils/errors';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (typeof email !== 'string' || !email.includes('@')) throw new ValidationError('A valid email is required');
    return NextResponse.json(await new AuthService().requestEmailOtp(email.trim().toLowerCase()));
  } catch (error) { const { body, status } = toErrorResponse(error); return NextResponse.json(body, { status }); }
}