CREATE TABLE "ProductImage" (
  "id" TEXT NOT NULL,
  "productId" TEXT,
  "uploaderId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "originalKey" TEXT NOT NULL,
  "variants" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'STAGED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductImage_originalKey_key" ON "ProductImage"("originalKey");
CREATE INDEX "ProductImage_productId_sortOrder_idx" ON "ProductImage"("productId", "sortOrder");
CREATE INDEX "ProductImage_uploaderId_status_idx" ON "ProductImage"("uploaderId", "status");

ALTER TABLE "ProductImage"
  ADD CONSTRAINT "ProductImage_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
