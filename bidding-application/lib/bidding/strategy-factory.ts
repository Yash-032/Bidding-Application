import { AuctionModel } from '@prisma/client';
import { AuctionStrategy } from './auction-strategy';
import { EnglishAuctionStratergy } from './strategies/english-auction.strategy'

export class AuctionStrategyFactory {
    private static strategies: Partial<Record<AuctionModel, AuctionStrategy>> = {
        ENGLISH: new EnglishAuctionStratergy(),
    };

    static resolve(model: AuctionModel): AuctionStrategy {
        const strategy = this.strategies[model];
        if(!strategy) {
            throw new Error(`No AuctionStrategy implemented yet for model: ${model}`);
        }
        return strategy;
    }
}