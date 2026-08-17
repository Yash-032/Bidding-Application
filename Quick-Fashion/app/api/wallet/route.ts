import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth/session";
import { toErrorResponse } from '@/lib/utils/errors';

export async function GET(req: NextRequest) {
    try {
        const user = await requireSessionUser(req);

        const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
        const ledgerEntries = await prisma.ledgerEntry.findMany({
            where: { walletId: wallet.id },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });

        return NextResponse.json({
            availableBalance: wallet.availableBalance.toString(),
            lockedBalance: wallet.lockedBalance.toString(),
            recentLedger: ledgerEntries.map((e) => ({
                ...e,
                amount: e.amount.toString(),
                balanceAfter: e.balanceAfter.toString(),
            })),
        });
    } catch(err) {
        const { body, status } = toErrorResponse(err);
        return NextResponse.json(body, { status });
    }
}