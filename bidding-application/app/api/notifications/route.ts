import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/auth/session';
import { NotificationService } from '@/lib/notifications/notification.service';
import { toErrorResponse } from '@/lib/utils/errors';

const notificationService = new NotificationService();

export async function GET(req: NextRequest) {
    try {
        const user = await requireSessionUser(req);
        const { searchParams } = new URL(req.url);
        const unreadOnly = searchParams.get('unreadOnly') === 'true';

        const notifications = await notificationService.listForUser(user.id, unreadOnly);
        
        return NextResponse.json({ notifications });

    } catch(err) {
        const { body, status } = toErrorResponse(err);
        return NextResponse.json(body, { status });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const user = await requireSessionUser(req);
        const { notificationId } = await req.json();

        if(!notificationId) {
            return NextResponse.json({ error: 'notificationId is required' }, { status: 400 });
        }

        await notificationService.markRead(user.id, notificationId);
        
        return NextResponse.json({ read: true });
    
    } catch(err) {
        const { body, status } = toErrorResponse(err);
        return NextResponse.json(body, { status });
    }
}