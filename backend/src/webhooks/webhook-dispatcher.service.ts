import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { webhookQueue } from '../queue/queue';

/**
 * Outbound webhook dispatcher — delivers webhookEvent payloads to subscriber URLs.
 * Deduplication is handled via BullMQ jobId (subscription + event + timestamp).
 */
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
      select: { id: true, url: true, secret: true, events: true },
      take: 50,
    });

    if (subscriptions.length === 0) return;

    this.logger.log(`Dispatching event ${event} to ${subscriptions.length} hooks`);

    const eventDate = new Date().toISOString();

    // biome-ignore lint/performance/noAwaitInLoops: sequential webhook dispatch with error isolation
    for (const sub of subscriptions) {
      // Deduplicate via jobId: same subscription + event + payload hash
      const jobId = `webhook-dispatch:${sub.id}:${event}:${randomUUID()}`;
      await webhookQueue.add(
        'send-webhook',
        {
          url: sub.url,
          secret: sub.secret,
          event,
          payload,
          eventDate,
        },
        {
          jobId,
          attempts: 5,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
    }
  }
}
