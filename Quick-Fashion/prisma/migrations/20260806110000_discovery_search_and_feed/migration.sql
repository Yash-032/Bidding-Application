CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE "InteractionType" AS ENUM ('SEARCH', 'PRODUCT_VIEW', 'PRODUCT_DWELL', 'CART_ADD', 'AUCTION_WATCH', 'BID', 'PURCHASE', 'FEED_IMPRESSION', 'FEED_CLICK', 'HIDE');

CREATE TABLE "UserInteraction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "productId" TEXT,
  "categoryId" TEXT,
  "type" "InteractionType" NOT NULL,
  "query" TEXT,
  "durationMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserInteraction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserInteraction_userId_createdAt_idx" ON "UserInteraction"("userId", "createdAt");
CREATE INDEX "UserInteraction_userId_type_createdAt_idx" ON "UserInteraction"("userId", "type", "createdAt");
CREATE INDEX "UserInteraction_productId_createdAt_idx" ON "UserInteraction"("productId", "createdAt");
CREATE INDEX "UserInteraction_categoryId_createdAt_idx" ON "UserInteraction"("categoryId", "createdAt");
CREATE INDEX "Product_title_trgm_idx" ON "Product" USING gin ("title" gin_trgm_ops);
CREATE INDEX "Product_description_trgm_idx" ON "Product" USING gin ("description" gin_trgm_ops);
CREATE INDEX "Product_discovery_candidates_idx" ON "Product"("isActive", "stockQuantity", "createdAt" DESC);
ALTER TABLE "UserInteraction" ADD CONSTRAINT "UserInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserInteraction" ADD CONSTRAINT "UserInteraction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserInteraction" ADD CONSTRAINT "UserInteraction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;