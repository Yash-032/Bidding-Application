import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser, requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { toErrorResponse } from '@/lib/utils/errors';

export async function GET(req: NextRequest) {
  try {
    const user = await requireSessionUser(req);
    requireRole(user, 'ADMIN');

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        profile: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.profile?.fullName ?? null,
        role: u.role,
      })),
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
