import { NextRequest, NextResponse } from 'next/server';
import { CatalogService } from '@/lib/catalog/catalog.service';
import { CategoryService } from '@/lib/catalog/category.service';
import { toErrorResponse } from '@/lib/utils/errors';

const catalog = new CatalogService();
const categories = new CategoryService();

export async function GET(request: NextRequest) {
  try {
    const categoryPath = request.nextUrl.searchParams.get('category') || undefined;
    const [categoryTree, products] = await Promise.all([
      categories.listTree(),
      catalog.listProducts({ categoryPath, page: 1, pageSize: 120 }),
    ]);

    return NextResponse.json({
      categories: categoryTree,
      products: products.map((product) => ({
        ...product,
        images: undefined,
        priceInRupees: product.priceInRupees.toString(),
        auction: product.auction ? {
          ...product.auction,
          startingPriceCredits: product.auction.startingPriceCredits.toString(),
          minIncrement: product.auction.minIncrement.toString(),
          bidFee: product.auction.bidFee?.toString() ?? null,
          priceStepPerBid: product.auction.priceStepPerBid?.toString() ?? null,
        } : null,
      })),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
