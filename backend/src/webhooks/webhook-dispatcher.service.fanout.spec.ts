import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { castMock } from '../../test/helpers/cast-mock';
import { partialMatch, stringMatch } from '../../test/helpers/match-instance';

type QueueAddArgs = [name: string, data: Record<string, unknown>, opts: Record<string, unknown>];

const mockWebhookQueueAdd = jest.fn<(...args: unknown[]) => Promise<{ id: string }>>();

jest.mock('../queue/queue', () => ({
  webhookQueue: { add: (...args: unknown[]) => mockWebhookQueueAdd(...args) },
}));

import { WebhookDispatcherService } from './webhook-dispatcher.service';

interface SubscriptionRow {
  id: string;
  url: string;
  secret: string;
  events: string[];
}

interface PrismaShape {
  webhookSubscription: { findMany: jest.Mock };
}

function buildPrisma(rows: SubscriptionRow[]): PrismaShape {
  return {
    webhookSubscription: {
      findMany: jest.fn().mockResolvedValue(rows),
    },
  };
}

function addCallAt(index: number): QueueAddArgs {
  return mockWebhookQueueAdd.mock.calls[index] as unknown as QueueAddArgs;
}

describe('WebhookDispatcherService — fan-out, dedup, retry, isolation', () => {
  beforeEach(() => {
    mockWebhookQueueAdd.mockReset().mockResolvedValue({ id: 'job-1' });
  });

  function makeService(rows: SubscriptionRow[]): {
    service: WebhookDispatcherService;
    prisma: PrismaShape;
  } {
    const prisma = buildPrisma(rows);
    const service = new WebhookDispatcherService(castMock(prisma));
    return { service, prisma };
  }

  describe('subscriber lookup (workspace isolation + event filter)', () => {
    it('only queries active subscriptions for the workspace subscribed to the event, capped at 50', async () => {
      const { service, prisma } = makeService([]);

      await service.dispatch('ws-42', 'order.paid', { orderId: 'o-1' });

      expect(prisma.webhookSubscription.findMany).toHaveBeenCalledWith(
        partialMatch({
          where: partialMatch({
            workspaceId: 'ws-42',
            isActive: true,
            events: { has: 'order.paid' },
          }),
          take: 50,
        }),
      );
    });

    it('is a no-op when no subscription matches — never touches the queue', async () => {
      const { service } = makeService([]);

      await service.dispatch('ws-1', 'order.paid', { orderId: 'o-1' });

      expect(mockWebhookQueueAdd).not.toHaveBeenCalled();
    });
  });

  describe('event fan-out to multiple subscribers', () => {
    it('enqueues one job per matching subscription with that subscription url/secret', async () => {
      const { service } = makeService([
        { id: 'sub-a', url: 'https://a.example/hook', secret: 'sa', events: ['order.paid'] },
        { id: 'sub-b', url: 'https://b.example/hook', secret: 'sb', events: ['order.paid'] },
        { id: 'sub-c', url: 'https://c.example/hook', secret: 'sc', events: ['order.paid'] },
      ]);

      await service.dispatch('ws-1', 'order.paid', { orderId: 'o-9' });

      expect(mockWebhookQueueAdd).toHaveBeenCalledTimes(3);

      const targets = mockWebhookQueueAdd.mock.calls.map((call) => {
        const data = (call as unknown as QueueAddArgs)[1];
        return { url: data.url, secret: data.secret };
      });
      expect(targets).toEqual([
        { url: 'https://a.example/hook', secret: 'sa' },
        { url: 'https://b.example/hook', secret: 'sb' },
        { url: 'https://c.example/hook', secret: 'sc' },
      ]);
    });

    it('forwards the exact event name and payload unchanged to every job', async () => {
      const { service } = makeService([
        { id: 'sub-a', url: 'https://a.example/hook', secret: 'sa', events: ['lead.created'] },
        { id: 'sub-b', url: 'https://b.example/hook', secret: 'sb', events: ['lead.created'] },
      ]);
      const payload = { leadId: 'lead-7', nested: { amountCents: 12345n } };

      await service.dispatch('ws-1', 'lead.created', payload);

      for (let i = 0; i < 2; i++) {
        const [name, data] = addCallAt(i);
        expect(name).toBe('send-webhook');
        expect(data.event).toBe('lead.created');
        // Same payload reference forwarded — no mutation/cloning that drops fields.
        expect(data.payload).toBe(payload);
      }
    });

    it('stamps a single shared eventDate ISO timestamp across all jobs of one dispatch', async () => {
      const { service } = makeService([
        { id: 'sub-a', url: 'https://a.example/hook', secret: 'sa', events: ['x'] },
        { id: 'sub-b', url: 'https://b.example/hook', secret: 'sb', events: ['x'] },
      ]);

      await service.dispatch('ws-1', 'x', {});

      const dateA = addCallAt(0)[1].eventDate as string;
      const dateB = addCallAt(1)[1].eventDate as string;
      expect(dateA).toEqual(stringMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/));
      expect(dateA).toBe(dateB);
    });
  });

  describe('idempotency / dedup via jobId', () => {
    it('scopes the BullMQ jobId to subscription + event so cross-subscriber jobs never collide', async () => {
      const { service } = makeService([
        { id: 'sub-a', url: 'https://a.example/hook', secret: 'sa', events: ['order.paid'] },
        { id: 'sub-b', url: 'https://b.example/hook', secret: 'sb', events: ['order.paid'] },
      ]);

      await service.dispatch('ws-1', 'order.paid', { orderId: 'o-1' });

      const jobIdA = addCallAt(0)[2].jobId as string;
      const jobIdB = addCallAt(1)[2].jobId as string;

      expect(jobIdA).toEqual(stringMatch(/^webhook-dispatch:sub-a:order\.paid:/));
      expect(jobIdB).toEqual(stringMatch(/^webhook-dispatch:sub-b:order\.paid:/));
      expect(jobIdA).not.toBe(jobIdB);
    });

    it('produces a distinct jobId per dispatch invocation (BullMQ collapses true duplicates by jobId)', async () => {
      const { service } = makeService([
        { id: 'sub-a', url: 'https://a.example/hook', secret: 'sa', events: ['order.paid'] },
      ]);

      await service.dispatch('ws-1', 'order.paid', { orderId: 'o-1' });
      await service.dispatch('ws-1', 'order.paid', { orderId: 'o-1' });

      const firstJobId = addCallAt(0)[2].jobId as string;
      const secondJobId = addCallAt(1)[2].jobId as string;
      expect(firstJobId).not.toBe(secondJobId);
      expect(firstJobId).toEqual(stringMatch(/^webhook-dispatch:sub-a:order\.paid:/));
      expect(secondJobId).toEqual(stringMatch(/^webhook-dispatch:sub-a:order\.paid:/));
    });
  });

  describe('retry / backoff policy', () => {
    it('configures 5 attempts with exponential 5s backoff on every job', async () => {
      const { service } = makeService([
        { id: 'sub-a', url: 'https://a.example/hook', secret: 'sa', events: ['order.paid'] },
        { id: 'sub-b', url: 'https://b.example/hook', secret: 'sb', events: ['order.paid'] },
      ]);

      await service.dispatch('ws-1', 'order.paid', {});

      for (let i = 0; i < 2; i++) {
        const opts = addCallAt(i)[2];
        expect(opts).toEqual(
          partialMatch({
            attempts: 5,
            backoff: { type: 'exponential', delay: 5000 },
          }),
        );
      }
    });
  });

  describe('failure propagation (honest behavior)', () => {
    it('propagates a queue.add rejection and stops before enqueuing later subscribers (sequential, no swallow)', async () => {
      const { service } = makeService([
        { id: 'sub-a', url: 'https://a.example/hook', secret: 'sa', events: ['order.paid'] },
        { id: 'sub-b', url: 'https://b.example/hook', secret: 'sb', events: ['order.paid'] },
      ]);
      // First subscriber's enqueue fails; subsequent calls would succeed.
      mockWebhookQueueAdd
        .mockReset()
        .mockRejectedValueOnce(new Error('redis unavailable'))
        .mockResolvedValue({ id: 'job-2' });

      await expect(service.dispatch('ws-1', 'order.paid', {})).rejects.toThrow('redis unavailable');

      // Sequential delivery means sub-b was never reached after sub-a threw.
      expect(mockWebhookQueueAdd).toHaveBeenCalledTimes(1);
      expect(addCallAt(0)[2].jobId).toEqual(stringMatch(/^webhook-dispatch:sub-a:/));
    });
  });
});
