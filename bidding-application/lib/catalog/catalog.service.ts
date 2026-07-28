import { prisma } from '@/lib/prisma';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';
import { normalizeCategoryPath } from '@/lib/catalog/category.service';
import { publicBidUserSelect } from '@/lib/bidding/bid-serializer';

export interface CreateProductRequest {
  sellerId: string;
  title: string;
  description: string;
  images: string[];
  priceInRupees: bigint;
  categoryPath: string;
  availableSizes: string[];
  stockQuantity: number;
}

export class CatalogService {
  async createProduct(req: CreateProductRequest) {
    if (req.priceInRupees <= 0) throw new ValidationError('Retail price must be greater than zero');
    if (!Number.isInteger(req.stockQuantity) || req.stockQuantity < 0) throw new ValidationError('Stock must be a non-negative whole number');
    if (!req.availableSizes.length) throw new ValidationError('Select at least one available size');
    const categoryPath = normalizeCategoryPath(req.categoryPath);
    const category = categoryPath
      ? await prisma.category.findUnique({ where: { path: categoryPath } })
      : null;
    if (!category?.isActive) throw new ValidationError('Select a valid product category');
    return prisma.product.create({
      data: {
        sellerId: req.sellerId,
        title: req.title,
        description: req.description,
        images: req.images,
        priceInRupees: req.priceInRupees,
        category: category.name.toUpperCase(),
        categoryId: category.id,
        availableSizes: req.availableSizes,
        stockQuantity: req.stockQuantity,
      },
    });
  }

  async listProducts(params: { search?: string; categoryPath?: string; auctionsOnly?: boolean; endingSoon?: boolean; page?: number; pageSize?: number }) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const categoryPath = params.categoryPath ? normalizeCategoryPath(params.categoryPath) : '';
    return prisma.product.findMany({
      where: {
        isActive: true,
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
        ...(params.auctionsOnly ? { auction: { is: { status: { in: ['SCHEDULED', 'ACTIVE'] } } } } : {}),
      },
      include: { auction: true, categoryNode: true },
      orderBy: params.endingSoon ? { auction: { endTime: 'asc' } } : { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  async getProductDetail(productId: string) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        auction: {
          include: {
            bids: {
              orderBy: { amountCredits: 'desc' },
              take: 10,
              include: { user: { select: publicBidUserSelect } },
            },
          },
        },
        seller: { select: { id: true, email: true } },
        categoryNode: true,
      },
    });
    if (!product) throw new NotFoundError('Product not found');
    return product;
  }
}
