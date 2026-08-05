CREATE TABLE "PixaConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "refreshTokenCiphertext" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PixaConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PixaConnection_userId_key" ON "PixaConnection"("userId");
ALTER TABLE "PixaConnection" ADD CONSTRAINT "PixaConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;