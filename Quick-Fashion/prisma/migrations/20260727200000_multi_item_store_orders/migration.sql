ALTER TABLE "StoreOrder" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "StoreOrder" ALTER COLUMN "size" DROP NOT NULL;

CREATE TABLE "StoreOrderItem" (
  "id" TEXT NOT NULL,
  "storeOrderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productTitle" TEXT NOT NULL,
  "productImage" TEXT,
  "size" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPricePaise" BIGINT NOT NULL,
  "lineTotalPaise" BIGINT NOT NULL,
  CONSTRAINT "StoreOrderItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StoreOrderItem_storeOrderId_idx" ON "StoreOrderItem"("storeOrderId");
CREATE INDEX "StoreOrderItem_productId_idx" ON "StoreOrderItem"("productId");
ALTER TABLE "StoreOrderItem" ADD CONSTRAINT "StoreOrderItem_storeOrderId_fkey" FOREIGN KEY ("storeOrderId") REFERENCES "StoreOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreOrderItem" ADD CONSTRAINT "StoreOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
