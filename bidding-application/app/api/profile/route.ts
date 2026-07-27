import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSessionUser } from '@/lib/auth/session';
import { toErrorResponse } from '@/lib/utils/errors';

export async function GET(request: NextRequest) {
  try {
    const session = await requireSessionUser(request);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id }, include: { profile: true, wallet: { include: { ledgerEntries: { orderBy: { createdAt: 'desc' }, take: 20 } } } } });
    return NextResponse.json({
      id: user.id, email: user.email, phone: user.phone, role: user.role, profile: user.profile,
      wallet: user.wallet ? {
        availableBalance: user.wallet.availableBalance.toString(),
        lockedBalance: user.wallet.lockedBalance.toString(),
        recentLedger: user.wallet.ledgerEntries.map((entry) => ({ ...entry, amount: entry.amount.toString(), balanceAfter: entry.balanceAfter.toString() })),
      } : null,
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSessionUser(request);
    const body = await request.json();
    const preferredSizes = Array.isArray(body.preferredSizes) ? body.preferredSizes.filter((size: unknown) => typeof size === 'string').slice(0, 10) : [];
    const user = await prisma.user.update({
      where: { id: session.id },
      data: {
        phone: body.phone?.trim() || null,
        profile: {
          upsert: {
            create: { fullName: body.fullName || null, bio: body.bio || null, gender: body.gender || null, dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null, preferredSizes, defaultAddress: body.defaultAddress || undefined },
            update: { fullName: body.fullName || null, bio: body.bio || null, gender: body.gender || null, dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null, preferredSizes, defaultAddress: body.defaultAddress || undefined },
          },
        },
      },
      include: { profile: true },
    });
    return NextResponse.json({ id: user.id, email: user.email, phone: user.phone, role: user.role, profile: user.profile });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
