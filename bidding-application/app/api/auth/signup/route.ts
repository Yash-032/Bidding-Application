import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/auth/auth.service';
import { toErrorResponse } from '@/lib/utils/errors';

const authService = new AuthService();

export async function POST(req: NextRequest) {
  try {
    const { email, password, phone } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
    }

    const result = await authService.signup({ email, password, phone });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const { body, status } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
