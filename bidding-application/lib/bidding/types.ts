export interface BidRequest {
    auctionId: string;
    userId: string;
    amountCredits: bigint;
    idempotencyKey: string;
}

export interface ValidationResult {
    valid: boolean;
    reason?: string;
}

export interface WalletMovement {
    userId: string;
    walletId: string;
    amount: bigint;
}

export interface BidPlacementEffects {
    releasePreviousHighestBidder: WalletMovement | null;
    lockNewBidder: WalletMovement;
    newEndTime: Date;
}

export interface AuctionCloseEffects {
    winningBidId: string | null;
    winnerDeduction: WalletMovement | null;
    losersToRelease: WalletMovement[];
}

export interface AuctionVoidRefund extends WalletMovement {
    bidId: string;
    source: 'BID_LOCK' | 'BID_FEE_DEDUCT';
}

export interface AuctionVoidEffects {
    refunds: AuctionVoidRefund[];
    voidedBidIds: string[];
}
