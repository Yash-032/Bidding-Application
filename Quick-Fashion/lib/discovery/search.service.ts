import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Abbreviation synonyms — only for genuine short-forms / alternate names,
 * NOT for typos.  Typos are handled dynamically by pg_trgm word_similarity
 * and Levenshtein distance.
 */
const synonyms: Record<string, string> = {
  tshirt: 't shirt',
  tee: 't shirt',
  sneakers: 'shoes',
  trouser: 'pants',
  trousers: 'pants',
  hoodie: 'hooded sweatshirt',
};

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

export type DiscoveryProduct = Prisma.ProductGetPayload<{ include: typeof productInclude; }>;

export function normalizeSearchQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => synonyms[word] ?? word)
    .join(' ')
    .slice(0, 120);
}

/**
 * Multi-strategy fuzzy search:
 *
 * 1. **ILIKE** — catches exact substring matches (fast, indexed via trigram GIN)
 * 2. **word_similarity()** — compares the query against individual words inside
 *    titles/descriptions.  "jackt" matches "jacket" even in "Men's Denim Jacket"
 *    because it measures the best-matching substring, not the full-string similarity.
 *    Threshold is lowered to 0.15 (from default 0.3) to tolerate 1-2 char typos.
 * 3. **levenshtein()** — for very short queries (≤6 chars), trigram similarity
 *    degrades because there are few trigrams.  Levenshtein edit distance of ≤2
 *    catches single/double char mistakes like "dres" → "dress", "jackt" → "jacket".
 * 4. **Full-text search** — catches stemming/pluralization ("jackets" → "jacket",
 *    "dresses" → "dress") via PostgreSQL `to_tsvector` / `plainto_tsquery`.
 *
 * Results are ranked by a composite score: exact match > ILIKE > word_similarity >
 * full-text rank > Levenshtein > freshness.
 */
export async function fuzzySearchProducts(query: string, categoryPath?: string, limit = 30) {
  const normalizedQuery = normalizeSearchQuery(query);

  if (!normalizedQuery) {
    return prisma.product.findMany({
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
      take: limit,
    });
  }

  const wildcardQuery = `%${normalizedQuery.replace(/%|_/g, '')}%`;

  // Lower the similarity threshold for this session so the % operator and
  // word_similarity() accept looser matches (default is 0.3, too strict for
  // short-word typos).
  await prisma.$executeRawUnsafe(
    `SET pg_trgm.similarity_threshold = 0.15`
  );

  // Split query into individual words for per-word Levenshtein matching.
  const queryWords = normalizedQuery.split(' ').filter((w) => w.length > 0);

  // Build Levenshtein conditions dynamically: for each query word with length ≤ 6,
  // check if ANY word in the title (split by spaces) is within edit distance 2.
  // For longer words, word_similarity() handles it well.
  const shortWords = queryWords.filter((w) => w.length <= 6 && w.length >= 2);

  // We use a CTE approach: first find candidate IDs with scoring, then hydrate.
  const candidateIds = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`
      SELECT p.id
      FROM "Product" p
      WHERE
        p."isActive" = true
        AND p."stockQuantity" > 0
        AND (
          -- Strategy 1: ILIKE substring match
          p."title" ILIKE ${wildcardQuery}
          OR p."description" ILIKE ${wildcardQuery}

          -- Strategy 2: Trigram word_similarity (tolerates typos in individual words)
          OR word_similarity(${normalizedQuery}, p."title") > 0.15
          OR word_similarity(${normalizedQuery}, p."description") > 0.15

          -- Strategy 3: Full-text search (handles stemming & plurals)
          OR to_tsvector('english', p."title" || ' ' || p."description")
             @@ plainto_tsquery('english', ${normalizedQuery})

          -- Strategy 4: Levenshtein for short words (edit distance ≤ 2)
          -- Applied via word_similarity at low threshold which covers this, but
          -- we also do a direct levenshtein on title words for very short queries.
          ${shortWords.length > 0
            ? Prisma.sql`OR EXISTS (
                SELECT 1
                FROM unnest(string_to_array(lower(p."title"), ' ')) AS tw(word)
                WHERE ${Prisma.join(
                  shortWords.map(
                    (w) => Prisma.sql`levenshtein(tw.word, ${w}) <= 2`
                  ),
                  ' OR '
                )}
              )`
            : Prisma.sql``
          }
        )
      ORDER BY
        -- Scoring: exact match first, then ILIKE, then similarity, then freshness
        CASE
          WHEN lower(p."title") = ${normalizedQuery} THEN 100
          WHEN p."title" ILIKE ${wildcardQuery} THEN 80
          WHEN word_similarity(${normalizedQuery}, p."title") > 0.5 THEN 60
          WHEN to_tsvector('english', p."title" || ' ' || p."description")
               @@ plainto_tsquery('english', ${normalizedQuery}) THEN 40
          WHEN word_similarity(${normalizedQuery}, p."title") > 0.15 THEN 30
          ELSE 10
        END DESC,
        GREATEST(
          word_similarity(${normalizedQuery}, p."title"),
          word_similarity(${normalizedQuery}, p."description")
        ) DESC,
        p."createdAt" DESC
      LIMIT ${Math.min(Math.max(limit * 3, 30), 150)}
    `
  );

  const products = await prisma.product.findMany({
    where: {
      id: {
        in: candidateIds.map((item) => item.id),
      },
    },
    include: productInclude,
  });

  if (!categoryPath) {
    const productMap = new Map(
      products.map((product) => [product.id, product])
    );

    return candidateIds
      .map((item) => productMap.get(item.id))
      .filter(Boolean)
      .slice(0, limit) as DiscoveryProduct[];
  }

  const filteredProducts = products.filter(
    (product) =>
      product.categoryNode?.path === categoryPath ||
      product.categoryNode?.path.startsWith(`${categoryPath}/`)
  );

  const productMap = new Map(
    filteredProducts.map((product) => [product.id, product])
  );

  return candidateIds
    .map((item) => productMap.get(item.id))
    .filter(Boolean)
    .slice(0, limit) as DiscoveryProduct[];
}

export function serializeDiscoveryProduct(
  product: DiscoveryProduct & { reason?: string }
) {
  const { images: _legacyImages, ...safeProduct } = product;

  // Legacy images are intentionally omitted.
  void _legacyImages;

  return {
    ...safeProduct,
    priceInRupees: product.priceInRupees.toString(),
    reason: product.reason ?? null,
    auction: product.auction
      ? {
          ...product.auction,
          startingPriceCredits:
            product.auction.startingPriceCredits.toString(),
          minIncrement: product.auction.minIncrement.toString(),
          bidFee: product.auction.bidFee?.toString() ?? null,
          priceStepPerBid:
            product.auction.priceStepPerBid?.toString() ?? null,
        }
      : null,
  };
}