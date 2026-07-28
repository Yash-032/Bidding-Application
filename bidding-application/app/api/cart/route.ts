import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSessionClaims } from '@/lib/auth/session';
import { toErrorResponse } from '@/lib/utils/errors';

type CartRow = {
  cartId: string;
  itemId: string | null;
  size: string | null;
  quantity: number | null;
  productId: string | null;
  title: string | null;
  images: string[] | null;
  priceInRupees: bigint | null;
  category: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryPath: string | null;
  availableSizes: string[] | null;
  stockQuantity: number | null;
  isActive: boolean | null;
};

async function getCartForUser(userId: string) {
  const rows = await prisma.$queryRaw<CartRow[]>`
    SELECT
      c."id" AS "cartId",
      ci."id" AS "itemId",
      ci."size",
      ci."quantity",
      p."id" AS "productId",
      p."title",
      p."images",
      p."priceInRupees",
      p."category",
      p."categoryId",
      category."name" AS "categoryName",
      category."path" AS "categoryPath",
      p."availableSizes",
      p."stockQuantity",
      p."isActive"
    FROM "Cart" c
    LEFT JOIN "CartItem" ci ON ci."cartId" = c."id"
    LEFT JOIN "Product" p ON p."id" = ci."productId"
    LEFT JOIN "Category" category ON category."id" = p."categoryId"
    WHERE c."userId" = ${userId}
    ORDER BY ci."createdAt" DESC
  `;
  if (!rows.length) {
    const cart = await prisma.cart.create({ data: { userId }, select: { id: true } });
    return { id: cart.id, items: [] };
  }
  return {
    id: rows[0].cartId,
    items: rows.filter((row) => row.itemId && row.productId).map((row) => ({
      id: row.itemId!,
      size: row.size!,
      quantity: row.quantity!,
      product: {
        id: row.productId!,
        title: row.title!,
        images: row.images ?? [],
        priceInRupees: row.priceInRupees!.toString(),
        category: row.category!,
        categoryId: row.categoryId,
        categoryNode: row.categoryId ? {
          id: row.categoryId,
          name: row.categoryName!,
          path: row.categoryPath!,
        } : null,
        availableSizes: row.availableSizes ?? [],
        stockQuantity: row.stockQuantity ?? 0,
        isActive: row.isActive ?? false,
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
