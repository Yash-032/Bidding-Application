-- AlterTable
ALTER TABLE "Product" ADD COLUMN "targetUserId" TEXT;

-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN "viewType" TEXT NOT NULL DEFAULT 'FRONT';

-- CreateIndex
CREATE INDEX "Product_targetUserId_idx" ON "Product"("targetUserId");

-- CreateIndex
CREATE INDEX "ProductImage_productId_viewType_idx" ON "ProductImage"("productId", "viewType");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
