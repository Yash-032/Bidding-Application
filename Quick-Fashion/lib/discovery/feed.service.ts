import { InteractionType } from '@prisma/client';

import { prisma } from '@/lib/prisma';

import {
  DiscoveryProduct,
  serializeDiscoveryProduct,
} from './search.service';

/* ------------------------------------------------------------------ */
/*  Interaction weights — higher = stronger buying-intent signal       */
/* ------------------------------------------------------------------ */

const interactionWeights: Record<InteractionType, number> = {
  SEARCH: 3,
  PRODUCT_VIEW: 2,
  PRODUCT_DWELL: 4,
  SITE_DWELL: 0,
  CART_ADD: 8,
  AUCTION_WATCH: 8,
  BID: 12,
  PURCHASE: 15,
  FEED_IMPRESSION: 0.25,
  FEED_CLICK: 3,
  HIDE: -20,
};

/**
 * Maximum dwell time (ms) we consider meaningful.  Anything above this is
 * likely an idle tab.
 */
const MAX_MEANINGFUL_DWELL_MS = 5 * 60 * 1000; // 5 minutes

const productInclude = {
  auction: true,
  categoryNode: true,
  protectedImages: {
    orderBy: {
      sortOrder: 'asc' as const,
    },
    select: {
      id: true,
      width: true,
      height: true,
    },
  },
};

/* ------------------------------------------------------------------ */
/*  Core: personalizedFeed                                             */
/* ------------------------------------------------------------------ */

export async function personalizedFeed(
  userId?: string,
  limit = 20
) {
  // ------- 1. Pull the user's recent interactions -------
  const interactions = userId
    ? await prisma.userInteraction.findMany({
        where: {
          userId,
          createdAt: {
            gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
          },
        },
        select: {
          type: true,
          productId: true,
          categoryId: true,
          query: true,
          durationMs: true,
          product: {
            select: {
              categoryId: true,
            },
          },
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 500,
      })
    : [];

  // ------- 2. Build category-level interest scores -------
  const categoryInterests = new Map<string, number>();

  // ------- 3. Build product-level affinity scores -------
  const productAffinities = new Map<string, number>();

  // ------- 4. Collect recent search queries -------
  const recentSearchQueries: string[] = [];

  for (const interaction of interactions) {
    const categoryId =
      interaction.categoryId ?? interaction.product?.categoryId;

    const daysSinceInteraction =
      (Date.now() - interaction.createdAt.getTime()) /
      (24 * 60 * 60 * 1000);

    // Exponential decay: interactions lose half their weight every 30 days
    const decay = Math.exp(-daysSinceInteraction / 30);

    // Base weight for this interaction type
    let weight = interactionWeights[interaction.type] * decay;

    // For PRODUCT_DWELL, scale weight by how long they actually stayed.
    // A 3-minute dwell is worth much more than a 2-second bounce.
    if (interaction.type === 'PRODUCT_DWELL' && interaction.durationMs) {
      const clampedMs = Math.min(interaction.durationMs, MAX_MEANINGFUL_DWELL_MS);
      // Normalize: 30s of dwell = 1x weight, 2min = 4x, 5min = 10x
      const dwellMultiplier = Math.max(0.1, clampedMs / 30_000);
      weight *= dwellMultiplier;
    }

    // Category interest
    if (categoryId) {
      categoryInterests.set(
        categoryId,
        (categoryInterests.get(categoryId) ?? 0) + weight
      );
    }

    // Product affinity (only for direct product interactions)
    if (interaction.productId) {
      productAffinities.set(
        interaction.productId,
        (productAffinities.get(interaction.productId) ?? 0) + weight
      );
    }

    // Search query collection
    if (interaction.type === 'SEARCH' && interaction.query) {
      recentSearchQueries.push(interaction.query.toLowerCase());
    }
  }

  // Deduplicate search queries, keep most-recent-first, limit to 10
  const uniqueSearchQueries = [...new Set(recentSearchQueries)].slice(0, 10);

  // ------- 5. Fetch candidate products -------
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      stockQuantity: {
        gt: 0,
      },
    },
    include: productInclude,
    orderBy: {
      createdAt: 'desc',
    },
    take: 120,
  });

  // ------- 6. Score each product -------
  const scored = products.map((product) => {
    // (a) Category interest
    const categoryScore = product.categoryId
      ? categoryInterests.get(product.categoryId) ?? 0
      : 0;

    // (b) Direct product affinity (viewed, dwelled on, carted, etc.)
    const productScore = productAffinities.get(product.id) ?? 0;

    // (c) Search query match: boost products whose title/description
    //     matches the user's recent searches
    let searchMatchScore = 0;
    let matchedQuery: string | null = null;
    if (uniqueSearchQueries.length > 0) {
      const titleLower = product.title.toLowerCase();
      const descLower = product.description.toLowerCase();
      const categoryName = product.categoryNode?.name?.toLowerCase() ?? '';

      for (const q of uniqueSearchQueries) {
        const words = q.split(' ').filter((w) => w.length >= 2);
        let queryMatchCount = 0;

        for (const word of words) {
          if (
            titleLower.includes(word) ||
            descLower.includes(word) ||
            categoryName.includes(word)
          ) {
            queryMatchCount++;
          }
        }

        if (queryMatchCount > 0) {
          // Proportion of query words that matched
          const matchRatio = queryMatchCount / Math.max(words.length, 1);
          const thisScore = matchRatio * 5;
          if (thisScore > searchMatchScore) {
            searchMatchScore = thisScore;
            matchedQuery = q;
          }
        }
      }
    }

    // (d) Freshness: newer products get a small boost (0–1 over 14 days)
    const freshnessScore =
      Math.max(
        0,
        14 -
          (Date.now() - product.createdAt.getTime()) /
            (24 * 60 * 60 * 1000)
      ) / 14;

    // (e) Auction bonus
    const auctionBonus =
      product.auction?.status === 'ACTIVE' ? 1 : 0;

    // Composite score — weights chosen so category + product signals dominate
    const score =
      categoryScore * 10 +
      productScore * 5 +
      searchMatchScore * 8 +
      freshnessScore +
      auctionBonus;

    // ------- 7. Generate reason label -------
    let reason: string;
    if (productScore > 3) {
      reason = 'Based on items you recently viewed';
    } else if (searchMatchScore > 2 && matchedQuery) {
      reason = `Related to your search for "${matchedQuery}"`;
    } else if (categoryScore > 1) {
      reason = 'Based on categories you recently explored';
    } else if (auctionBonus) {
      reason = 'Live auction available';
    } else {
      reason = 'New arrival';
    }

    return {
      ...product,
      score,
      reason,
      _categoryId: product.categoryId,
    };
  });

  // ------- 8. Sort by score -------
  scored.sort((a, b) => b.score - a.score);

  // ------- 9. Diversity shuffle -------
  // Prevent the feed from being dominated by a single category.
  // We interleave: take up to 3 consecutive items from the same category,
  // then force an item from a different category if available.
  const diverseFeed = diversityShuffle(scored, limit);

  return diverseFeed;
}

/**
 * Diversity-aware selection: walks the score-sorted list and limits
 * consecutive same-category items to `maxConsecutive`.  When the limit
 * is hit, it pulls the next-highest-scored item from a different category.
 */
function diversityShuffle<T extends { _categoryId: string | null; score: number }>(
  items: T[],
  limit: number,
  maxConsecutive = 3
): T[] {
  const clampedLimit = Math.min(Math.max(limit, 1), 50);
  if (items.length <= clampedLimit) return items;

  const result: T[] = [];
  const used = new Set<number>(); // indices into `items`
  let consecutiveCount = 0;
  let lastCategoryId: string | null | undefined;

  while (result.length < clampedLimit) {
    let picked = false;

    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue;

      const item = items[i];
      const sameCategory = item._categoryId === lastCategoryId && lastCategoryId != null;

      if (sameCategory && consecutiveCount >= maxConsecutive) {
        // Skip — look for a different category
        continue;
      }

      result.push(item);
      used.add(i);

      if (sameCategory) {
        consecutiveCount++;
      } else {
        consecutiveCount = 1;
        lastCategoryId = item._categoryId;
      }

      picked = true;
      break;
    }

    if (!picked) {
      // All remaining items are from the same over-represented category;
      // just fill in order.
      for (let i = 0; i < items.length && result.length < clampedLimit; i++) {
        if (!used.has(i)) {
          result.push(items[i]);
          used.add(i);
        }
      }
      break;
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Record an interaction                                              */
/* ------------------------------------------------------------------ */

export async function recordInteraction(
  userId: string,
  input: {
    type: InteractionType;
    productId?: string;
    categoryId?: string;
    query?: string;
    durationMs?: number;
  }
) {
  let categoryId = input.categoryId;

  if (input.productId && !categoryId) {
    const product = await prisma.product.findUnique({
      where: {
        id: input.productId,
      },
      select: {
        categoryId: true,
      },
    });

    categoryId = product?.categoryId ?? undefined;
  }

  return prisma.userInteraction.create({
    data: {
      userId,
      type: input.type,
      productId: input.productId,
      categoryId,
      query: input.query?.slice(0, 120),
      durationMs: input.durationMs,
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Serialization                                                      */
/* ------------------------------------------------------------------ */

export const serializeFeedProduct = (
  product: DiscoveryProduct & { reason: string }
) => {
  return serializeDiscoveryProduct(product);
};