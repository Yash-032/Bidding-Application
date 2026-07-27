import { prisma } from '@/lib/prisma';
import { AuctionStrategyFactory } from './strategy-factory';
import { WalletService } from '@/lib/wallet/wallet.service';
import { auctionSubject } from '@/lib/auction/auction-observer';

const walletService = new WalletService();

export class AuctionSchedulerService {
    /**
     * Transition SCHEDULED → ACTIVE for all auctions whose startTime has passed.
     */
    async activateDueAuctions() {
        const result = await prisma.auction.updateMany({
            where: { status: 'SCHEDULED', startTime: { lte: new Date() } },
            data: { status: 'ACTIVE' },
        });

        return { activatedCount: result.count };
    }

    /**
     * Settle all ACTIVE auctions whose endTime has passed.
     * For each:
     *  1. Resolve the strategy's onAuctionClose effects
     *  2. Deduct the winner's locked credits
     *  3. Release all losers' locked credits
     *  4. Create an Order if there's a winner
     *  5. Update bid statuses (WON / LOST)
     *  6. Transition auction to CLOSED
     *  7. Notify observers
     */
    async settleExpiredAuctions() {
        const expiredAuctions = await prisma.auction.findMany({
            where: { status: 'ACTIVE', endTime: { lte: new Date() } },
            include: { bids: true },
        });

        const results: { auctionId: string; settled: boolean; winnerId?: string; error?: string }[] = [];

        for (const auction of expiredAuctions) {
            try {
                const strategy = AuctionStrategyFactory.resolve(auction.auctionModel);
                const effects = strategy.onAuctionClose(auction, auction.bids);

                await prisma.$transaction(async (tx) => {
                    // Deduct winner's locked credits
                    if (effects.winnerDeduction) {
                        const winnerWallet = await tx.wallet.findUniqueOrThrow({
                            where: { userId: effects.winnerDeduction.userId },
                        });
                        await walletService.deductOnWin(
                            tx,
                            winnerWallet.id,
                            effects.winnerDeduction.amount,
                            effects.winningBidId!,
                        );

                        // Mark winning bid
                        await tx.bid.update({
                            where: { id: effects.winningBidId! },
                            data: { status: 'WON' },
                        });

                        // Create Order
                        await tx.order.create({
                            data: {
                                auctionId: auction.id,
                                winningBidId: effects.winningBidId!,
                                buyerId: effects.winnerDeduction.userId,
                                finalPriceCredits: effects.winnerDeduction.amount,
                            },
                        });
                    }

                    // Release all losers' locked credits
                    for (const loser of effects.losersToRelease) {
                        const loserWallet = await tx.wallet.findUniqueOrThrow({
                            where: { userId: loser.userId },
                        });
                        await walletService.releaseCredits(tx, loserWallet.id, loser.amount, auction.id);
                    }

                    // Mark all non-winning active bids as LOST
                    if (effects.winningBidId) {
                        await tx.bid.updateMany({
                            where: {
                                auctionId: auction.id,
                                status: 'ACTIVE',
                                id: { not: effects.winningBidId },
                            },
                            data: { status: 'LOST' },
                        });
                    } else {
                        // No winner — mark all active bids as LOST
                        await tx.bid.updateMany({
                            where: { auctionId: auction.id, status: 'ACTIVE' },
                            data: { status: 'LOST' },
                        });
                    }

                    // Transition auction to CLOSED
                    await tx.auction.update({
                        where: { id: auction.id },
                        data: { status: 'CLOSED' },
                    });
                }, { timeout: 30000 });

                // Notify observers (outside transaction)
                await auctionSubject.notify({
                    auctionId: auction.id,
                    type: 'AUCTION_CLOSED',
                    data: {
                        winningBidId: effects.winningBidId ?? null,
                        winnerId: effects.winnerDeduction?.userId ?? null,
                    },
                });

                results.push({
                    auctionId: auction.id,
                    settled: true,
                    winnerId: effects.winnerDeduction?.userId,
                });
            } catch (err) {
                console.error(`Failed to settle auction ${auction.id}:`, err);
                results.push({
                    auctionId: auction.id,
                    settled: false,
                    error: err instanceof Error ? err.message : 'Unknown error',
                });
            }
        }

        return { settledCount: results.filter((r) => r.settled).length, results };
    }
}
