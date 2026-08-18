import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth/session';
import { ConflictError, ValidationError, toErrorResponse } from '@/lib/utils/errors';

export const runtime = 'nodejs';

type DeliveryAddress = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  pinCode: string;
};

function deliveryAddress(value: unknown): DeliveryAddress {
  if (!value || typeof value !== 'object') {
    throw new ValidationError('Complete all contact and delivery fields');
  }
  const source = value as Record<string, unknown>;
  const result = {
    name: String(source.name ?? '').trim(),
    email: String(source.email ?? '').trim(),
    phone: String(source.phone ?? '').trim(),
    address: String(source.address ?? '').trim(),
    city: String(source.city ?? '').trim(),
    pinCode: String(source.pinCode ?? '').trim(),
  };
  if (Object.values(result).some((field) => !field || field.length > 300)) {
    throw new ValidationError('Complete all contact and delivery fields');
  }
  return result;
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const sessionUser = await getSessionUser(request);
    const body = await request.json();
    const delivery = deliveryAddress(body.deliveryAddress);

    let targetUserId = sessionUser?.id;
    if (!targetUserId) {
      const email = delivery.email.toLowerCase();
      let guestUser = await prisma.user.findUnique({ where: { email } });
      if (!guestUser) {
        guestUser = await prisma.user.create({
          data: {
            email,
            passwordHash: '$2a$10$guest_checkout_placeholder_hash',
            role: 'BUYER',
            isVerified: true,
          },
        });
      }
      targetUserId = guestUser.id;
    }

    const result = await prisma.$transaction(async (tx) => {
      let orderItems: Array<{
        productId: string;
        productTitle: string;
        productImage: string | null;
        size: string;
        quantity: number;
        unitPricePaise: bigint;
        lineTotalPaise: bigint;
      }> = [];

      let userCartId: string | null = null;

      if (Array.isArray(body.guestItems) && body.guestItems.length > 0) {
        const rawItems: Array<{ productId: string; size: string; quantity: number }> = body.guestItems;
        const productIds = rawItems.map((i) => String(i.productId));
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
          include: {
            protectedImages: {
              orderBy: { sortOrder: 'asc' },
              select: { id: true },
            },
          },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));

        orderItems = rawItems.map((item) => {
          const p = productMap.get(String(item.productId));
          if (!p || !p.isActive || !p.availableSizes.includes(item.size) || item.quantity < 1) {
            throw new ConflictError(
              `${p?.title ?? 'Item'} is no longer available in the requested size`,
            );
          }
          const unitPricePaise = (p.priceInRupees + BigInt(49)) * BigInt(100);
          return {
            productId: p.id,
            productTitle: p.title,
            productImage: p.protectedImages[0]?.id ?? null,
            size: item.size,
            quantity: Number(item.quantity),
            unitPricePaise,
            lineTotalPaise: unitPricePaise * BigInt(item.quantity),
          };
        });
      } else {
        const cart = await tx.cart.findUnique({
          where: { userId: targetUserId },
          include: {
            items: {
              include: {
                product: {
                  include: {
                    protectedImages: {
                      orderBy: { sortOrder: 'asc' },
                      select: { id: true },
                    },
                  },
                },
              },
            },
          },
        });
        if (!cart?.items.length) {
          throw new ValidationError('Your shopping bag is empty');
        }
        userCartId = cart.id;

        orderItems = cart.items.map((item) => {
          if (
            !item.product.isActive ||
            !item.product.availableSizes.includes(item.size) ||
            item.quantity < 1
          ) {
            throw new ConflictError(
              `${item.product.title} is no longer available in the requested size`,
            );
          }
          const unitPricePaise = item.product.priceInRupees * BigInt(100);
          return {
            productId: item.productId,
            productTitle: item.product.title,
            productImage: item.product.protectedImages[0]?.id ?? null,
            size: item.size,
            quantity: item.quantity,
            unitPricePaise,
            lineTotalPaise: unitPricePaise * BigInt(item.quantity),
          };
        });
      }

      if (!orderItems.length) {
        throw new ValidationError('Your shopping bag is empty');
      }

      for (const item of orderItems) {
        const reserved = await tx.product.updateMany({
          where: {
            id: item.productId,
            isActive: true,
            availableSizes: { has: item.size },
            stockQuantity: { gte: item.quantity },
          },
          data: { stockQuantity: { decrement: item.quantity } },
        });
        if (reserved.count !== 1) {
          throw new ConflictError(
            `${item.productTitle} no longer has enough stock`,
          );
        }
      }

      const subtotalPaise = orderItems.reduce(
        (sum, item) => sum + item.lineTotalPaise,
        BigInt(0),
      );
      const shippingPaise =
        subtotalPaise >= BigInt(1_000_000) ? BigInt(0) : BigInt(50_000);
      const reference = randomUUID();
      const now = new Date();
      const order = await tx.storeOrder.create({
        data: {
          userId: targetUserId,
          subtotalPaise,
          shippingPaise,
          totalPaise: subtotalPaise + shippingPaise,
          status: 'PAID',
          razorpayOrderId: `mock_order_${reference}`,
          razorpayPaymentId: `mock_payment_${reference}`,
          deliveryAddress: delivery,
          paidAt: now,
          items: { create: orderItems },
        },
        select: { id: true },
      });

      if (userCartId) {
        await tx.cartItem.deleteMany({ where: { cartId: userCartId } });
      }

      const inventory = await tx.product.findMany({
        where: { id: { in: [...new Set(orderItems.map((item) => item.productId))] } },
        select: { id: true, title: true, stockQuantity: true },
        orderBy: { title: 'asc' },
      });
      return { orderId: order.id, inventory };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    console.info(JSON.stringify({
      event: 'mock_checkout_completed',
      userId: targetUserId,
      orderId: result.orderId,
      inventory: result.inventory,
    }));
    return NextResponse.json({ success: true, mock: true, ...result });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    ) {
      return NextResponse.json(
        { error: 'Inventory changed during checkout. Please try again.' },
        { status: 409 },
      );
    }
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
