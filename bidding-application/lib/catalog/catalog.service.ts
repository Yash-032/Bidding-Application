import { prisma } from '@/lib/prisma';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';
import { normalizeCategoryPath } from '@/lib/catalog/category.service';
import type { AuctionModel, AuctionStatus, BidStatus, UserRole } from '@prisma/client';

type ProductDetailRow = {
  productId: string;
  sellerId: string;
  title: string;
  description: string;
  images: string[];
  priceInRupees: bigint;
  category: string;
  categoryId: string | null;
  availableSizes: string[];
  stockQuantity: number;
  productIsActive: boolean;
  productCreatedAt: Date;
  sellerEmail: string;
  categoryName: string | null;
  categorySlug: string | null;
  categoryPath: string | null;
  categoryParentId: string | null;
  categorySortOrder: number | null;
  categoryIsActive: boolean | null;
  categoryCreatedAt: Date | null;
  categoryUpdatedAt: Date | null;
  auctionId: string | null;
  auctionModel: AuctionModel | null;
  auctionStatus: AuctionStatus | null;
  auctionStartTime: Date | null;
  auctionEndTime: Date | null;
  currentHighestBidId: string | null;
  startingPriceCredits: bigint | null;
  minIncrement: bigint | null;
  bidFee: bigint | null;
  priceStepPerBid: bigint | null;
  antiSnipingWindowSeconds: number | null;
  auctionVersion: number | null;
  bidId: string | null;
  bidUserId: string | null;
  bidAmountCredits: bigint | null;
  bidStatus: BidStatus | null;
  bidIdempotencyKey: string | null;
  bidCreatedAt: Date | null;
  bidderEmail: string | null;
  bidderRole: UserRole | null;
  bidderFullName: string | null;
};

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
    const rows = await prisma.$queryRaw<ProductDetailRow[]>`
      SELECT
        product."id" AS "productId",
        product."sellerId",
        product."title",
        product."description",
        product."images",
        product."priceInRupees",
        product."category",
        product."categoryId",
        product."availableSizes",
        product."stockQuantity",
        product."isActive" AS "productIsActive",
        product."createdAt" AS "productCreatedAt",
        seller."email" AS "sellerEmail",
        category."name" AS "categoryName",
        category."slug" AS "categorySlug",
        category."path" AS "categoryPath",
        category."parentId" AS "categoryParentId",
        category."sortOrder" AS "categorySortOrder",
        category."isActive" AS "categoryIsActive",
        category."createdAt" AS "categoryCreatedAt",
        category."updatedAt" AS "categoryUpdatedAt",
        auction."id" AS "auctionId",
        auction."auctionModel",
        auction."status" AS "auctionStatus",
        auction."startTime" AS "auctionStartTime",
        auction."endTime" AS "auctionEndTime",
        auction."currentHighestBidId",
        auction."startingPriceCredits",
        auction."minIncrement",
        auction."bidFee",
        auction."priceStepPerBid",
        auction."antiSnipingWindowSeconds",
        auction."version" AS "auctionVersion",
        bid."id" AS "bidId",
        bid."userId" AS "bidUserId",
        bid."amountCredits" AS "bidAmountCredits",
        bid."status" AS "bidStatus",
        bid."idempotencyKey" AS "bidIdempotencyKey",
        bid."createdAt" AS "bidCreatedAt",
        bidder."email" AS "bidderEmail",
        bidder."role" AS "bidderRole",
        bidderProfile."fullName" AS "bidderFullName"
      FROM "Product" product
      JOIN "User" seller ON seller."id" = product."sellerId"
      LEFT JOIN "Category" category ON category."id" = product."categoryId"
      LEFT JOIN "Auction" auction ON auction."productId" = product."id"
      LEFT JOIN LATERAL (
        SELECT candidate.*
        FROM "Bid" candidate
        WHERE candidate."auctionId" = auction."id"
        ORDER BY candidate."amountCredits" DESC
        LIMIT 10
      ) bid ON TRUE
      LEFT JOIN "User" bidder ON bidder."id" = bid."userId"
      LEFT JOIN "UserProfile" bidderProfile ON bidderProfile."userId" = bidder."id"
      WHERE product."id" = ${productId}
      ORDER BY bid."amountCredits" DESC NULLS LAST
    `;
    if (!rows.length) throw new NotFoundError('Product not found');

    const product = rows[0];
    const auction = product.auctionId ? {
      id: product.auctionId,
      productId: product.productId,
      auctionModel: product.auctionModel!,
      status: product.auctionStatus!,
      startTime: product.auctionStartTime!,
      endTime: product.auctionEndTime!,
      currentHighestBidId: product.currentHighestBidId,
      startingPriceCredits: product.startingPriceCredits!,
      minIncrement: product.minIncrement!,
      bidFee: product.bidFee,
      priceStepPerBid: product.priceStepPerBid,
      antiSnipingWindowSeconds: product.antiSnipingWindowSeconds!,
      version: product.auctionVersion!,
      bids: rows.filter((row) => row.bidId).map((row) => ({
        id: row.bidId!,
        auctionId: product.auctionId!,
        userId: row.bidUserId!,
        user: {
          id: row.bidUserId!,
          email: row.bidderEmail!,
          role: row.bidderRole!,
          profile: row.bidderFullName ? { fullName: row.bidderFullName } : null,
        },
        amountCredits: row.bidAmountCredits!,
        status: row.bidStatus!,
        idempotencyKey: row.bidIdempotencyKey!,
        createdAt: row.bidCreatedAt!,
      })),
    } : null;

    return {
      id: product.productId,
      sellerId: product.sellerId,
      seller: { id: product.sellerId, email: product.sellerEmail },
      title: product.title,
      description: product.description,
      images: product.images,
      priceInRupees: product.priceInRupees,
      category: product.category,
      categoryId: product.categoryId,
      categoryNode: product.categoryId ? {
        id: product.categoryId,
        name: product.categoryName!,
        slug: product.categorySlug!,
        path: product.categoryPath!,
        parentId: product.categoryParentId,
        sortOrder: product.categorySortOrder!,
        isActive: product.categoryIsActive!,
        createdAt: product.categoryCreatedAt!,
        updatedAt: product.categoryUpdatedAt!,
      } : null,
      availableSizes: product.availableSizes,
      stockQuantity: product.stockQuantity,
      isActive: product.productIsActive,
      createdAt: product.productCreatedAt,
      auction,
    };
  }
}
