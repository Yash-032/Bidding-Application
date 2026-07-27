import { NextRequest, NextResponse } from 'next/server';
import { CatalogService } from '@/lib/catalog/catalog.service';
import { toErrorResponse } from '@/lib/utils/errors';

const catalog = new CatalogService();
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const product = await catalog.getProductDetail((await params).id);
    return NextResponse.json({
      ...product,
      priceInRupees: product.priceInRupees.toString(),
      auction: product.auction ? {
        ...product.auction,
        startingPriceCredits: product.auction.startingPriceCredits.toString(),
        minIncrement: product.auction.minIncrement.toString(),
        bidFee: product.auction.bidFee?.toString() ?? null,
        priceStepPerBid: product.auction.priceStepPerBid?.toString() ?? null,
        bids: product.auction.bids.map((bid) => ({ ...bid, amountCredits: bid.amountCredits.toString() })),
      } : null,
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
