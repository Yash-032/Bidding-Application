-- Personal store onboarding: profile attributes, extended measurements, private photo references, and OTP verification.
CREATE TYPE "PersonalSpacePhotoKind" AS ENUM ('SELFIE', 'FRONT', 'LEFT', 'RIGHT', 'BACK');

ALTER TABLE "UserProfile"
  ADD COLUMN "location" TEXT,
  ADD COLUMN "age" INTEGER;

ALTER TABLE "Measurement"
  ADD COLUMN "heightCm" DOUBLE PRECISION,
  ADD COLUMN "weightKg" DOUBLE PRECISION,
  ADD COLUMN "legLengthCm" DOUBLE PRECISION,
  ADD COLUMN "shoulderDepth" DOUBLE PRECISION;

CREATE TABLE "PersonalSpacePhoto" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "PersonalSpacePhotoKind" NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "originalKey" TEXT NOT NULL,
  "variants" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonalSpacePhoto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailOtp" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailOtp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PersonalSpacePhoto_originalKey_key" ON "PersonalSpacePhoto"("originalKey");
CREATE UNIQUE INDEX "PersonalSpacePhoto_userId_kind_key" ON "PersonalSpacePhoto"("userId", "kind");
CREATE INDEX "PersonalSpacePhoto_userId_idx" ON "PersonalSpacePhoto"("userId");
CREATE INDEX "EmailOtp_userId_expiresAt_idx" ON "EmailOtp"("userId", "expiresAt");

ALTER TABLE "PersonalSpacePhoto" ADD CONSTRAINT "PersonalSpacePhoto_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailOtp" ADD CONSTRAINT "EmailOtp_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;