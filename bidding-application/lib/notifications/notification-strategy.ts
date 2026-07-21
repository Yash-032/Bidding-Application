import { NotificationType, Prisma } from '@prisma/client';

export interface NotificationPayload {
    userId: string;
    type: NotificationType;
    data: Prisma.InputJsonObject;
}

export interface NotificationStrategy {
    send(payload: NotificationPayload): Promise<void>;
}