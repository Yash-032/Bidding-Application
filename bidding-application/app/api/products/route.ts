import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser, requireRole } from '@/lib/auth/session';
import { CatalogService } from '@/lib/catalog/catalog.service';
import { toErrorResponse } from '@/lib/utils/errors';

const catalogService = new CatalogService();

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const products = await catalogService.listProducts({
            search: searchParams.get('search') ?? undefined,
            endingSoon: searchParams.get('endingSoon') === 'true',
            page: Number(searchParams.get('page') ?? 1),
        });

        return NextResponse.json({
            products: products.map((p) => ({
                ...p,
                startingPriceCredits: p.startingPriceCredits.toString(),
                auction: p.auction && {
                    ...p.auction,
                    minIncrement: p.auction.minIncrement?.toString(),
                    bidFee: p.auction.bidFee?.toString() ?? null,
                    priceStepPerBid: p.auction.priceStepPerBid?.toString() ?? null,
                },
            })),
        });

    } catch(err) {
        const { body, status } = toErrorResponse(err);
        return NextResponse.json(body, { status });
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await requireSessionUser(req);
        requireRole(user, 'SELLER', 'ADMIN');
        const b = await req.json();

        const { product, auction } = await catalogService.createProductWithAuction({
            sellerId: user.id,
            title: b.title,
            description: b.description,
            images: b.images ?? [],
            startingPriceCredits: BigInt(b.startingPriceCredits),
            auctionModel: b.auctionModel,
            startTime: new Date(b.startTime),
            endTime: new Date(b.endTime),
            minIncrement: b.minIncrement ? BigInt(b.minIncrement) : undefined,
            bidFee: b.bidFee ? BigInt(b.bidFee) : undefined,
            priceStepPerBid: b.priceStepPerBid ? BigInt(b.priceStepPerBid) : undefined,
            antiSnipingWindowSeconds: b.antiSnipingWindowSeconds,
        });

        return NextResponse.json({
            product: {
                ...product,
                startingPriceCredits: product.startingPriceCredits.toString(),
            },
            auction: {
                ...auction,
                minIncrement: auction.minIncrement.toString(),
                bidFee: auction.bidFee?.toString() ?? null,
                priceStepPerBid: auction.priceStepPerBid?.toString() ?? null,
            },
        }, { status: 201 }
        );

    } catch(err) {
        const { body, status } = toErrorResponse(err);
        return NextResponse.json(body, { status });
    }
}