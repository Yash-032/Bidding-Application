import { Auction, Bid } from '@prisma/client';
import { BidRequest, ValidationResult, BidPlacementEffects, AuctionCloseEffects, AuctionVoidEffects } from './types';

export interface BidValidationContext {
  availableBalance: bigint;
  currentHighestAmount: bigint;
}

export interface AuctionStrategy {
    validateBid(auction: Auction, bidReq: BidRequest, ctx: BidValidationContext): ValidationResult;

    onBidPlaced(auction: Auction, previousHighestBid: Bid | null, newBid: Bid): BidPlacementEffects;

    onAuctionClose(auction: Auction, allBids: Bid[]): AuctionCloseEffects;

    onAuctionVoid(auction: Auction, allBids: Bid[]): AuctionVoidEffects;
}