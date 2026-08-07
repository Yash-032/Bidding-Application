import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSessionClaims } from '@/lib/auth/session';
import { toErrorResponse } from '@/lib/utils/errors';
import { recordInteraction } from '@/lib/discovery/feed.service';

async function getCartForUser(userId: string) {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        orderBy: { createdAt: 'desc' },
        include: {
          product: {
            include: {
              categoryNode: { select: { id: true, name: true, path: true } },
              protectedImages: { orderBy: { sortOrder: 'asc' }, select: { id: true, width: true, height: true } },
            },
          },
        },
      },
    },
  });
  if (!cart) {
    const created = await prisma.cart.create({ data: { userId }, select: { id: true } });
    return { id: created.id, items: [] };
  }
  return {
    id: cart.id,
    items: cart.items.map((item) => ({
      id: item.id,
      size: item.size,
      quantity: item.quantity,
      product: {
        id: item.product.id,
        title: item.product.title,
        protectedImages: item.product.protectedImages,
        priceInRupees: item.product.priceInRupees.toString(),
        category: item.product.category,
        categoryId: item.product.categoryId,
        categoryNode: item.product.categoryNode,
        availableSizes: item.product.availableSizes,
        stockQuantity: item.product.stockQuantity,
        isActive: item.product.isActive,
      },
    })),
  };
}

async function getCartId(userId: string) {
  const cart = await prisma.cart.findUnique({ where: { userId }, select: { id: true } });
  return cart ?? prisma.cart.create({ data: { userId }, select: { id: true } });
}

export async function GET(request: NextRequest) {
  try {
    const user = requireSessionClaims(request);
    const cart = await getCartForUser(user.id);
    return NextResponse.json(cart);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
      const user = requireSessionClaims(request);
      const body = await request.json();
      const [product, cart] = await Promise.all([
        prisma.product.findUnique({
          where: { id: String(body.productId) },
          select: { id: true, isActive: true, stockQuantity: true, availableSizes: true },
        }),
        getCartId(user.id),
      ]);

      const size = String(body.size || '');
      
      const quantity = Math.max(1, Math.min(10, Number(body.quantity || 1)));
      
      if (!product || !product.isActive || product.stockQuantity < quantity) return NextResponse.json({ error: 'Product is unavailable' }, { status: 400 });
      if (!product.availableSizes.includes(size)) return NextResponse.json({ error: 'Selected size is unavailable' }, { status: 400 });
      
      const cartItem = await prisma.cartItem.upsert({
        where: { cartId_productId_size: { cartId: cart.id, productId: product.id, size } },
        create: { cartId: cart.id, productId: product.id, size, quantity },
        update: { quantity: { increment: quantity } },
        select: { id: true },
      });

      void recordInteraction(user.id, { type: 'CART_ADD', productId: product.id }).catch(() => undefined);
      return NextResponse.json({ added: true, itemId: cartItem.id }, { status: 201 });
  
  } catch (error) {
      const { body, status } = toErrorResponse(error);
      return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = requireSessionClaims(request);
    const body = await request.json();
    const quantity = Math.max(1, Math.min(10, Number(body.quantity || 1)));
    await prisma.cartItem.updateMany({ where: { id: String(body.itemId), cart: { userId: user.id } }, data: { quantity } });
    return NextResponse.json(await getCartForUser(user.id));
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = requireSessionClaims(request);
    const itemId = request.nextUrl.searchParams.get('itemId') || '';
    await prisma.cartItem.deleteMany({ where: { id: itemId, cart: { userId: user.id } } });
    return NextResponse.json(await getCartForUser(user.id));
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
