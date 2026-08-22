import { NextRequest, NextResponse } from 'next/server';
import { requireSessionClaims } from '@/lib/auth/session';
import { FriendshipService } from '@/lib/social/friendship.service';
import { toErrorResponse, ValidationError } from '@/lib/utils/errors';

const friendships = new FriendshipService();

export async function GET(request: NextRequest) {
  try { const user = requireSessionClaims(request); return NextResponse.json(await friendships.listPendingRequests(user.id)); }
  catch (error) { const { body, status } = toErrorResponse(error); return NextResponse.json(body, { status }); }
}

export async function POST(request: NextRequest) {
  try {
    const user = requireSessionClaims(request); const body = await request.json();
    if (typeof body.email !== 'string') throw new ValidationError('email is required');
    const requestView = await friendships.sendRequestToEmail(user.id, body.email);
    return NextResponse.json({ request: requestView }, { status: 201 });
  } catch (error) { const { body, status } = toErrorResponse(error); return NextResponse.json(body, { status }); }
}