import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyWebhookSignature } from '@/lib/payments/razorpay';

type PaymentEntity = { id: string; order_id: string; amount: number; currency: string; status: string; captured: boolean };

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') || '';
  const eventId = request.headers.get('x-razorpay-event-id') || '';
  try {
    if (!eventId || !verifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 });
    }
    const duplicate = await prisma.razorpayWebhookEvent.findUnique({ where: { eventId } });
    if (duplicate) return NextResponse.json({ received: true });

    const event = JSON.parse(rawBody);
    const payment = event?.payload?.payment?.entity as PaymentEntity | undefined;
    await prisma.$transaction(async (tx) => {
      const seen = await tx.razorpayWebhookEvent.findUnique({ where: { eventId } });
      if (seen) return;
      if (payment?.order_id) {
        const order = await tx.storeOrder.findUnique({ where: { razorpayOrderId: payment.order_id }, include: { items: true } });
        if (order && payment.amount === Number(order.totalPaise) && payment.currency === order.currency) {
          if ((event.event === 'payment.captured' || event.event === 'order.paid') && payment.captured) {
            const updated = await tx.storeOrder.updateMany({
              where: { id: order.id, status: 'PAYMENT_PENDING' },
              data: { status: 'PAID', razorpayPaymentId: payment.id, paidAt: order.paidAt || new Date() },
            });
            if (updated.count) {
              for (const item of order.items) await tx.product.update({ where: { id: item.productId }, data: { stockQuantity: { decrement: item.quantity } } });
              const cart = await tx.cart.findUnique({ where: { userId: order.userId } });
              if (cart) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
            }
          } else if (event.event === 'payment.failed' && order.status === 'PAYMENT_PENDING') {
            await tx.storeOrder.update({ where: { id: order.id }, data: { status: 'PAYMENT_FAILED' } });
          }
        }
      }
      await tx.razorpayWebhookEvent.create({ data: { eventId, eventType: String(event.event || 'unknown') } });
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Razorpay webhook processing failed', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
