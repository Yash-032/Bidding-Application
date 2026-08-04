import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSessionUser } from '@/lib/auth/session';
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
  // This route is deliberately impossible to use in a production build.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const user = await requireSessionUser(request);
    const body = await request.json();
    const delivery = deliveryAddress(body.deliveryAddress);

    const result = await prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({
        where: { userId: user.id },
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

      const orderItems = cart.items.map((item) => {
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

      // The conditional updates are the inventory lock. Concurrent checkouts
      // cannot decrement a product below zero; any failure rolls back all items.
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
          userId: user.id,
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

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      const inventory = await tx.product.findMany({
        where: { id: { in: [...new Set(orderItems.map((item) => item.productId))] } },
        select: { id: true, title: true, stockQuantity: true },
        orderBy: { title: 'asc' },
      });
      return { orderId: order.id, inventory };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    console.info(JSON.stringify({
      event: 'development_mock_checkout_completed',
      userId: user.id,
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
