import { NextResponse } from 'next/server';
import { AuctionSchedulerService } from '@/lib/bidding/auction-scheduler.service';

const scheduler = new AuctionSchedulerService();

export async function POST() {
    try {
        const result = await scheduler.activateDueAuctions();
        return NextResponse.json(result);
    } catch (err) {
        console.error('Activation failed:', err);
        return NextResponse.json({ error: 'Activation failed' }, { status: 500 });
    }
}
