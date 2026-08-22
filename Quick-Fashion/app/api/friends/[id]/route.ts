import { NextRequest, NextResponse } from 'next/server';
import { requireSessionClaims } from '@/lib/auth/session';
import { FriendshipService } from '@/lib/social/friendship.service';
import { toErrorResponse } from '@/lib/utils/errors';

const friendships = new FriendshipService();
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const user = requireSessionClaims(request); const { id } = await params; await friendships.removeFriend(user.id, id); return NextResponse.json({ removed: true }); }
  catch (error) { const { body, status } = toErrorResponse(error); return NextResponse.json(body, { status }); }
}