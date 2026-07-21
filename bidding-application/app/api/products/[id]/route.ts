import { NextRequest, NextResponse } from "next/server";
import { CatalogService } from "@/lib/catalog/catalog.service";
import { toErrorResponse } from '@/lib/utils/errors';

const catalogService = new CatalogService();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const product = await catalogService.getProductDetail(id);

        return NextResponse.json({
            ...product,
            startingPriceCredits: product.startingPriceCredits.toString(),
            auction: product.auction && {
                ...product.auction,
                minIncrement: product.auction.minIncrement?.toString(),
                bidFee: product.auction.bidFee?.toString() ?? null,
                priceStepPerBid: product.auction.priceStepPerBid?.toString() ?? null,
                bids: product.auction.bids.map((b) => ({ ...b, amountCredits: b.amountCredits.toString() })),
            },
        });

    } catch(err) {
        console.error(err);
        const { body, status } = toErrorResponse(err);
        return NextResponse.json(body, { status });
    }
}