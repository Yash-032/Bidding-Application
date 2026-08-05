import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ValidationError } from '@/lib/utils/errors';

const fields = ['shoulderWidth', 'chest', 'waist', 'hip', 'neck', 'sleeveLength', 'armLength', 'thigh', 'calf'] as const;
const TOP_K = 12;
const DEFAULT_MAX_DISTANCE = 25;
const MIN_COMPARABLE_MEASUREMENTS = 2;

function maxFitDistance() {
  const configured = Number(process.env.FIT_MAX_DISTANCE ?? DEFAULT_MAX_DISTANCE);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_DISTANCE;
}

export class FitService {
  async recommendationsForUser(userId: string, limit = TOP_K) {
    const measurement = await prisma.measurement.findUnique({ where: { userId } });
    if (!measurement || measurement.status !== 'AVAILABLE') throw new ValidationError('Connect Pixa measurements before finding garments for your fit');
    const values = Object.fromEntries(fields.map((field) => [field, measurement[field]])) as Record<(typeof fields)[number], number | null>;
    const terms = fields.map((field) => {
      const identifier = Prisma.raw(`profile."${field}"`);
      const value = values[field];
      const typedValue = Prisma.sql`${value}::double precision`;
      const usable = Prisma.sql`${identifier} IS NOT NULL AND ${identifier} > 0 AND ${typedValue} IS NOT NULL AND ${typedValue} > 0`;
      return {
        squared: Prisma.sql`CASE WHEN ${usable} THEN POWER(${identifier} - ${typedValue}, 2) ELSE 0 END`,
        count: Prisma.sql`CASE WHEN ${usable} THEN 1 ELSE 0 END`,
      };
    });
    const squaredDistance = Prisma.join(terms.map((term) => term.squared), ' + ');
    const comparableCount = Prisma.join(terms.map((term) => term.count), ' + ');
    const threshold = maxFitDistance();
    const matches = await prisma.$queryRaw<{ productId: string; distance: number }[]>(Prisma.sql`
      SELECT profile."productId", SQRT((${squaredDistance}) / NULLIF((${comparableCount}), 0)) AS distance
      FROM "ProductFitProfile" profile
      INNER JOIN "Product" product ON product.id = profile."productId"
      WHERE product."isActive" = true AND product."stockQuantity" > 0
        AND (${comparableCount}) >= ${MIN_COMPARABLE_MEASUREMENTS}
        AND SQRT((${squaredDistance}) / NULLIF((${comparableCount}), 0)) <= ${threshold}
      ORDER BY distance ASC
      LIMIT ${Math.min(Math.max(limit, 1), 50)}
    `);
    const products = await prisma.product.findMany({ where: { id: { in: matches.map((match) => match.productId) } }, include: { auction: true, categoryNode: true, protectedImages: { orderBy: { sortOrder: 'asc' }, select: { id: true, width: true, height: true } } } });
    const byId = new Map(products.map((product) => [product.id, product]));
    return matches.flatMap((match) => {
      const product = byId.get(match.productId);
      return product ? [{ ...product, fitDistance: Number(match.distance) }] : [];
    });
  }
}