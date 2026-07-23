import { prisma } from '@/lib/prisma';
import { AuctionEventType, Prisma } from '@prisma/client';

export interface AuctionEventPayload {
    auctionId: string;
    type: AuctionEventType;
    data: Prisma.InputJsonObject;
}

export interface AuctionObserver {
    onAuctionEvent(event: AuctionEventPayload): Promise<void>;
}

export class AuctionSubject {
    private observers: AuctionObserver[] = [];

    subscribe(observer: AuctionObserver): void {
        this.observers.push(observer);
    }

    async notify(event: AuctionEventPayload): Promise<void> {
        await prisma.auctionEvent.create({
            data: { auctionId: event.auctionId, type: event.type, payload: event.data },
        });

        await Promise.all(
            this.observers.map((o) => o.onAuctionEvent(event).catch((err) => console.error('Observer failed', err)),),
        );
    }
}

export const auctionSubject = new AuctionSubject();