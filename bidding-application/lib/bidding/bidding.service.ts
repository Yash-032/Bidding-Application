import { prisma } from '@/lib/prisma';
import { Auction, Bid } from '@prisma/client';
import { AuctionStrategyFactory } from './strategy-factory';
import { WalletService } from '@/lib/wallet/wallet.service';
import { BidRequest } from './types';
import { auctionSubject } from '@/lib/auction/auction-observer';
import { ValidationError, NotFoundError } from '@/lib/utils/errors';

const walletService = new WalletService();

export class BidValidationError extends ValidationError {}

export class BiddingService {
    async placeBid(req: BidRequest): Promise<Bid> {
        return prisma.$transaction(
            async (tx) => {
                const existing = await tx.bid.findUnique({
                    where: { idempotencyKey: req.idempotencyKey },
                });

                if(existing)    return existing;
                
                const rows = await tx.$queryRaw<Auction[]>`
                    SELECT * FROM "Auction" WHERE id = ${req.auctionId} FOR UPDATE
                `;
                const auction = rows[0];
                if(!auction)    throw new NotFoundError('Auction not found');

                const strategy = AuctionStrategyFactory.resolve(auction.auctionModel);
                const previousHighestBid = auction.currentHighestBidId
                    ? await tx.bid.findUnique({ where: { id: auction.currentHighestBidId } })
                    : null;
                
                const wallet = await tx.wallet.findUniqueOrThrow({
                    where: { userId: req.userId },
                });
                
                const validation = strategy.validateBid(auction, req, {
                    availableBalance: wallet.availableBalance,
                    currentHighestAmount: previousHighestBid?.amountCredits ?? BigInt(0),
                });

                if(!validation.valid) {
                    throw new BidValidationError(validation.reason ?? 'Bid rejected');
                }

                const newBid = await tx.bid.create({
                    data: {
                        auctionId: req.auctionId,
                        userId: req.userId,
                        amountCredits: req.amountCredits,
                        idempotencyKey: req.idempotencyKey,
                    },
                });

                await tx.auctionWatcher.upsert({
                    where: { auctionId_userId: { auctionId: req.auctionId, userId: req.userId } },
                    create: { auctionId: req.auctionId, userId: req.userId },
                    update: {},
                });

                const effects = strategy.onBidPlaced(auction, previousHighestBid, newBid);

                if(effects.releasePreviousHighestBidder) {
                    const prevWallet = await tx.wallet.findUniqueOrThrow({
                        where: { userId: effects.releasePreviousHighestBidder.userId },
                    });
                    await walletService.releaseCredits(
                        tx, 
                        prevWallet.id,
                        effects.releasePreviousHighestBidder.amount,
                        previousHighestBid!.id,
                    );
                    await tx.bid.update({
                        where: { id: previousHighestBid!. id },
                        data: { status: 'OUTBID' },
                    });
                }

                await walletService.lockCredits(tx, wallet.id, effects.lockNewBidder.amount, newBid.id);

                await tx.auction.update({
                    where: { id: auction.id },
                    data: { currentHighestBidId: newBid.id, endTime: effects.newEndTime },
                });

                return newBid;
            }, { isolationLevel: 'Serializable' },
        ).then(async (newBid) => {
            if(req.idempotencyKey && newBid) {
                await auctionSubject.notify({
                    auctionId: req.auctionId,
                    type: 'BID_PLACED',
                    data: { bidId: newBid.id, userId: newBid.userId, amount: newBid.amountCredits.toString() },
                });
            }
            return newBid;
        });
    }
}