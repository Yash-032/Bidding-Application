import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSessionUser } from '@/lib/auth/session';
import { toErrorResponse } from '@/lib/utils/errors';

export async function GET(request: NextRequest) {
  try {
    const session = await requireSessionUser(request);
    const measurement = await prisma.measurement.findUnique({ where: { userId: session.id } });
    return NextResponse.json({ measurement });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}