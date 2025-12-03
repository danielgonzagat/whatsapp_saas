import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { webhookQueue } from '../queue/queue';

@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);

  constructor(private prisma: PrismaService) {}

  async dispatch(workspaceId: string, event: string, payload: any) {
    const subscriptions = await this.prisma.webhookSubscription.findMany({
      where: {
        workspaceId,
        isActive: true,
        events: { has: event },
      },
    });

    if (subscriptions.length === 0) return;

    this.logger.log(
      `Dispatching event ${event} to ${subscriptions.length} hooks`,
    );

    for (const sub of subscriptions) {
      // Async Dispatch via BullMQ (Reliable)
      await webhookQueue.add('send-webhook', {
        url: sub.url,
        secret: sub.secret,
        event,
        payload
      }, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 }
      });
    }
  }
}
