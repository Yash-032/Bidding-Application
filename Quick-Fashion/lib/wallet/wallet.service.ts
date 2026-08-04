import { Prisma, LedgerEntry, LedgerEntryType } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

export class InsufficientBalanceError extends Error {}

export class WalletService {
    async lockCredits(tx: TxClient, walletId: string, amount: bigint, referenceId: string) {
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });

        if(wallet.availableBalance < amount) {
            throw new InsufficientBalanceError(`Insufficient balance in wallet ${walletId}`);
        }

        const updated = await tx.wallet.update({
            where: { id: walletId, version: wallet.version },
            data: {
            availableBalance: { decrement: amount },
            lockedBalance: { increment: amount },
            version: { increment: 1 },
            },
        });

        await tx.ledgerEntry.create({
            data: {
                walletId,
                type: LedgerEntryType.BID_LOCK,
                amount: -amount,
                referenceId,
                referenceType: 'BID',
                balanceAfter: updated.availableBalance,
            },
        });

        return updated;
    }

    async releaseCredits(tx: TxClient, walletId: string, amount: bigint, referenceId: string) {
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });

        const updated = await tx.wallet.update({
            where: { id: walletId, version: wallet.version },
            data: {
                availableBalance: { increment: amount },
                lockedBalance: { decrement: amount },
                version: { increment: 1 },
            },
        });

        await tx.ledgerEntry.create({
            data: {
                walletId,
                type: LedgerEntryType.BID_RELEASE,
                amount: amount,
                referenceId,
                referenceType: 'BID',
                balanceAfter: updated.availableBalance,
            },
        });

        return updated;
    }

    async deductOnWin(tx: TxClient, walletId: string, amount: bigint, referenceId: string) {
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });

        const updated = await tx.wallet.update({
            where: { id: walletId, version: wallet.version },
            data: {
                lockedBalance: { decrement: amount },
                version: { increment: 1 },
            },
        });

        await tx.ledgerEntry.create({
            data: {
                walletId,
                type: LedgerEntryType.BID_WIN_DEDUCT,
                amount: -amount,
                referenceId,
                referenceType: 'BID',
                balanceAfter: updated.availableBalance,
            },
        });

        return updated;
    }

    async refundToAvailable(tx: TxClient, walletId: string, amount: bigint, referenceId: string) {
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });

        const updated = await tx.wallet.update({
            where: { id: walletId, version: wallet.version },
            data: {
                availableBalance: { increment: amount },
                version: { increment: 1 },
            },
        });

        await tx.ledgerEntry.create({
            data: {
                walletId,
                type: 'REFUND',
                amount,
                referenceId,
                referenceType: 'BID',
                balanceAfter: updated.availableBalance,
            },
        });
        
        return updated;
    }

    async creditsFromTopUp(tx: TxClient, walletId: string, amount: bigint, paymentTransactionId: string) {
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });

        const updated = await tx.wallet.update({
            where: { id: walletId, version: wallet.version },
            data: {
                availableBalance: { increment: amount },
                version: { increment: 1 },
            },
        });
        
        await tx.ledgerEntry.create({
            data: {
                walletId,
                type: LedgerEntryType.TOPUP,
                amount: amount,
                referenceId: paymentTransactionId,
                referenceType: 'PAYMENT',
                balanceAfter: updated.availableBalance,
            },
        });

        return updated;
    }
}