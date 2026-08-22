import { NextRequest, NextResponse } from 'next/server';
import { requireSessionClaims } from '@/lib/auth/session';
import { FriendshipService } from '@/lib/social/friendship.service';
import { toErrorResponse } from '@/lib/utils/errors';

const friendships = new FriendshipService();

export async function GET(request: NextRequest) {
  try {
    const user = requireSessionClaims(request);
    return NextResponse.json({ friends: await friendships.listFriends(user.id) });
  } catch (error) { const { body, status } = toErrorResponse(error); return NextResponse.json(body, { status }); }
}