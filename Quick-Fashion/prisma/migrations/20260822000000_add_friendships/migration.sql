DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FriendShipStatus') THEN
    CREATE TYPE "FriendShipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "FriendShip" (
  "id" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "addresseeId" TEXT NOT NULL,
  "status" "FriendShipStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FriendShip_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FriendShip_requesterId_addresseeId_key" ON "FriendShip"("requesterId", "addresseeId");
CREATE INDEX IF NOT EXISTS "FriendShip_requesterId_status_idx" ON "FriendShip"("requesterId", "status");
CREATE INDEX IF NOT EXISTS "FriendShip_addresseeId_status_idx" ON "FriendShip"("addresseeId", "status");
CREATE INDEX IF NOT EXISTS "FriendShip_status_updatedAt_idx" ON "FriendShip"("status", "updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FriendShip_requesterId_fkey') THEN
    ALTER TABLE "FriendShip" ADD CONSTRAINT "FriendShip_requesterId_fkey"
      FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FriendShip_addresseeId_fkey') THEN
    ALTER TABLE "FriendShip" ADD CONSTRAINT "FriendShip_addresseeId_fkey"
      FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;