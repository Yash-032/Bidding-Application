import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser, requireRole } from '@/lib/auth/session';
import { CatalogService } from '@/lib/catalog/catalog.service';
import { toErrorResponse } from '@/lib/utils/errors';

const catalog = new CatalogService();
const serialize = (product: any) => ({
  ...product,
  priceInRupees: product.priceInRupees.toString(),
  auction: product.auction ? {
    ...product.auction,
    startingPriceCredits: product.auction.startingPriceCredits.toString(),
    minIncrement: product.auction.minIncrement.toString(),
    bidFee: product.auction.bidFee?.toString() ?? null,
    priceStepPerBid: product.auction.priceStepPerBid?.toString() ?? null,
  } : null,
});

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
    return NextResponse.json({ products: products.map(serialize) });
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
      images: body.images || [],
      priceInRupees: BigInt(body.priceInRupees),
      categoryPath: body.categoryPath || body.category,
      availableSizes: body.availableSizes || [],
      stockQuantity: Number(body.stockQuantity),
    });
    return NextResponse.json({ product: serialize({ ...product, auction: null }) }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
