import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { forEachSequential } from '../common/async-sequence';
import { getCorrelationId } from '../common/observability/correlation-store';
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

  /** Dispatch. */
  async dispatch(workspaceId: string, event: string, payload: unknown) {
    const subscriptions = await this.prisma.webhookSubscription.findMany({
      where: {
        workspaceId,
        isActive: true,
        events: { has: event },
      },
      select: { id: true, url: true, secret: true, events: true },
      take: 50,
    });

    if (subscriptions.length === 0) {
      return;
    }

    this.logger.log(`Dispatching event ${event} to ${subscriptions.length} hooks`);

    const eventDate = new Date().toISOString();
    const correlationId = getCorrelationId();

    await forEachSequential(subscriptions, async (sub) => {
      // Deduplicate via deterministic jobId: same subscription + event +
      // payload hash. A stable key lets BullMQ collapse retries/replays of an
      // identical delivery into a single job instead of enqueuing duplicates
      // (a random UUID here would defeat dedup entirely).
      const payloadHash = createHash('sha256')
        .update(
          // BigInt-safe serialization: money fields are bigint in this codebase
          // and JSON.stringify throws on BigInt by default.
          JSON.stringify({ event, payload }, (_key: string, value: unknown) =>
            typeof value === 'bigint' ? `${value}n` : value,
          ),
        )
        .digest('hex')
        .slice(0, 32);
      const jobId = `webhook-dispatch:${sub.id}:${event}:${payloadHash}`;
      await webhookQueue.add(
        'send-webhook',
        {
          url: sub.url,
          secret: sub.secret,
          event,
          payload,
          eventDate,
          correlationId,
        },
        {
          jobId,
          attempts: 5,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
    });
  }
}
