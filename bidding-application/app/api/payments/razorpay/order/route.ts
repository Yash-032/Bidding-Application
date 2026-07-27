import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireSessionUser } from '@/lib/auth/session';
import {
  createRazorpayOrder,
  getRazorpayKeyId,
  RazorpayConfigurationError,
} from '@/lib/payments/razorpay';

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const body = await request.json();
    const delivery = body.deliveryAddress;
    if (!delivery?.name || !delivery?.email || !delivery?.phone || !delivery?.address || !delivery?.city || !delivery?.pinCode) {
      return NextResponse.json({ error: 'Complete all contact and delivery fields' }, { status: 400 });
    }

    const cart = await prisma.cart.findUnique({
      where: { userId: user.id },
      include: { items: { include: { product: true } } },
    });
    if (!cart?.items.length) return NextResponse.json({ error: 'Your shopping bag is empty' }, { status: 400 });

    for (const item of cart.items) {
      if (!item.product.isActive || item.product.stockQuantity < item.quantity || !item.product.availableSizes.includes(item.size)) {
        return NextResponse.json({ error: `${item.product.title} is no longer available in the requested quantity or size` }, { status: 409 });
      }
    }

    const orderItems = cart.items.map((item) => {
      const unitPricePaise = item.product.priceInRupees * BigInt(100);
      return {
        productId: item.productId,
        productTitle: item.product.title,
        productImage: item.product.images[0] || null,
        size: item.size,
        quantity: item.quantity,
        unitPricePaise,
        lineTotalPaise: unitPricePaise * BigInt(item.quantity),
      };
    });
    const subtotalPaise = orderItems.reduce((sum, item) => sum + item.lineTotalPaise, BigInt(0));
    const shippingPaise = subtotalPaise >= BigInt(1_000_000) ? BigInt(0) : BigInt(50_000);
    const totalPaise = subtotalPaise + shippingPaise;
    if (totalPaise <= 0 || totalPaise > BigInt(Number.MAX_SAFE_INTEGER)) return NextResponse.json({ error: 'Invalid order total' }, { status: 400 });

    const localOrderId = randomUUID();
    const gatewayOrder = await createRazorpayOrder({
      amount: Number(totalPaise),
      receipt: localOrderId.slice(0, 40),
      notes: { localOrderId, userId: user.id, itemCount: String(orderItems.length) },
    });
    const order = await prisma.storeOrder.create({
      data: {
        id: localOrderId,
        userId: user.id,
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
      productName: `${orderItems.length} item${orderItems.length === 1 ? '' : 's'} from The Reserve`,
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
