import { prisma } from '@/lib/prisma';

export class NotificationService {
    async listForUser(userId: string, unreadOnly: boolean = false) {
        return prisma.notification.findMany({
            where: { userId, ...(unreadOnly ? { isRead: false } : {}) },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
    }

    async markRead(userId: string, notificationId: string) {
        return prisma.notification.updateMany({
            where: { id: notificationId, userId },
            data: { isRead: true },
        });
    }
}