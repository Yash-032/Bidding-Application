import { prisma } from '@/lib/prisma';
import { AuctionObserver, AuctionEventPayload } from '../auction-observer';
import { NotificationStrategyFactory } from '@/lib/notifications/notification-strategy-factory';

export function broadcast(channel: string, payload: unknown) {
    console.log(`[broadcast] ${channel}`, payload);
}

export class BoradcastObserver implements AuctionObserver {
    async onAuctionEvent(event: AuctionEventPayload): Promise<void> {
        broadcast(`auction:${event.auctionId}`, event);
    }
}

export class NotificationObserver implements AuctionObserver {
    async onAuctionEvent(event: AuctionEventPayload): Promise<void> {
        if(event.type !== 'OUTBID' && event.type !== 'AUCTION_CLOSED')  return ;

        const watchers = await prisma.auctionWatcher.findMany({
            where: { auctionId: event.auctionId },
            select: { userId: true },
        });

        const notificationType = event.type === 'OUTBID' ? 'OUTBID' : 'AUCTION_WON';

        await Promise.all(
            watchers.map(async (w) => {
                try {
                    const strategy = NotificationStrategyFactory.resolve('IN_APP');
                    await strategy.send({ userId: w.userId, type: notificationType, data: event.data});
                } catch(err) {
                    console.error(`Failed to notify watcher ${w.userId}`, err);
                }
            })
        )
    }
}