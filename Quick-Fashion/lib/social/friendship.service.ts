import { FriendShipStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/utils/errors';

const friendUserSelect = {
  id: true,
  profile: { select: { fullName: true, location: true } },
} satisfies Prisma.UserSelect;

type Tx = Prisma.TransactionClient;
type FriendshipWithUsers = Prisma.FriendShipGetPayload<{
  include: { requester: { select: typeof friendUserSelect }; addressee: { select: typeof friendUserSelect } };
}>;

function asFriendshipView(friendship: FriendshipWithUsers, viewerId: string) {
  const friend = friendship.requesterId === viewerId ? friendship.addressee : friendship.requester;
  return {
    id: friendship.id,
    status: friendship.status,
    createdAt: friendship.createdAt,
    respondedAt: friendship.respondedAt,
    friend: { id: friend.id, fullName: friend.profile?.fullName ?? null, location: friend.profile?.location ?? null },
  };
}

export class FriendshipService {
  private readonly withUsers = {
    requester: { select: friendUserSelect },
    addressee: { select: friendUserSelect },
  } satisfies Prisma.FriendShipInclude;

  private assertDifferentUsers(actorId: string, targetUserId: string) {
    if (!targetUserId || actorId === targetUserId) throw new ValidationError('You cannot send a friend request to yourself');
  }

  private async ensureUserExists(tx: Tx, userId: string) {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundError('User not found');
  }

  async sendRequestToEmail(requesterId: string, email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) throw new ValidationError('A valid recipient email is required');
    const recipient = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
    if (!recipient) throw new NotFoundError('No Quick Fashion account exists for that email');
    return this.sendRequest(requesterId, recipient.id);
  }
  /** Creates a request; a crossed pending request is accepted rather than duplicated. */
  async sendRequest(requesterId: string, addresseeId: string) {
    this.assertDifferentUsers(requesterId, addresseeId);
    return prisma.$transaction(async (tx) => {
      await this.ensureUserExists(tx, addresseeId);
      const [direct, inverse] = await Promise.all([
        tx.friendShip.findUnique({ where: { requesterId_addresseeId: { requesterId, addresseeId } } }),
        tx.friendShip.findUnique({ where: { requesterId_addresseeId: { requesterId: addresseeId, addresseeId: requesterId } } }),
      ]);

      if (direct?.status === FriendShipStatus.ACCEPTED || inverse?.status === FriendShipStatus.ACCEPTED) throw new ConflictError('You are already friends');
      if (direct?.status === FriendShipStatus.BLOCKED || inverse?.status === FriendShipStatus.BLOCKED) throw new ForbiddenError('This connection is unavailable');
      if (inverse?.status === FriendShipStatus.PENDING) {
        return tx.friendShip.update({ where: { id: inverse.id }, data: { status: FriendShipStatus.ACCEPTED, respondedAt: new Date() }, include: this.withUsers });
      }
      if (direct?.status === FriendShipStatus.PENDING) throw new ConflictError('Friend request is already pending');
      if (direct) {
        return tx.friendShip.update({ where: { id: direct.id }, data: { status: FriendShipStatus.PENDING, respondedAt: null }, include: this.withUsers });
      }
      return tx.friendShip.create({ data: { requesterId, addresseeId }, include: this.withUsers });
    }).then((friendship) => asFriendshipView(friendship, requesterId));
  }

  async acceptRequest(userId: string, friendshipId: string) {
    const updated = await prisma.friendShip.updateMany({
      where: { id: friendshipId, addresseeId: userId, status: FriendShipStatus.PENDING },
      data: { status: FriendShipStatus.ACCEPTED, respondedAt: new Date() },
    });
    if (!updated.count) throw new NotFoundError('Pending friend request not found');
    return this.getByIdForUser(userId, friendshipId);
  }

  async declineRequest(userId: string, friendshipId: string) {
    const updated = await prisma.friendShip.updateMany({
      where: { id: friendshipId, addresseeId: userId, status: FriendShipStatus.PENDING },
      data: { status: FriendShipStatus.DECLINED, respondedAt: new Date() },
    });
    if (!updated.count) throw new NotFoundError('Pending friend request not found');
  }

  async cancelRequest(userId: string, friendshipId: string) {
    const deleted = await prisma.friendShip.deleteMany({ where: { id: friendshipId, requesterId: userId, status: FriendShipStatus.PENDING } });
    if (!deleted.count) throw new NotFoundError('Pending friend request not found');
  }

  async removeFriend(userId: string, friendshipId: string) {
    const deleted = await prisma.friendShip.deleteMany({
      where: { id: friendshipId, status: FriendShipStatus.ACCEPTED, OR: [{ requesterId: userId }, { addresseeId: userId }] },
    });
    if (!deleted.count) throw new NotFoundError('Friendship not found');
  }

  async blockUser(userId: string, targetUserId: string) {
    this.assertDifferentUsers(userId, targetUserId);
    return prisma.$transaction(async (tx) => {
      await this.ensureUserExists(tx, targetUserId);
      const existing = await tx.friendShip.findFirst({ where: { OR: [{ requesterId: userId, addresseeId: targetUserId }, { requesterId: targetUserId, addresseeId: userId }] } });
      if (existing) return tx.friendShip.update({ where: { id: existing.id }, data: { status: FriendShipStatus.BLOCKED, respondedAt: new Date() } });
      return tx.friendShip.create({ data: { requesterId: userId, addresseeId: targetUserId, status: FriendShipStatus.BLOCKED, respondedAt: new Date() } });
    });
  }

  async listFriends(userId: string) {
    const friendships = await prisma.friendShip.findMany({
      where: { status: FriendShipStatus.ACCEPTED, OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: this.withUsers,
      orderBy: { updatedAt: 'desc' },
    });
    return friendships.map((friendship) => asFriendshipView(friendship, userId));
  }

  async listPendingRequests(userId: string) {
    const [incoming, outgoing] = await Promise.all([
      prisma.friendShip.findMany({ where: { addresseeId: userId, status: FriendShipStatus.PENDING }, include: this.withUsers, orderBy: { createdAt: 'desc' } }),
      prisma.friendShip.findMany({ where: { requesterId: userId, status: FriendShipStatus.PENDING }, include: this.withUsers, orderBy: { createdAt: 'desc' } }),
    ]);
    return { incoming: incoming.map((friendship) => asFriendshipView(friendship, userId)), outgoing: outgoing.map((friendship) => asFriendshipView(friendship, userId)) };
  }

  private async getByIdForUser(userId: string, friendshipId: string) {
    const friendship = await prisma.friendShip.findFirst({ where: { id: friendshipId, OR: [{ requesterId: userId }, { addresseeId: userId }] }, include: this.withUsers });
    if (!friendship) throw new NotFoundError('Friendship not found');
    return asFriendshipView(friendship, userId);
  }
}