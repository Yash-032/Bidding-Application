import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser, requireRole } from '@/lib/auth/session';
import { CatalogService } from '@/lib/catalog/catalog.service';
import { toErrorResponse } from '@/lib/utils/errors';

const catalog = new CatalogService();
type ProductForSerialization = Awaited<ReturnType<CatalogService['listProducts']>>[number];

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
    const query = req.nextUrl.searchParams;
    const products = await catalog.listProducts({
      search: query.get('search') || undefined,
      categoryPath: query.get('category') || undefined,
      auctionsOnly: query.get('auctionsOnly') === 'true',
      endingSoon: query.get('endingSoon') === 'true',
      page: Number(query.get('page') || 1),
    });
    const containsLiveAuctionState = query.get('auctionsOnly') === 'true' || query.get('endingSoon') === 'true';
    return NextResponse.json(
      { products: products.map(serialize) },
      { headers: { 'Cache-Control': containsLiveAuctionState ? 'public, s-maxage=5, stale-while-revalidate=15' : 'public, s-maxage=30, stale-while-revalidate=120' } },
    );
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSessionUser(req);
    requireRole(user, 'SELLER', 'ADMIN');
    const body = await req.json();
    const product = await catalog.createProduct({
      sellerId: user.id,
      title: body.title,
      description: body.description,
      protectedImageIds: body.protectedImageIds || [],
      priceInRupees: BigInt(body.priceInRupees),
      categoryPath: body.categoryPath || body.category,
      availableSizes: body.availableSizes || [],
      stockQuantity: Number(body.stockQuantity),
      fitMeasurements: body.fitMeasurements || {},
    });
    return NextResponse.json({ product: serialize({ ...product, auction: null, categoryNode: null }) }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
