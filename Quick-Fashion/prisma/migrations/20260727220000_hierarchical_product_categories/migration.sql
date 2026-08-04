CREATE TABLE "Category" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "parentId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Category_path_key" ON "Category"("path");
CREATE UNIQUE INDEX "Category_parentId_slug_key" ON "Category"("parentId", "slug");
CREATE INDEX "Category_parentId_isActive_sortOrder_idx" ON "Category"("parentId", "isActive", "sortOrder");
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Category" ("id", "name", "slug", "path", "sortOrder") VALUES
  ('cat-shirt', 'Shirt', 'shirt', 'shirt', 10),
  ('cat-t-shirt', 'T-Shirt', 't-shirt', 't-shirt', 20),
  ('cat-tops', 'Tops', 'tops', 'tops', 30),
  ('cat-bottoms', 'Bottoms', 'bottoms', 'bottoms', 40),
  ('cat-dress', 'Dress', 'dress', 'dress', 50),
  ('cat-sweater', 'Sweater', 'sweater', 'sweater', 60),
  ('cat-sweatshirt', 'Sweatshirt', 'sweatshirt', 'sweatshirt', 70),
  ('cat-hoodie', 'Hoodie', 'hoodie', 'hoodie', 80),
  ('cat-crop-tops', 'Crop tops', 'crop-tops', 'crop-tops', 90),
  ('cat-shrug', 'Shrug', 'shrug', 'shrug', 100),
  ('cat-jackets', 'Jackets', 'jackets', 'jackets', 110),
  ('cat-denim-jackets', 'Denim Jackets', 'denim-jackets', 'denim-jackets', 120);

INSERT INTO "Category" ("id", "name", "slug", "path", "parentId", "sortOrder") VALUES
  ('cat-shirt-half', 'Half sleeves', 'half-sleeves', 'shirt/half-sleeves', 'cat-shirt', 10),
  ('cat-shirt-medium', 'Medium sleeves', 'medium-sleeves', 'shirt/medium-sleeves', 'cat-shirt', 20),
  ('cat-shirt-large', 'Large sleeves', 'large-sleeves', 'shirt/large-sleeves', 'cat-shirt', 30),
  ('cat-shirt-sleeveless', 'Sleeveless', 'sleeveless', 'shirt/sleeveless', 'cat-shirt', 40),
  ('cat-t-shirt-half', 'Half sleeves', 'half-sleeves', 't-shirt/half-sleeves', 'cat-t-shirt', 10),
  ('cat-t-shirt-medium', 'Medium sleeves', 'medium-sleeves', 't-shirt/medium-sleeves', 'cat-t-shirt', 20),
  ('cat-t-shirt-large', 'Large sleeves', 'large-sleeves', 't-shirt/large-sleeves', 'cat-t-shirt', 30),
  ('cat-t-shirt-sleeveless', 'Sleeveless', 'sleeveless', 't-shirt/sleeveless', 'cat-t-shirt', 40),
  ('cat-tops-half', 'Half sleeves', 'half-sleeves', 'tops/half-sleeves', 'cat-tops', 10),
  ('cat-tops-medium', 'Medium sleeves', 'medium-sleeves', 'tops/medium-sleeves', 'cat-tops', 20),
  ('cat-tops-large', 'Large sleeves', 'large-sleeves', 'tops/large-sleeves', 'cat-tops', 30),
  ('cat-tops-sleeveless', 'Sleeveless', 'sleeveless', 'tops/sleeveless', 'cat-tops', 40),
  ('cat-bottoms-denim-skirt', 'Denim skirt', 'denim-skirt', 'bottoms/denim-skirt', 'cat-bottoms', 10),
  ('cat-bottoms-denim-shorts', 'Denim shorts', 'denim-shorts', 'bottoms/denim-shorts', 'cat-bottoms', 20),
  ('cat-bottoms-jeans', 'Jeans', 'jeans', 'bottoms/jeans', 'cat-bottoms', 30),
  ('cat-crop-tops-full', 'Full sleeves', 'full-sleeves', 'crop-tops/full-sleeves', 'cat-crop-tops', 10),
  ('cat-crop-tops-half', 'Half sleeves', 'half-sleeves', 'crop-tops/half-sleeves', 'cat-crop-tops', 20);

INSERT INTO "Category" ("id", "name", "slug", "path", "parentId", "sortOrder") VALUES
  ('cat-skirt-small', 'Small bottoms', 'small-bottoms', 'bottoms/denim-skirt/small-bottoms', 'cat-bottoms-denim-skirt', 10),
  ('cat-skirt-medium', 'Medium bottoms', 'medium-bottoms', 'bottoms/denim-skirt/medium-bottoms', 'cat-bottoms-denim-skirt', 20),
  ('cat-skirt-long', 'Long bottoms', 'long-bottoms', 'bottoms/denim-skirt/long-bottoms', 'cat-bottoms-denim-skirt', 30),
  ('cat-shorts-small', 'Small bottoms', 'small-bottoms', 'bottoms/denim-shorts/small-bottoms', 'cat-bottoms-denim-shorts', 10),
  ('cat-shorts-medium', 'Medium bottoms', 'medium-bottoms', 'bottoms/denim-shorts/medium-bottoms', 'cat-bottoms-denim-shorts', 20),
  ('cat-shorts-long', 'Long bottoms', 'long-bottoms', 'bottoms/denim-shorts/long-bottoms', 'cat-bottoms-denim-shorts', 30),
  ('cat-jeans-small', 'Small bottoms', 'small-bottoms', 'bottoms/jeans/small-bottoms', 'cat-bottoms-jeans', 10),
  ('cat-jeans-medium', 'Medium bottoms', 'medium-bottoms', 'bottoms/jeans/medium-bottoms', 'cat-bottoms-jeans', 20),
  ('cat-jeans-long', 'Long bottoms', 'long-bottoms', 'bottoms/jeans/long-bottoms', 'cat-bottoms-jeans', 30);

ALTER TABLE "Product" ADD COLUMN "categoryId" TEXT;
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Product" SET "categoryId" = CASE
  WHEN UPPER("category") IN ('SHIRT', 'SHIRTS') THEN 'cat-shirt'
  WHEN UPPER("category") IN ('T-SHIRT', 'T-SHIRTS', 'TSHIRT', 'TSHIRTS') THEN 'cat-t-shirt'
  WHEN UPPER("category") = 'TOPS' THEN 'cat-tops'
  WHEN UPPER("category") = 'BOTTOMS' THEN 'cat-bottoms'
  WHEN UPPER("category") IN ('DRESS', 'DRESSES') THEN 'cat-dress'
  WHEN UPPER("category") = 'SWEATER' THEN 'cat-sweater'
  WHEN UPPER("category") = 'SWEATSHIRT' THEN 'cat-sweatshirt'
  WHEN UPPER("category") = 'HOODIE' THEN 'cat-hoodie'
  WHEN UPPER("category") IN ('CROP TOPS', 'CROPTOPS', 'CROP-TOPS') THEN 'cat-crop-tops'
  WHEN UPPER("category") = 'SHRUG' THEN 'cat-shrug'
  WHEN UPPER("category") IN ('JACKET', 'JACKETS', 'OUTERWEAR') THEN 'cat-jackets'
  WHEN UPPER("category") IN ('DENIM JACKET', 'DENIM JACKETS') THEN 'cat-denim-jackets'
  ELSE NULL
END;
