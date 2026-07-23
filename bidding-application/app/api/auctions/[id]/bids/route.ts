import { NextRequest, NextResponse } from 'next/server';
import { BiddingService } from '@/lib/bidding/bidding.service';
import { requireSessionUser } from '@/lib/auth/session';
import { toErrorResponse } from '@/lib/utils/errors';

const biddingService = new BiddingService();

export async function POST(req: NextRequest, { params} : { params: Promise< { id: string } > }){
    try {
        const user = await requireSessionUser(req);
        const body = await req.json();

        const { amountCredits, idempotencyKey } = body;
        if(!amountCredits || !idempotencyKey) {
            return NextResponse.json(
                { error : 'amountCredits and idempotencyKey are required' },
                { status: 400 },
            );
        }

        const bid = await biddingService.placeBid({
            auctionId: (await params).id,
            userId: user.id,
            amountCredits: BigInt(amountCredits),
            idempotencyKey,
        });

        return NextResponse.json({ bid: serializeBid(bid) }, { status: 201} );
    } catch(err) {
        const { body, status } = toErrorResponse(err);
        return NextResponse.json(body, { status });
    }
}

function serializeBid(bid: { amountCredits: bigint; [key: string]: unknown }) {
    return { ...bid, amountCredits: bid.amountCredits.toString() };
}