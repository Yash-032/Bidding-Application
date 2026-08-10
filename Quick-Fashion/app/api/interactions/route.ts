import { InteractionType } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

import { requireSessionUser } from '@/lib/auth/session';
import { recordInteraction } from '@/lib/discovery/feed.service';
import { ValidationError, toErrorResponse } from '@/lib/utils/errors';

const allowedInteractionTypes = new Set<InteractionType>([
  'PRODUCT_VIEW',
  'PRODUCT_DWELL',
  'SITE_DWELL',
  'CART_ADD',
  'AUCTION_WATCH',
  'BID',
  'FEED_IMPRESSION',
  'FEED_CLICK',
  'HIDE',
]);

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const body = await request.json();

    const { type, productId, categoryId, durationMs } = body;

    if (!allowedInteractionTypes.has(type)) {
      throw new ValidationError('Unsupported interaction type');
    }

    if (type !== 'SITE_DWELL' && !productId && !categoryId) {
      throw new ValidationError(
        'Either a productId or categoryId must be provided.'
      );
    }

    let sanitizedDuration: number | undefined;

    if (Number.isInteger(durationMs)) {
      sanitizedDuration = Math.max(
        0,
        Math.min(durationMs, 60 * 60 * 1000) // Maximum 1 hour
      );
    }

    await recordInteraction(user.id, {
      type,
      productId: typeof productId === 'string' ? productId : undefined,
      categoryId: typeof categoryId === 'string' ? categoryId : undefined,
      durationMs: sanitizedDuration,
    });

    return NextResponse.json(
      { recorded: true },
      { status: 201 }
    );
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}