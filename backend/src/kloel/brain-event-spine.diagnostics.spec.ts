import { BrainEventSpineService } from './brain-event-spine.service';
import type {
  CampaignEventPayload,
  CommercialEventPayload,
  ConceptEventPayload,
  LeadEventPayload,
  ProductEventPayload,
} from './brain-event-taxonomy';

describe('BrainEventSpineService diagnostics', () => {
  let prisma: {
    autopilotEvent: { create: jest.Mock };
    mindOutboxEvent: {
      count: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
      upsert: jest.Mock;
    };
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let service: BrainEventSpineService;

  beforeEach(() => {
    prisma = {
      autopilotEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-1' }),
      },
      mindOutboxEvent: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    service = new BrainEventSpineService(prisma as never);
  });

  describe('markDispatchFailed', () => {
    it('marks an acknowledged outbox event as dispatched', async () => {
      prisma.mindOutboxEvent.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.markDispatchSucceeded('outbox-1', 'ws-1');

      expect(prisma.mindOutboxEvent.updateMany).toHaveBeenCalledWith({
        where: { id: 'outbox-1', workspaceId: 'ws-1', status: 'processing' },
        data: {
          status: 'dispatched',
          dispatchedAt: expect.objectContaining({}),
          lastError: null,
        },
      });
      const call = prisma.mindOutboxEvent.updateMany.mock.calls[0][0];
      expect(call.data.dispatchedAt).toBeInstanceOf(Date);
    });

    it('marks an in-flight outbox event as failed with error', async () => {
      prisma.mindOutboxEvent.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.markDispatchFailed('outbox-1', 'ws-1', 'connection refused');

      expect(prisma.mindOutboxEvent.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'outbox-1',
          workspaceId: 'ws-1',
          status: { in: ['processing', 'dispatched'] },
        },
        data: {
          status: 'failed',
          lastError: 'connection refused',
          dispatchedAt: null,
        },
      });
    });
  });

  describe('readReplayEvents', () => {
    it('reads dispatched and pending events ordered by occurredAt', async () => {
      prisma.mindOutboxEvent.findMany.mockResolvedValueOnce([
        {
          id: 'outbox-1',
          eventType: 'sale.created',
          subject: 'lead:lead-1',
          payload: {},
          idempotencyKey: 'ik-1',
          occurredAt: new Date('2026-05-01T10:00:00Z'),
          status: 'dispatched',
        },
      ]);

      const result = await service.readReplayEvents({ workspaceId: 'ws-1', limit: 10 });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].id).toBe('outbox-1');
      expect(result.events[0].status).toBe('dispatched');
    });

    it('filters by eventTypes when provided', async () => {
      prisma.mindOutboxEvent.findMany.mockResolvedValueOnce([]);

      await service.readReplayEvents({
        workspaceId: 'ws-1',
        eventTypes: ['sale.created', 'sale.completed'],
        since: new Date('2026-05-01'),
      });

      expect(prisma.mindOutboxEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            eventType: { in: ['sale.created', 'sale.completed'] },
          }),
        }),
      );
    });
  });

  describe('readPendingEvents', () => {
    it('returns pending outbox events with attempts tracking', async () => {
      prisma.mindOutboxEvent.findMany.mockResolvedValueOnce([
        {
          id: 'outbox-1',
          eventType: 'checkout.created',
          subject: 'order:order-1',
          idempotencyKey: 'ik-1',
          occurredAt: new Date(),
          attempts: 2,
          lastError: 'timeout',
        },
      ]);

      const result = await service.readPendingEvents('ws-1');

      expect(result.events).toHaveLength(1);
      expect(result.events[0].attempts).toBe(2);
      expect(result.events[0].lastError).toBe('timeout');
    });
  });

  describe('getOutboxStatus', () => {
    it('returns aggregate counts for pending, dispatched, failed, and total', async () => {
      prisma.mindOutboxEvent.count
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(15);

      const status = await service.getOutboxStatus('ws-1');

      expect(status).toEqual({ pending: 3, dispatched: 10, failed: 2, total: 15 });
    });
  });

  describe('intent resolution', () => {
    it('maps lead events to lead_lifecycle intent', async () => {
      const event: LeadEventPayload = {
        occurredAt: new Date(),
        workspaceId: 'ws-1',
        subject: 'lead:lead-1',
        eventType: 'lead.qualified',
        payload: { leadId: 'lead-1', source: 'whatsapp' },
      };

      await service.recordCommercial(event);

      expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            intent: 'lead_lifecycle',
            action: 'lead.qualified',
          }),
        }),
      );
    });

    it('maps campaign events to campaign_lifecycle intent', async () => {
      const event: CampaignEventPayload = {
        occurredAt: new Date(),
        workspaceId: 'ws-1',
        subject: 'campaign:camp-1',
        eventType: 'campaign.sent',
        payload: { campaignId: 'camp-1', recipientCount: 500 },
      };

      await service.recordCommercial(event);

      expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            intent: 'campaign_lifecycle',
          }),
        }),
      );
    });

    it('maps product events to product_lifecycle intent', async () => {
      const event: ProductEventPayload = {
        occurredAt: new Date(),
        workspaceId: 'ws-1',
        subject: 'product:prod-1',
        eventType: 'product.created',
        payload: { productId: 'prod-1', name: 'Curso', priceInCents: 14700 },
      };

      await service.recordCommercial(event);

      expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            intent: 'product_lifecycle',
          }),
        }),
      );
    });

    it('maps concept events to concept_lifecycle intent', async () => {
      const event: ConceptEventPayload = {
        occurredAt: new Date(),
        workspaceId: 'ws-1',
        subject: 'msg:msg-1',
        eventType: 'concept.detected',
        payload: { concept: 'buying_intent', confidence: 0.92, evidence: 'user asked price' },
      };

      await service.recordCommercial(event);

      expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            intent: 'concept_lifecycle',
          }),
        }),
      );
    });
  });

  describe('status resolution', () => {
    it('maps channel.externally_blocked to error status', async () => {
      prisma.autopilotEvent.create.mockResolvedValue({ id: 'ev-1' });

      const event: CommercialEventPayload = {
        occurredAt: new Date(),
        workspaceId: 'ws-1',
        subject: 'channel:ch-1',
        eventType: 'channel.externally_blocked',
        payload: { channelId: 'ch-1', channelType: 'whatsapp', reason: 'policy violation' },
      };

      await service.recordCommercial(event);

      expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'error',
          }),
        }),
      );
    });

    it('maps channel.disconnected to skipped status', async () => {
      const event: CommercialEventPayload = {
        occurredAt: new Date(),
        workspaceId: 'ws-1',
        subject: 'channel:ch-1',
        eventType: 'channel.disconnected',
        payload: { channelId: 'ch-1', channelType: 'whatsapp' },
      };

      await service.recordCommercial(event);

      expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'skipped',
          }),
        }),
      );
    });
  });
});
