import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { NotFoundError, toErrorResponse } from "@/lib/utils/errors";
import { publicBidUserSelect, serializeBid } from '@/lib/bidding/bid-serializer';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auction = await prisma.auction.findUnique({
            where: { id: (await params).id },
            include: {
                product: true,
                bids: {
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                    include: { user: { select: publicBidUserSelect } },
                },
            },
        });

        if(!auction)    throw new NotFoundError('Auction not found');

        return NextResponse.json({
            ...auction,
            startingPriceCredits: auction.startingPriceCredits.toString(),
            minIncrement: auction.minIncrement.toString(),
            bidFee: auction.bidFee?.toString() ?? null,
            priceStepPerBid: auction.priceStepPerBid?.toString() ?? null,
            product: { ...auction.product, priceInRupees: auction.product.priceInRupees.toString() },
            bids: auction.bids.map(serializeBid),
        });
    } catch(err) {
        const { body, status } = toErrorResponse(err);
        return NextResponse.json(body, { status });
    }
}
