import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  inferSearchIntent,
  rootOfCategoryPath,
  type SearchIntent,
} from '@/lib/discovery/search-intent';

/**
 * Alternate names only. Typos are resolved dynamically against live category
 * names and product text by PostgreSQL pg_trgm.
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

export type DiscoveryProduct = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

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

type CategoryCorrection = { path: string; name: string; score: number };

async function resolveSearchIntent(normalizedQuery: string): Promise<SearchIntent | null> {
  const semanticIntent = inferSearchIntent(normalizedQuery);
  if (semanticIntent) return semanticIntent;

  // Generalized typo recovery against the live taxonomy. This runs only when
  // the ontology found no valid term, so "shorts" is never corrected to "shirts".
  const matches = await prisma.$queryRaw<CategoryCorrection[]>(Prisma.sql`
    SELECT c."path", c."name",
      GREATEST(
        word_similarity(${normalizedQuery}, lower(c."name")),
        word_similarity(${normalizedQuery}, replace(lower(c."path"), '-', ' '))
      )::float AS score
    FROM "Category" c
    WHERE c."isActive" = true
      AND GREATEST(
        word_similarity(${normalizedQuery}, lower(c."name")),
        word_similarity(${normalizedQuery}, replace(lower(c."path"), '-', ' '))
      ) >= 0.30
    ORDER BY score DESC, length(c."path") ASC
    LIMIT 1
  `);

  const corrected = matches[0];
  if (!corrected) return null;

  return {
    key: `category:${corrected.path}`,
    label: corrected.name,
    preferredPaths: [corrected.path],
    compatibleRoots: [rootOfCategoryPath(corrected.path)],
  };
}

function categoryPathCondition(paths: string[]) {
  if (paths.length === 0) return Prisma.sql`false`;

  return Prisma.sql`(${Prisma.join(
    paths.map(
      (path) =>
        Prisma.sql`(c."path" = ${path} OR c."path" LIKE ${`${path}/%`})`
    ),
    ' OR '
  )})`;
}

/**
 * Hybrid catalog search:
 * 1. infer garment meaning and compatible category branches;
 * 2. retrieve lexical, full-text, typo, and semantic candidates together;
 * 3. rank compatible garments before lexically similar incompatible garments.
 */
export async function fuzzySearchProducts(
  query: string,
  categoryPath?: string,
  limit = 30
) {
  const normalizedQuery = normalizeSearchQuery(query);
  const safeLimit = Math.min(
    Math.max(Number.isFinite(limit) ? Math.floor(limit) : 30, 1),
    100
  );

  if (!normalizedQuery) {
    return prisma.product.findMany({
      where: {
        isActive: true,
        stockQuantity: { gt: 0 },
        ...(categoryPath
          ? {
              categoryNode: {
                OR: [
                  { path: categoryPath },
                  { path: { startsWith: `${categoryPath}/` } },
                ],
              },
            }
          : {}),
      },
      include: productInclude,
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
    });
  }

  const wildcardQuery = `%${normalizedQuery.replace(/%|_/g, '')}%`;
  const intent = await resolveSearchIntent(normalizedQuery);
  const semanticWildcardQuery = `%${(intent?.label ?? normalizedQuery).toLowerCase().replace(/%|_/g, '')}%`;
  const preferredCategory = categoryPathCondition(intent?.preferredPaths ?? []);
  const compatibleCategory = categoryPathCondition(intent?.compatibleRoots ?? []);
  const requestedCategory = categoryPath
    ? Prisma.sql`(c."path" = ${categoryPath} OR c."path" LIKE ${`${categoryPath}/%`})`
    : Prisma.sql`true`;

  const candidateIds = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT p.id
    FROM "Product" p
    LEFT JOIN "Category" c ON c.id = p."categoryId"
    WHERE p."isActive" = true
      AND p."stockQuantity" > 0
      AND ${requestedCategory}
      AND (
        p."title" ILIKE ${wildcardQuery}
        OR p."title" ILIKE ${semanticWildcardQuery}
        OR p."description" ILIKE ${wildcardQuery}
        OR c."name" ILIKE ${wildcardQuery}
        OR c."path" ILIKE ${wildcardQuery}
        OR word_similarity(${normalizedQuery}, lower(p."title")) >= 0.24
        OR word_similarity(${normalizedQuery}, lower(p."description")) >= 0.24
        OR to_tsvector('english', p."title" || ' ' || p."description")
           @@ plainto_tsquery('english', ${normalizedQuery})
        OR ${compatibleCategory}
      )
    ORDER BY
      CASE
        WHEN ${preferredCategory} THEN 3
        WHEN ${compatibleCategory} THEN 2
        ELSE 0
      END DESC,
      (
        CASE WHEN lower(p."title") = ${normalizedQuery} THEN 120 ELSE 0 END
        + CASE WHEN p."title" ILIKE ${semanticWildcardQuery} THEN 95 ELSE 0 END
        + CASE WHEN p."title" ILIKE ${wildcardQuery} THEN 80 ELSE 0 END
        + CASE WHEN p."description" ILIKE ${wildcardQuery} THEN 35 ELSE 0 END
        + CASE WHEN c."name" ILIKE ${wildcardQuery} OR c."path" ILIKE ${wildcardQuery} THEN 55 ELSE 0 END
        + CASE WHEN to_tsvector('english', p."title" || ' ' || p."description")
                    @@ plainto_tsquery('english', ${normalizedQuery}) THEN 45 ELSE 0 END
        + GREATEST(
            word_similarity(${normalizedQuery}, lower(p."title")),
            word_similarity(${normalizedQuery}, lower(p."description")),
            word_similarity(${normalizedQuery}, lower(COALESCE(c."name", '')))
          ) * 40
      ) DESC,
      p."createdAt" DESC
    LIMIT ${Math.min(Math.max(safeLimit * 3, 30), 150)}
  `);

  const products = await prisma.product.findMany({
    where: {
      id: { in: candidateIds.map((item) => item.id) },
    },
    include: productInclude,
  });

  const productMap = new Map(products.map((product) => [product.id, product]));

  return candidateIds
    .map((item) => productMap.get(item.id))
    .filter(Boolean)
    .slice(0, safeLimit) as DiscoveryProduct[];
}

export function serializeDiscoveryProduct(
  product: DiscoveryProduct & { reason?: string }
) {
  const { images: _legacyImages, ...safeProduct } = product;
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