import { Prisma } from '@prisma/client';

export const publicBidUserSelect = {
  id: true,
  email: true,
  role: true,
  profile: { select: { fullName: true } },
} satisfies Prisma.UserSelect;

export type BidWithPublicUser = Prisma.BidGetPayload<{
  include: { user: { select: typeof publicBidUserSelect } };
}>;

export function serializeBid(bid: BidWithPublicUser) {
  return {
    id: bid.id,
    auctionId: bid.auctionId,
    user: bid.user,
    amountCredits: bid.amountCredits.toString(),
    status: bid.status,
    idempotencyKey: bid.idempotencyKey,
    createdAt: bid.createdAt.toISOString(),
  };
}
