import { prisma } from '@/lib/prisma';
import { AuctionModel } from '@prisma/client'
import { NotFoundError, ValidationError } from '@/lib/utils/errors';

export interface CreateProductRequest {    
  sellerId: string;
  title: string;
  description: string;
  images: string[];
  startingPriceCredits: bigint; 
  auctionModel: AuctionModel;
  startTime: Date;
  endTime: Date;
  minIncrement?: bigint;
  bidFee?: bigint;
  priceStepPerBid?: bigint;
  antiSnipingWindowSeconds?: number;
}

export class CatalogService {
    async createProductWithAuction(req: CreateProductRequest) {
        if(req.endTime <= req.startTime) {
            throw new ValidationError('End time must be after start time');
        }
        if(req.auctionModel === "PENNY" && (req.bidFee == null || req.priceStepPerBid == null)) {
            throw new ValidationError('PENNY auction model requires bidFee and priceStepPerBid');
        }

        return prisma.$transaction(async (tx) => {
            const product  = await tx.product.create({
                data: {
                    sellerId: req.sellerId,
                    title: req.title,
                    description: req.description,
                    images: req.images,
                    startingPriceCredits: req.startingPriceCredits,
                },
            });
            const auction = await tx.auction.create({
                data: {
                    productId: product.id,
                    auctionModel: req.auctionModel,
                    status: 'SCHEDULED',
                    startTime: req.startTime,
                    endTime: req.endTime,
                    minIncrement: req.minIncrement ?? 1, 
                    bidFee: req.bidFee,
                    priceStepPerBid: req.priceStepPerBid,
                    antiSnipingWindowSeconds: req.antiSnipingWindowSeconds ?? 30,
                },
            });

            return { product, auction };
        });
    }

    async listProducts(params: { search?: string; endingSoon?: boolean; page?: number; pageSize?: number }) {
        const page = params.page ?? 1;
        const pageSize = params.pageSize ?? 10;

        const products = await prisma.product.findMany({
            where: params.search
                ? { title: { contains: params.search, mode: 'insensitive' } }
                : undefined,
            include: { auction: true },
            orderBy: params.endingSoon ? { auction: { endTime: 'asc' } } : { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
        });

        return products;
    }

    async getProductDetail(productId: string) {
        const product = await prisma.product.findUnique({
            where: { id: productId },
            include: {
                auction: {
                    include: {
                        bids: { orderBy: { amountCredits: 'desc' }, take: 10 },
                    },
                },
                seller: { select: { id: true, name: true }},
            },
        });

        if(!product)    throw new NotFoundError('Product not found');
        return product;
    }

    async activateDueAction() {
        const result = await prisma.auction.updateMany({
            where: { status: 'SCHEDULED', startTime: { lte: new Date() }},
            data: { status: 'ACTIVE' },
        });

        return  { activatedCount: result.count };
    }
}