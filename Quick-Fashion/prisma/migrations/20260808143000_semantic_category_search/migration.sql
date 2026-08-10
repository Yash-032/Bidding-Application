-- Semantic search resolves garment intent against the live category taxonomy.
-- Trigram indexes keep category lookup and category typo correction responsive
-- as merchants add more categories.
CREATE INDEX IF NOT EXISTS "Category_name_trgm_idx"
  ON "Category" USING gin ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Category_path_trgm_idx"
  ON "Category" USING gin ("path" gin_trgm_ops);
