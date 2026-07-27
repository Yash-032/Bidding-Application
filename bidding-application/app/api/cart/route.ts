import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSessionUser } from '@/lib/auth/session';
import { toErrorResponse } from '@/lib/utils/errors';

const include = { items: { include: { product: { include: { auction: true, categoryNode: true } } }, orderBy: { createdAt: 'desc' as const } } };
const serialize = (cart: any) => ({
  ...cart,
  items: cart.items.map((item: any) => ({
    ...item,
    product: {
      ...item.product,
      priceInRupees: item.product.priceInRupees.toString(),
      auction: item.product.auction ? {
        ...item.product.auction,
        startingPriceCredits: item.product.auction.startingPriceCredits.toString(),
        minIncrement: item.product.auction.minIncrement.toString(),
        bidFee: item.product.auction.bidFee?.toString() ?? null,
        priceStepPerBid: item.product.auction.priceStepPerBid?.toString() ?? null,
      } : null,
    },
  })),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const cart = await prisma.cart.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {}, include });
    return NextResponse.json(serialize(cart));
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const body = await request.json();
    const product = await prisma.product.findUnique({ where: { id: String(body.productId) } });
    const size = String(body.size || '');
    const quantity = Math.max(1, Math.min(10, Number(body.quantity || 1)));
    if (!product || !product.isActive || product.stockQuantity < quantity) return NextResponse.json({ error: 'Product is unavailable' }, { status: 400 });
    if (!product.availableSizes.includes(size)) return NextResponse.json({ error: 'Selected size is unavailable' }, { status: 400 });
    const cart = await prisma.cart.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
    await prisma.cartItem.upsert({
      where: { cartId_productId_size: { cartId: cart.id, productId: product.id, size } },
      create: { cartId: cart.id, productId: product.id, size, quantity },
      update: { quantity: { increment: quantity } },
    });
    return GET(request);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const body = await request.json();
    const quantity = Math.max(1, Math.min(10, Number(body.quantity || 1)));
    await prisma.cartItem.updateMany({ where: { id: String(body.itemId), cart: { userId: user.id } }, data: { quantity } });
    return GET(request);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const itemId = request.nextUrl.searchParams.get('itemId') || '';
    await prisma.cartItem.deleteMany({ where: { id: itemId, cart: { userId: user.id } } });
    return GET(request);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
