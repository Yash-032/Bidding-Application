import { NotificationChannel } from '@prisma/client';
import { NotificationStrategy } from './notification-strategy';
import { InAppNotificationStrategy, EmailNotificationStrategy } from './strategies';

export class NotificationStrategyFactory {
    private static strategies: Partial<Record<NotificationChannel, NotificationStrategy>> = {
        IN_APP: new InAppNotificationStrategy(),
        EMAIL: new EmailNotificationStrategy(),
    };

    static resolve(channel: NotificationChannel): NotificationStrategy {
        const strategy = this.strategies[channel];
        if (!strategy) throw new Error(`No NotificationStrategy implemented for channel: ${channel}`);
        return strategy;
    }
}
