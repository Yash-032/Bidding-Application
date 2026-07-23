import { prisma } from '@/lib/prisma';
import { WalletService } from '@/lib/wallet/wallet.service';
import { AuctionStrategyFactory } from '@/lib/bidding/strategy-factory';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';

const walletService = new WalletService();

export class AdminService {
    async adjustCredits(adminId: string, targetUserId: string, amount: bigint, reason: string) {
        if(amount === BigInt(0))   throw new ValidationError('Adjustment amount cannot be zero');
        
        return prisma.$transaction(async (tx) => {
            const wallet = await tx.wallet.findUnique({ where: { userId: targetUserId } });
            if (!wallet) throw new NotFoundError('User wallet not found');

            const updated = 
                amount > BigInt(0)
                ? await walletService.creditsFromTopUp(tx, wallet.id, amount, `admin${adminId}`)
                : await (async () => {
                    const w = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
                    
                    const result = await tx.wallet.update({
                        where: { id: wallet.id, version: w.version },
                        data: { availableBalance: { increment: amount }, version: { increment: 1 } },
                    });

                    await tx.ledgerEntry.create({
                        data: {
                            walletId: wallet.id,
                            type: 'ADMIN_ADJUSTMENT',
                            amount,
                            referenceId: adminId,
                            referenceType: 'ADMIN',
                            balanceAfter: result.availableBalance,
                        },
                    });
                    return result;
                })();

            return updated;
        });
    }

    async voidAuction(adminId: string, auctionId: string, reason: string) {
        return prisma.$transaction(async (tx) => {
            const auction = await tx.auction.findUnique({
                where: { id: auctionId },
                include: { bids: true },
            });

            if(!auction)    throw new NotFoundError('Auction Not Found');
            const strategy = AuctionStrategyFactory.resolve(auction.auctionModel);
            const effects = strategy.onAuctionVoid(auction, auction.bids);

            for(const refund of effects.refunds) {
                const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: refund.userId } });

                if(refund.source === 'BID_LOCK') {
                    await walletService.releaseCredits(tx, wallet.id, refund.amount, refund.bidId);
                } else {
                    await walletService.refundToAvailable(tx, wallet.id, refund.amount, refund.bidId);
                }
            }

            if(effects.voidedBidIds.length > 0) {
                await tx.bid.updateMany({
                    where: { id: { in: effects.voidedBidIds } },
                    data: { status: 'VOIDED' },
                });
            }

            await tx.auction.update({ where: { id: auctionId }, data: { status: 'CANCELLED' } });
            return { voided: true, refundedBidCount: effects.refunds.length };
        });
    }
}