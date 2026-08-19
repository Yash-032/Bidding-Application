import { NextRequest, NextResponse } from 'next/server';
import { CatalogService } from '@/lib/catalog/catalog.service';
import { serializeBid } from '@/lib/bidding/bid-serializer';
import { toErrorResponse } from '@/lib/utils/errors';
import { GET as getUserSpaceProducts } from '../user-space/route';

const catalog = new CatalogService();
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (id === 'user-space') {
      return getUserSpaceProducts(req);
    }
    const product = await catalog.getProductDetail(id);
    const { images: _legacyImages, ...safeProduct } = product;
    void _legacyImages;
    return NextResponse.json({
      ...safeProduct,
      priceInRupees: product.priceInRupees.toString(),
      auction: product.auction ? {
        ...product.auction,
        startingPriceCredits: product.auction.startingPriceCredits.toString(),
        minIncrement: product.auction.minIncrement.toString(),
        bidFee: product.auction.bidFee?.toString() ?? null,
        priceStepPerBid: product.auction.priceStepPerBid?.toString() ?? null,
        bids: product.auction.bids.map(serializeBid),
      } : null,
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
