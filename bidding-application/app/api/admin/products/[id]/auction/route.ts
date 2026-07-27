import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, requireSessionUser } from '@/lib/auth/session';
import { toErrorResponse } from '@/lib/utils/errors';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSessionUser(request);
    requireRole(user, 'ADMIN');
    const productId = (await params).id;
    const body = await request.json();
    const startTime = new Date(body.startTime);
    const endTime = new Date(body.endTime);
    const auctionModel = String(body.auctionModel || 'ENGLISH');
    if (!(startTime < endTime)) return NextResponse.json({ error: 'Auction end must be after its start' }, { status: 400 });
    if (auctionModel !== 'ENGLISH') return NextResponse.json({ error: 'Only the English auction strategy is currently implemented for live bidding' }, { status: 400 });
    const existing = await prisma.auction.findUnique({ where: { productId } });
    if (existing && !['CLOSED', 'CANCELLED', 'DRAFT'].includes(existing.status)) return NextResponse.json({ error: 'This product already has a current auction' }, { status: 409 });
    const auction = await prisma.auction.upsert({
      where: { productId },
      create: { productId, auctionModel: auctionModel as any, status: 'SCHEDULED', startTime, endTime, startingPriceCredits: BigInt(body.startingPriceCredits), minIncrement: BigInt(body.minIncrement || 1), bidFee: body.bidFee ? BigInt(body.bidFee) : null, priceStepPerBid: body.priceStepPerBid ? BigInt(body.priceStepPerBid) : null, antiSnipingWindowSeconds: Number(body.antiSnipingWindowSeconds || 30) },
      update: { auctionModel: auctionModel as any, status: 'SCHEDULED', startTime, endTime, startingPriceCredits: BigInt(body.startingPriceCredits), minIncrement: BigInt(body.minIncrement || 1), bidFee: body.bidFee ? BigInt(body.bidFee) : null, priceStepPerBid: body.priceStepPerBid ? BigInt(body.priceStepPerBid) : null, antiSnipingWindowSeconds: Number(body.antiSnipingWindowSeconds || 30), currentHighestBidId: null },
    });
    return NextResponse.json({ auction: { ...auction, startingPriceCredits: auction.startingPriceCredits.toString(), minIncrement: auction.minIncrement.toString() } }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
