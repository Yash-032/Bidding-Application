import { NextRequest, NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/auth/session';
import { personalizedFeed, serializeFeedProduct } from '@/lib/discovery/feed.service';
import { toErrorResponse } from '@/lib/utils/errors';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);

    const limit = Number(
      request.nextUrl.searchParams.get('limit') ?? 20
    );

    const products = await personalizedFeed(user?.id, limit);

    const response = {
      personalized: Boolean(user),
      products: products.map((product) =>
        serializeFeedProduct(product)
      ),
    };

    // For authenticated users, never serve stale feed — personalization
    // depends on interactions recorded moments ago (e.g. product views).
    const cacheControl = user
      ? 'private, no-cache, no-store, must-revalidate'
      : 'public, s-maxage=30, stale-while-revalidate=60';

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': cacheControl,
      },
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}