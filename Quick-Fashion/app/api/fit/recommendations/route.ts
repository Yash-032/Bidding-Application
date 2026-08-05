import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/auth/session';
import { toErrorResponse } from '@/lib/utils/errors';

export async function GET(request: NextRequest) {
  try {
    await requireSessionUser(request);
    return NextResponse.json({ recommendations: [
      { id: 'fit-tee', name: 'Relaxed cotton tee', fit: 'Recommended' },
      { id: 'fit-shirt', name: 'Tailored overshirt', fit: 'Recommended' },
    ] });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}