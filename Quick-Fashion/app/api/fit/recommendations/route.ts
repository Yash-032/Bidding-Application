import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/auth/session';
import { FitService } from '@/lib/fit/fit.service';
import { refreshMeasurementsFromPixa } from '@/lib/pixa/service';
import { toErrorResponse } from '@/lib/utils/errors';

const fit = new FitService();
export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    await refreshMeasurementsFromPixa(user.id);
    const products = await fit.recommendationsForUser(user.id, Number(request.nextUrl.searchParams.get('limit') || 30));
    return NextResponse.json({ products: products.map((product) => ({ ...product, images: undefined, fitDistance: product.fitDistance, priceInRupees: product.priceInRupees.toString(), auction: product.auction ? { ...product.auction, startingPriceCredits: product.auction.startingPriceCredits.toString(), minIncrement: product.auction.minIncrement.toString(), bidFee: product.auction.bidFee?.toString() ?? null, priceStepPerBid: product.auction.bidFee?.toString() ?? null } : null })) });
  } catch (error) { const { body, status } = toErrorResponse(error); return NextResponse.json(body, { status }); }
}