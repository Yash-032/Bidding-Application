-- CreateEnum
CREATE TYPE "StoreOrderStatus" AS ENUM ('PAYMENT_PENDING', 'PAID', 'PAYMENT_FAILED', 'CANCELLED', 'FULFILLED', 'REFUNDED');

-- CreateTable
CREATE TABLE "StoreOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "subtotalPaise" BIGINT NOT NULL,
    "shippingPaise" BIGINT NOT NULL,
    "totalPaise" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "StoreOrderStatus" NOT NULL DEFAULT 'PAYMENT_PENDING',
    "razorpayOrderId" TEXT NOT NULL,
    "razorpayPaymentId" TEXT,
    "deliveryAddress" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RazorpayWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RazorpayWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreOrder_razorpayOrderId_key" ON "StoreOrder"("razorpayOrderId");
CREATE UNIQUE INDEX "StoreOrder_razorpayPaymentId_key" ON "StoreOrder"("razorpayPaymentId");
CREATE INDEX "StoreOrder_userId_createdAt_idx" ON "StoreOrder"("userId", "createdAt");
CREATE INDEX "StoreOrder_productId_idx" ON "StoreOrder"("productId");
CREATE UNIQUE INDEX "RazorpayWebhookEvent_eventId_key" ON "RazorpayWebhookEvent"("eventId");

ALTER TABLE "StoreOrder" ADD CONSTRAINT "StoreOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StoreOrder" ADD CONSTRAINT "StoreOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
