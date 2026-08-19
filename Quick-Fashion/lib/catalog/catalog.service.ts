import { prisma } from '@/lib/prisma';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';
import { normalizeCategoryPath } from '@/lib/catalog/category.service';

export interface CreateProductRequest {
  sellerId: string;
  targetUserId?: string;
  title: string;
  description: string;
  protectedImageIds: string[];
  imageViews?: { id: string; viewType: string }[];
  priceInRupees: bigint;
  categoryPath: string;
  availableSizes: string[];
  stockQuantity: number;
  fitMeasurements?: Record<string, number>;
}

export class CatalogService {
  async createProduct(req: CreateProductRequest) {
    if (req.priceInRupees <= 0) throw new ValidationError('Retail price must be greater than zero');
    if (!Number.isInteger(req.stockQuantity) || req.stockQuantity < 0) throw new ValidationError('Stock must be a non-negative whole number');
    if (!req.availableSizes.length) throw new ValidationError('Select at least one available size');
    if (!req.protectedImageIds.length) throw new ValidationError('Upload at least one protected product image');
    const measurements = ['shoulderWidth', 'chest', 'waist', 'hip', 'neck', 'sleeveLength', 'armLength', 'thigh', 'calf'] as const;
    const fitMeasurements = req.fitMeasurements;
    const hasFitMeasurements = !!fitMeasurements && measurements.every((field) => Number.isFinite(fitMeasurements[field]) && fitMeasurements[field] > 0);
    if (req.protectedImageIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
      throw new ValidationError('Public image URLs are forbidden; use protected image uploads');
    }
    const categoryPath = normalizeCategoryPath(req.categoryPath);
    const category = categoryPath
      ? await prisma.category.findUnique({ where: { path: categoryPath } })
      : null;
    if (!category?.isActive) throw new ValidationError('Select a valid product category');
    
    const viewMap = new Map<string, string>(
      req.imageViews?.map((iv): [string, string] => [iv.id, iv.viewType]) ?? []
    );

    return prisma.$transaction(async (tx) => {
      const staged = await tx.productImage.findMany({
        where: { id: { in: req.protectedImageIds }, uploaderId: req.sellerId, productId: null, status: 'STAGED' },
        select: { id: true },
      });
      if (staged.length !== new Set(req.protectedImageIds).size) {
        throw new ValidationError('Every product image must be a valid protected upload owned by this session');
      }
      const product = await tx.product.create({
        data: {
          sellerId: req.sellerId,
          targetUserId: req.targetUserId || null,
          title: req.title,
          description: req.description,
          images: [],
          priceInRupees: req.priceInRupees,
          category: category.name.toUpperCase(),
          categoryId: category.id,
          availableSizes: req.availableSizes,
          stockQuantity: req.stockQuantity,
        },
      });
      if (hasFitMeasurements && fitMeasurements) {
        await tx.productFitProfile.create({ data: { productId: product.id, shoulderWidth: fitMeasurements.shoulderWidth, chest: fitMeasurements.chest, waist: fitMeasurements.waist, hip: fitMeasurements.hip, neck: fitMeasurements.neck, sleeveLength: fitMeasurements.sleeveLength, armLength: fitMeasurements.armLength, thigh: fitMeasurements.thigh, calf: fitMeasurements.calf } });
        const vector = `[${measurements.map((field) => fitMeasurements![field]).join(',')}]`;
        await tx.$executeRawUnsafe('UPDATE "ProductFitProfile" SET "fitVector" = $1::vector WHERE "productId" = $2', vector, product.id);
      }
      await Promise.all(req.protectedImageIds.map((id, sortOrder) => tx.productImage.update({
        where: { id },
        data: {
          productId: product.id,
          sortOrder,
          viewType: viewMap.get(id) || 'FRONT',
          status: 'ACTIVE',
        },
      })));
      return { ...product, protectedImages: await tx.productImage.findMany({
        where: { productId: product.id },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, width: true, height: true, viewType: true },
      }) };
    });
  }

  async listProducts(params: { search?: string; categoryPath?: string; targetUserId?: string; auctionsOnly?: boolean; endingSoon?: boolean; page?: number; pageSize?: number }) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const categoryPath = params.categoryPath ? normalizeCategoryPath(params.categoryPath) : '';
    const productFilters = {
      isActive: true,
      ...(params.targetUserId ? { targetUserId: params.targetUserId } : {}),
      ...(params.search ? {
        OR: [
          { title: { contains: params.search, mode: 'insensitive' as const } },
          { description: { contains: params.search, mode: 'insensitive' as const } },
        ],
      } : {}),
      ...(categoryPath ? {
        categoryNode: {
          is: {
            OR: [
              { path: categoryPath },
              { path: { startsWith: `${categoryPath}/` } },
            ],
          },
        },
      } : {}),
    };

    if (params.auctionsOnly) {
      const auctions = await prisma.auction.findMany({
        where: {
          status: { in: ['SCHEDULED', 'ACTIVE'] },
          product: { is: productFilters },
        },
        include: {
          product: {
            include: {
              categoryNode: true,
              protectedImages: {
                orderBy: { sortOrder: 'asc' },
                select: { id: true, width: true, height: true, viewType: true },
              },
            },
          },
        },
        orderBy: params.endingSoon ? { endTime: 'asc' } : { startTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      return auctions.map(({ product, ...auction }) => ({
        ...product,
        auction,
      }));
    }

    return prisma.product.findMany({
      where: {
        ...productFilters,
      },
      include: {
        auction: true,
        categoryNode: true,
        protectedImages: { orderBy: { sortOrder: 'asc' }, select: { id: true, width: true, height: true, viewType: true } },
      },
      orderBy: params.endingSoon ? { auction: { endTime: 'asc' } } : { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  async listUserProducts(userId: string) {
    return prisma.product.findMany({
      where: {
        isActive: true,
        targetUserId: userId,
      },
      include: {
        auction: true,
        categoryNode: true,
        protectedImages: { orderBy: { sortOrder: 'asc' }, select: { id: true, width: true, height: true, viewType: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProductDetail(productId: string) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        seller: { select: { id: true, email: true } },
        categoryNode: true,
        protectedImages: { orderBy: { sortOrder: 'asc' }, select: { id: true, width: true, height: true, viewType: true } },
        auction: {
          include: {
            bids: {
              orderBy: { amountCredits: 'desc' },
              take: 10,
              include: { user: { select: { id: true, email: true, role: true, profile: { select: { fullName: true } } } } },
            },
          },
        },
      },
    });
    if (!product) throw new NotFoundError('Product not found');
    return product;
  }
}
