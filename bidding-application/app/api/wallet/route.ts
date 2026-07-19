import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/auth/session";
import { toErrorResponse } from '@/lib/utils/errors';

export async function GET(req: NextRequest) {
    try {
        console.time('get User')
        const user = await requireSessionUser(req);
        console.timeEnd('get User')

        console.time('get Wallet')
        const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
        console.timeEnd('get Wallet')

        console.time('get Ledger Entries')
        const ledgerEntries = await prisma.ledgerEntry.findMany({
            where: { walletId: wallet.id },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        console.timeEnd('get Ledger Entries')

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