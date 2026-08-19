import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { CatalogService } from '@/lib/catalog/catalog.service';
import { toErrorResponse } from '@/lib/utils/errors';

const catalog = new CatalogService();
type ProductForSerialization = Awaited<ReturnType<CatalogService['listUserProducts']>>[number];

const serialize = (source: ProductForSerialization) => {
  const { images: _legacyImages, ...product } = source;
  void _legacyImages;
  return {
    ...product,
    priceInRupees: product.priceInRupees.toString(),
    auction: product.auction ? {
      ...product.auction,
      startingPriceCredits: product.auction.startingPriceCredits.toString(),
      minIncrement: product.auction.minIncrement.toString(),
      bidFee: product.auction.bidFee?.toString() ?? null,
      priceStepPerBid: product.auction.priceStepPerBid?.toString() ?? null,
    } : null,
  };
};

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ products: [] });
    }

    const products = await catalog.listUserProducts(user.id);
    return NextResponse.json({ products: products.map(serialize) });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
