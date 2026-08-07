import { NextRequest, NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/auth/session';
import { recordInteraction } from '@/lib/discovery/feed.service';
import {
  fuzzySearchProducts,
  normalizeSearchQuery,
  serializeDiscoveryProduct,
} from '@/lib/discovery/search.service';
import { toErrorResponse } from '@/lib/utils/errors';

export async function GET(request: NextRequest) {
  try {
    const rawQuery = request.nextUrl.searchParams.get('q') ?? '';
    const normalizedQuery = normalizeSearchQuery(rawQuery);
    console.log('Search query:', normalizedQuery);
    const category =
      request.nextUrl.searchParams.get('category') ?? undefined;

    const limit = Number(
      request.nextUrl.searchParams.get('limit') ?? 30
    );

    const user = await getSessionUser(request);

    // Pass raw query — fuzzySearchProducts normalizes internally
    const products = await fuzzySearchProducts(rawQuery, category, limit);
    console.log('Found products:', products.length);

    if (user && normalizedQuery) {
      void recordInteraction(user.id, {
        type: 'SEARCH',
        query: normalizedQuery,
      }).catch(() => undefined);
    }

    const response = {
      query: normalizedQuery,
      products: products.map((product) =>
        serializeDiscoveryProduct(product)
      ),
    };

    const cacheControl = user
      ? 'private, max-age=15'
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