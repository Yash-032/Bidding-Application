import { NextResponse } from 'next/server';
import { AuctionSchedulerService } from '@/lib/bidding/auction-scheduler.service';

const scheduler = new AuctionSchedulerService();

export async function POST() {
    try {
        const result = await scheduler.settleExpiredAuctions();
        return NextResponse.json(result);
    } catch (err) {
        console.error('Settlement failed:', err);
        return NextResponse.json({ error: 'Settlement failed' }, { status: 500 });
    }
}
