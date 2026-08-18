import { NextRequest, NextResponse } from 'next/server';

import { requireSessionUser } from '@/lib/auth/session';
import { FitService } from '@/lib/fit/fit.service';
import { prisma } from '@/lib/prisma';
import { refreshMeasurementsFromPixa } from '@/lib/pixa/service';
import { PixaReauthenticationRequired } from '@/lib/pixa/errors';
import { toErrorResponse } from '@/lib/utils/errors';

const fit = new FitService();

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);

    try {
      await refreshMeasurementsFromPixa(user.id);
    } catch (error) {
      if (!(error instanceof PixaReauthenticationRequired)) throw error;
      // A locally completed personal store remains usable if an older Pixa
      // connection has expired. Ask for Pixa only when no local fit data exists.
      const localMeasurement = await prisma.measurement.findUnique({
        where: { userId: user.id },
        select: { status: true },
      });
      if (localMeasurement?.status !== 'AVAILABLE') throw error;
    }

    const limit = Number(request.nextUrl.searchParams.get('limit') || 12);

    const products = await fit.recommendationsForUser(user.id, limit);

    return NextResponse.json({
      products: products.map((product) => ({
        ...product,
        images: undefined,
        fitDistance: product.fitDistance,
        priceInRupees: product.priceInRupees.toString(),
        auction: product.auction
          ? {
              ...product.auction,
              startingPriceCredits:
                product.auction.startingPriceCredits.toString(),
              minIncrement: product.auction.minIncrement.toString(),
              bidFee: product.auction.bidFee?.toString() ?? null,
              priceStepPerBid: product.auction.bidFee?.toString() ?? null
            }
          : null,
      })),
    });
  } catch (error) {
    if (error instanceof PixaReauthenticationRequired) {
      return NextResponse.json(
        { error: error.message, reauthUrl: '/api/auth/pixa/login?force=true' },
        { status: 401 }
      );
    }
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}