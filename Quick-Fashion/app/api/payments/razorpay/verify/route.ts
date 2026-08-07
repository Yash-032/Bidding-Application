import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSessionUser } from '@/lib/auth/session';
import { fetchRazorpayPayment, verifyCheckoutSignature } from '@/lib/payments/razorpay';
import { recordInteraction } from '@/lib/discovery/feed.service';

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const body = await request.json();
    const orderId = String(body.razorpay_order_id || '');
    const paymentId = String(body.razorpay_payment_id || '');
    const signature = String(body.razorpay_signature || '');
    if (!orderId || !paymentId || !signature || !verifyCheckoutSignature(orderId, paymentId, signature)) {
      return NextResponse.json({ error: 'Payment signature verification failed' }, { status: 400 });
    }

    const order = await prisma.storeOrder.findUnique({ where: { razorpayOrderId: orderId }, include: { items: true } });
    if (!order || order.userId !== user.id) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (order.status === 'PAID') return NextResponse.json({ success: true, orderId: order.id });

    const payment = await fetchRazorpayPayment(paymentId);
    const isValidPayment =
      payment.order_id === order.razorpayOrderId &&
      payment.amount === Number(order.totalPaise) &&
      payment.currency === order.currency &&
      payment.captured &&
      payment.status === 'captured';
    if (!isValidPayment) {
      return NextResponse.json({ error: 'Payment has not been captured yet' }, { status: 409 });
    }

    await prisma.$transaction(async (tx) => {
      const updated = await tx.storeOrder.updateMany({
        where: { id: order.id, status: 'PAYMENT_PENDING' },
        data: { status: 'PAID', razorpayPaymentId: payment.id, paidAt: new Date() },
      });
      if (!updated.count) return;
      for (const item of order.items) {
        await tx.product.update({ where: { id: item.productId }, data: { stockQuantity: { decrement: item.quantity } } });
      }
      const cart = await tx.cart.findUnique({ where: { userId: order.userId } });
      if (cart) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    });
    for (const item of order.items) void recordInteraction(order.userId, { type: 'PURCHASE', productId: item.productId }).catch(() => undefined);
    return NextResponse.json({ success: true, orderId: order.id });
  } catch (error) {
    console.error('Failed to verify Razorpay payment', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not verify payment' }, { status: 500 });
  }
}
