import { prisma } from '@/lib/prisma';
import { NotificationStrategy, NotificationPayload } from '../notification-strategy';

export class InAppNotificationStrategy implements NotificationStrategy {
    async send(payload: NotificationPayload): Promise<void> {
        await prisma.notification.create({
            data: {
                userId: payload.userId,
                type: payload.type,
                channel: 'IN_APP',
                payload: payload.data,
            },
        });
    }
    // Need to implement actual in-app notification logic here - maybe OneSignal 
}

export class EmailNotificationStrategy implements NotificationStrategy {
    async send(payload: NotificationPayload): Promise<void> {
        await prisma.notification.create({
            data: {
                userId: payload.userId,
                type: payload.type,
                channel: 'EMAIL',
                payload: payload.data,
            },
        });
    }
    // Need to implement actual email sending logic here - maybe using a service like SendGrid 
}