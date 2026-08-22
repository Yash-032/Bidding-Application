import { NextRequest, NextResponse } from 'next/server';
import { requireSessionClaims } from '@/lib/auth/session';
import { FriendshipService } from '@/lib/social/friendship.service';
import { toErrorResponse, ValidationError } from '@/lib/utils/errors';

const friendships = new FriendshipService();

export async function POST(request: NextRequest) {
  try { const user = requireSessionClaims(request); const { userId } = await request.json(); if (typeof userId !== 'string') throw new ValidationError('userId is required'); await friendships.blockUser(user.id, userId); return NextResponse.json({ blocked: true }); }
  catch (error) { const { body, status } = toErrorResponse(error); return NextResponse.json(body, { status }); }
}