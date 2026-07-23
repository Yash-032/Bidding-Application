import { Auction, Bid } from '@prisma/client';
import { AuctionStrategy, BidValidationContext } from '../auction-strategy';
import {
  BidRequest,
  ValidationResult,
  BidPlacementEffects,
  AuctionCloseEffects,
  AuctionVoidEffects,
} from '../types';

export class EnglishAuctionStratergy implements AuctionStrategy {
    validateBid(auction: Auction, bidReq: BidRequest, ctx: BidValidationContext): ValidationResult {
        if(auction.status !== 'ACTIVE') {
            return { valid: false, reason: 'Auction is not currently active' }
        }

        const minRequired = ctx.currentHighestAmount + auction.minIncrement;
        if(bidReq.amountCredits < minRequired) {
            return { valid: false, reason: `Bid must be at least ${minRequired} credits` };
        }
        if(ctx.availableBalance < bidReq.amountCredits) {
            return { valid: false, reason: 'Insufficient available Balance' };
        }
        return { valid: true };
    }

    onBidPlaced(auction: Auction, previousHighestBid: Bid | null, newBid: Bid): BidPlacementEffects {
        const msRemaining = auction.endTime.getTime() - Date.now();
        const withinSnipeWindow = msRemaining <= auction.antiSnipingWindowSeconds * 1000;

        return {
            releasePreviousHighestBidder: previousHighestBid ? {
                userId: previousHighestBid.userId,
                walletId: previousHighestBid.userId,
                amount: previousHighestBid.amountCredits
            } : null,
            lockNewBidder: {
                userId: newBid.userId,
                walletId: newBid.userId,
                amount: newBid.amountCredits,
            },
            newEndTime: withinSnipeWindow ? 
                new Date(Date.now() + auction.antiSnipingWindowSeconds * 1000)
                : auction.endTime,
        };
    }

    onAuctionClose(auction: Auction, allBids: Bid[]): AuctionCloseEffects {
        const sorted = [...allBids].sort((a, b) => Number(b.amountCredits - a.amountCredits));
        const winner = sorted[0] ?? null;

        return {
            winningBidId: winner.id ?? null,
            winnerDeduction: winner
                ? { userId: winner.userId, walletId: winner.userId, amount: winner.amountCredits }
                : null,
            losersToRelease: sorted
                .slice(1)
                .filter((b) => b.status === 'ACTIVE')
                .map((b) => ({ userId: b.userId, walletId: b.userId, amount: b.amountCredits })),
        };
    }

    onAuctionVoid(auction: Auction, allBids: Bid[]): AuctionVoidEffects {
        const activeBids = allBids.filter((b) => b.status === 'ACTIVE');
        return {
            refunds: activeBids.map((b) => ({
                userId: b.userId,
                walletId: b.userId,
                amount: b.amountCredits,
                bidId: b.id,
                source: 'BID_LOCK',
            })),
            voidedBidIds: activeBids.map((b) => b.id),
        };
    }
}