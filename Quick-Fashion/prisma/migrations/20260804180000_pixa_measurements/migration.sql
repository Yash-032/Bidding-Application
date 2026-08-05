ALTER TABLE "User" ADD COLUMN "pixaSubjectId" TEXT;
CREATE TABLE "Measurement" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "pixaUpdatedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE', "unit" TEXT NOT NULL DEFAULT 'CM',
  "shoulderWidth" DOUBLE PRECISION, "chest" DOUBLE PRECISION, "waist" DOUBLE PRECISION, "hip" DOUBLE PRECISION,
  "neck" DOUBLE PRECISION, "sleeveLength" DOUBLE PRECISION, "armLength" DOUBLE PRECISION, "thigh" DOUBLE PRECISION, "calf" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Measurement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_pixaSubjectId_key" ON "User"("pixaSubjectId");
CREATE UNIQUE INDEX "Measurement_userId_key" ON "Measurement"("userId");
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;