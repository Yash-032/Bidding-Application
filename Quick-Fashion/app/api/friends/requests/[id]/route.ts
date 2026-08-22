import { NextRequest, NextResponse } from 'next/server';
import { requireSessionClaims } from '@/lib/auth/session';
import { FriendshipService } from '@/lib/social/friendship.service';
import { toErrorResponse, ValidationError } from '@/lib/utils/errors';

const friendships = new FriendshipService();
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const user = requireSessionClaims(request); const { id } = await params; const { action } = await request.json();
    if (action === 'ACCEPT') return NextResponse.json({ friendship: await friendships.acceptRequest(user.id, id) });
    if (action === 'DECLINE') { await friendships.declineRequest(user.id, id); return NextResponse.json({ declined: true }); }
    throw new ValidationError('action must be ACCEPT or DECLINE');
  } catch (error) { const { body, status } = toErrorResponse(error); return NextResponse.json(body, { status }); }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  try { const user = requireSessionClaims(request); const { id } = await params; await friendships.cancelRequest(user.id, id); return NextResponse.json({ cancelled: true }); }
  catch (error) { const { body, status } = toErrorResponse(error); return NextResponse.json(body, { status }); }
}