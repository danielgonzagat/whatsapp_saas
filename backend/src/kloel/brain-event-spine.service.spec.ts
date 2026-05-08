import { BrainEventSpineService } from './brain-event-spine.service';
import type {
  CampaignEventPayload,
  CheckoutEventPayload,
  CommercialEventPayload,
  ConceptEventPayload,
  LeadEventPayload,
  MessageEventPayload,
  ProductEventPayload,
  SaleEventPayload,
} from './brain-event-taxonomy';

describe('BrainEventSpineService', () => {
  let prisma: {
    autopilotEvent: { create: jest.Mock };
    mindOutboxEvent: {
      count: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
      upsert: jest.Mock;
    };
    $queryRaw: jest.Mock;
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
    };
    service = new BrainEventSpineService(prisma as never);
  });

  describe('recordCommercial', () => {
    it('records a sale.created event with typed payload, workspaceId, and timestamp', async () => {
      const occurredAt = new Date('2026-05-07T12:00:00Z');
      const event: SaleEventPayload = {
        occurredAt,
        workspaceId: 'ws-1',
        subject: 'lead:lead-1',
        eventType: 'sale.created',
        contactId: 'contact-1',
        payload: {
          amount: 147,
          externalPaymentId: 'pi_abc123',
          leadId: 'lead-1',
          paymentMethod: 'PIX',
          productName: 'Curso Pro',
          status: 'pending',
        },
      };

      const id = await service.recordCommercial(event);

      expect(id).toBe('event-1');
      expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'ws-1',
            contactId: 'contact-1',
            intent: 'sale_lifecycle',
            action: 'sale.created',
            status: 'executed',
            meta: expect.objectContaining({
              commercial: true,
              subject: 'lead:lead-1',
              occurredAt: '2026-05-07T12:00:00.000Z',
              idempotencyKey: 'sale.created:lead:lead-1:2026-05-07T12:00:00.000Z',
              payload: expect.objectContaining({
                amount: 147,
                externalPaymentId: 'pi_abc123',
                paymentMethod: 'PIX',
                status: 'pending',
              }),
            }),
          }),
        }),
      );
    });

    it('records a sale.completed event with executed status', async () => {
      const event: SaleEventPayload = {
        occurredAt: new Date(),
        workspaceId: 'ws-1',
        subject: 'lead:lead-1',
        eventType: 'sale.completed',
        payload: {
          amount: 147,
          leadId: 'lead-1',
          paymentMethod: 'PIX',
          status: 'paid',
        },
      };

      await service.recordCommercial(event);

      expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'sale.completed',
            intent: 'sale_lifecycle',
            status: 'executed',
          }),
        }),
      );
    });

    it('records a sale.refunded event with skipped status', async () => {
      const event: SaleEventPayload = {
        occurredAt: new Date(),
        workspaceId: 'ws-1',
        subject: 'lead:lead-1',
        eventType: 'sale.refunded',
        payload: {
          amount: 147,
          leadId: 'lead-1',
          status: 'refunded',
        },
      };

      await service.recordCommercial(event);

      expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'sale.refunded',
            status: 'skipped',
          }),
        }),
      );
    });

    it('records a message.sent event with message_lifecycle intent', async () => {
      const event: MessageEventPayload = {
        occurredAt: new Date(),
        workspaceId: 'ws-1',
        subject: 'contact:contact-1',
        eventType: 'message.sent',
        contactId: 'contact-1',
        payload: {
          contentPreview: 'Ola, seu pedido foi confirmado',
          direction: 'OUTBOUND',
          messageId: 'msg-1',
          messageType: 'TEXT',
          channel: 'whatsapp',
        },
      };

      await service.recordCommercial(event);

      expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'message.sent',
            intent: 'message_lifecycle',
            status: 'executed',
          }),
        }),
      );
    });

    it('records a message.received event with correct contactId and payload', async () => {
      const event: MessageEventPayload = {
        occurredAt: new Date(),
        workspaceId: 'ws-1',
        subject: 'contact:contact-1',
        eventType: 'message.received',
        contactId: 'contact-1',
        payload: {
          contentPreview: 'Quero comprar',
          direction: 'INBOUND',
          messageId: 'msg-2',
          messageType: 'TEXT',
        },
      };

      await service.recordCommercial(event);

      expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'ws-1',
            contactId: 'contact-1',
            action: 'message.received',
            intent: 'message_lifecycle',
          }),
        }),
      );
    });

    it('records a checkout.created event with full payload', async () => {
      const event: CheckoutEventPayload = {
        occurredAt: new Date(),
        workspaceId: 'ws-1',
        subject: 'order:order-1',
        eventType: 'checkout.created',
        payload: {
          customerEmail: 'buyer@example.com',
          orderId: 'order-1',
          paymentMethod: 'PIX',
          priceBand: '100_499',
          status: 'PENDING',
          totalInCents: 14700,
          utmSource: 'instagram',
        },
      };

      await service.recordCommercial(event);

      expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'checkout.created',
            intent: 'checkout_lifecycle',
            status: 'executed',
            meta: expect.objectContaining({
              payload: expect.objectContaining({
                priceBand: '100_499',
                totalInCents: 14700,
                utmSource: 'instagram',
              }),
            }),
          }),
        }),
      );
    });

    it('records a checkout.cancelled event with skipped status', async () => {
      const event: CheckoutEventPayload = {
        occurredAt: new Date(),
        workspaceId: 'ws-1',
        subject: 'order:order-1',
        eventType: 'checkout.cancelled',
        payload: {
          orderId: 'order-1',
          paymentMethod: 'PIX',
          priceBand: '100_499',
          status: 'CANCELED',
          totalInCents: 14700,
        },
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

    it('enforces tenant-scoped idempotency via idempotencyKey permanently', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'existing-event-1' }]);

      const event: SaleEventPayload = {
        occurredAt: new Date(),
        workspaceId: 'ws-1',
        subject: 'lead:lead-1',
        eventType: 'sale.created',
        idempotencyKey: 'idem-sale-1',
        payload: {
          amount: 147,
          leadId: 'lead-1',
          status: 'pending',
        },
      };

      const id = await service.recordCommercial(event);

      expect(id).toBe('existing-event-1');
      expect(prisma.$queryRaw).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringMatching(/workspaceId/),
          expect.stringMatching(/idempotencyKey/),
        ]),
        'ws-1',
        'idem-sale-1',
      );
      expect(prisma.autopilotEvent.create).not.toHaveBeenCalled();
    });

    it('survives db write failure and returns null', async () => {
      prisma.autopilotEvent.create.mockRejectedValue(new Error('connection refused'));

      const event: SaleEventPayload = {
        occurredAt: new Date(),
        workspaceId: 'ws-1',
        subject: 'lead:lead-1',
        eventType: 'sale.created',
        payload: {
          amount: 147,
          leadId: 'lead-1',
          status: 'pending',
        },
      };

      const id = await service.recordCommercial(event);

      expect(id).toBeNull();
    });
  });

  describe('dispatchPending', () => {
    it('marks pending outbox events as dispatched', async () => {
      prisma.mindOutboxEvent.findMany.mockResolvedValueOnce([{ id: 'outbox-1' }]);
      prisma.mindOutboxEvent.updateMany.mockResolvedValueOnce({ count: 1 });

      await expect(service.dispatchPending('ws-1', 10)).resolves.toEqual({ dispatched: 1 });

      expect(prisma.mindOutboxEvent.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['outbox-1'] }, workspaceId: 'ws-1', status: 'pending' },
        data: expect.objectContaining({
          status: 'dispatched',
          attempts: { increment: 1 },
          lastError: null,
        }),
      });
      const call = prisma.mindOutboxEvent.updateMany.mock.calls[0][0];
      expect(call.data.dispatchedAt).toBeInstanceOf(Date);
    });
  });

  describe('recordMany', () => {
    it('records multiple events and returns count of successful writes', async () => {
      prisma.autopilotEvent.create
        .mockResolvedValueOnce({ id: 'event-1' })
        .mockResolvedValueOnce({ id: 'event-2' });

      const events: SaleEventPayload[] = [
        {
          occurredAt: new Date(),
          workspaceId: 'ws-1',
          subject: 'lead:lead-1',
          eventType: 'sale.created',
          payload: { amount: 147, leadId: 'lead-1', status: 'pending' },
        },
        {
          occurredAt: new Date(),
          workspaceId: 'ws-1',
          subject: 'lead:lead-2',
          eventType: 'sale.completed',
          payload: { amount: 297, leadId: 'lead-2', status: 'paid' },
        },
      ];

      const count = await service.recordMany(events);

      expect(count).toBe(2);
      expect(prisma.autopilotEvent.create).toHaveBeenCalledTimes(2);
    });

    it('counts only successful writes when some fail', async () => {
      prisma.autopilotEvent.create
        .mockRejectedValueOnce(new Error('connection refused'))
        .mockResolvedValueOnce({ id: 'event-2' });

      const events: SaleEventPayload[] = [
        {
          occurredAt: new Date(),
          workspaceId: 'ws-1',
          subject: 'lead:lead-1',
          eventType: 'sale.created',
          payload: { amount: 100, leadId: 'lead-1', status: 'pending' },
        },
        {
          occurredAt: new Date(),
          workspaceId: 'ws-1',
          subject: 'lead:lead-2',
          eventType: 'sale.completed',
          payload: { amount: 200, leadId: 'lead-2', status: 'paid' },
        },
      ];

      const count = await service.recordMany(events);

      expect(count).toBe(1);
    });
  });

  describe('markDispatchFailed', () => {
    it('marks a dispatched outbox event as failed with error', async () => {
      prisma.mindOutboxEvent.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.markDispatchFailed('outbox-1', 'ws-1', 'connection refused');

      expect(prisma.mindOutboxEvent.updateMany).toHaveBeenCalledWith({
        where: { id: 'outbox-1', workspaceId: 'ws-1', status: 'dispatched' },
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
