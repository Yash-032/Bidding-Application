import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth/session';
import {
  createRazorpayOrder,
  getRazorpayKeyId,
  RazorpayConfigurationError,
} from '@/lib/payments/razorpay';

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request);
    const body = await request.json();
    const delivery = body.deliveryAddress;
    if (!delivery?.name || !delivery?.email || !delivery?.phone || !delivery?.address || !delivery?.city || !delivery?.pinCode) {
      return NextResponse.json({ error: 'Complete all contact and delivery fields' }, { status: 400 });
    }

    let targetUserId = sessionUser?.id;
    if (!targetUserId) {
      const email = String(delivery.email).toLowerCase();
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

    let orderItems: Array<{
      productId: string;
      productTitle: string;
      productImage: string | null;
      size: string;
      quantity: number;
      unitPricePaise: bigint;
      lineTotalPaise: bigint;
    }> = [];

    if (Array.isArray(body.guestItems) && body.guestItems.length > 0) {
      const rawItems: Array<{ productId: string; size: string; quantity: number }> = body.guestItems;
      const productIds = rawItems.map((i) => String(i.productId));
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        include: {
          protectedImages: { orderBy: { sortOrder: 'asc' }, select: { id: true } },
        },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      for (const item of rawItems) {
        const p = productMap.get(String(item.productId));
        if (!p || !p.isActive || p.stockQuantity < item.quantity || !p.availableSizes.includes(item.size)) {
          return NextResponse.json({ error: `${p?.title ?? 'Item'} is no longer available in the requested quantity or size` }, { status: 409 });
        }
        const unitPricePaise = (p.priceInRupees + BigInt(49)) * BigInt(100);
        orderItems.push({
          productId: p.id,
          productTitle: p.title,
          productImage: p.protectedImages[0]?.id || null,
          size: item.size,
          quantity: item.quantity,
          unitPricePaise,
          lineTotalPaise: unitPricePaise * BigInt(item.quantity),
        });
      }
    } else {
      const cart = await prisma.cart.findUnique({
        where: { userId: targetUserId },
        include: {
          items: {
            include: {
              product: { include: { protectedImages: { orderBy: { sortOrder: 'asc' }, select: { id: true } } } },
            },
          },
        },
      });
      if (!cart?.items.length) return NextResponse.json({ error: 'Your shopping bag is empty' }, { status: 400 });

      for (const item of cart.items) {
        if (!item.product.isActive || item.product.stockQuantity < item.quantity || !item.product.availableSizes.includes(item.size)) {
          return NextResponse.json({ error: `${item.product.title} is no longer available in the requested quantity or size` }, { status: 409 });
        }
      }

      orderItems = cart.items.map((item) => {
        const unitPricePaise = item.product.priceInRupees * BigInt(100);
        return {
          productId: item.productId,
          productTitle: item.product.title,
          productImage: item.product.protectedImages[0]?.id || null,
          size: item.size,
          quantity: item.quantity,
          unitPricePaise,
          lineTotalPaise: unitPricePaise * BigInt(item.quantity),
        };
      });
    }

    if (!orderItems.length) return NextResponse.json({ error: 'Your shopping bag is empty' }, { status: 400 });

    const subtotalPaise = orderItems.reduce((sum, item) => sum + item.lineTotalPaise, BigInt(0));
    const shippingPaise = subtotalPaise >= BigInt(1_000_000) ? BigInt(0) : BigInt(50_000);
    const totalPaise = subtotalPaise + shippingPaise;
    if (totalPaise <= 0 || totalPaise > BigInt(Number.MAX_SAFE_INTEGER)) return NextResponse.json({ error: 'Invalid order total' }, { status: 400 });

    const localOrderId = randomUUID();
    const gatewayOrder = await createRazorpayOrder({
      amount: Number(totalPaise),
      receipt: localOrderId.slice(0, 40),
      notes: { localOrderId, userId: targetUserId, itemCount: String(orderItems.length) },
    });
    const order = await prisma.storeOrder.create({
      data: {
        id: localOrderId,
        userId: targetUserId,
        subtotalPaise,
        shippingPaise,
        totalPaise,
        razorpayOrderId: gatewayOrder.id,
        deliveryAddress: delivery,
        items: { create: orderItems },
      },
    });

    return NextResponse.json({
      keyId: getRazorpayKeyId(),
      localOrderId: order.id,
      razorpayOrderId: gatewayOrder.id,
      amount: Number(order.totalPaise),
      currency: order.currency,
      productName: `${orderItems.length} item${orderItems.length === 1 ? '' : 's'} from Quick Fashion`,
      customer: { name: delivery.name, email: delivery.email, contact: delivery.phone },
    });
  } catch (error) {
    console.error('Failed to create Razorpay order', error);
    const isConfigurationError = error instanceof RazorpayConfigurationError;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not start payment' },
      { status: isConfigurationError ? 503 : 500 },
    );
  }
}
