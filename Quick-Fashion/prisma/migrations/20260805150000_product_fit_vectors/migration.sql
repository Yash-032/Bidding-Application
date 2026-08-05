CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "ProductFitProfile" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'CM',
  "shoulderWidth" DOUBLE PRECISION NOT NULL,
  "chest" DOUBLE PRECISION NOT NULL,
  "waist" DOUBLE PRECISION NOT NULL,
  "hip" DOUBLE PRECISION NOT NULL,
  "neck" DOUBLE PRECISION NOT NULL,
  "sleeveLength" DOUBLE PRECISION NOT NULL,
  "armLength" DOUBLE PRECISION NOT NULL,
  "thigh" DOUBLE PRECISION NOT NULL,
  "calf" DOUBLE PRECISION NOT NULL,
  "fitVector" vector(9),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductFitProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductFitProfile_productId_key" ON "ProductFitProfile"("productId");
CREATE INDEX "ProductFitProfile_fitVector_hnsw_idx" ON "ProductFitProfile" USING hnsw ("fitVector" vector_l2_ops);
CREATE INDEX "Product_isActive_stockQuantity_idx" ON "Product"("isActive", "stockQuantity");
ALTER TABLE "ProductFitProfile" ADD CONSTRAINT "ProductFitProfile_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;