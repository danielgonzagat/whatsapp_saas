import { BrainEventSpineService } from './brain-event-spine.service';
import type {
  CheckoutEventPayload,
  MessageEventPayload,
  SaleEventPayload,
} from './brain-event-taxonomy';

function buildSaleCreatedEvent(occurredAt: Date): SaleEventPayload {
  return {
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
}

function assertSaleCreatedCall(createCall: { data: Record<string, unknown> }) {
  expect(createCall.data).toMatchObject({
    workspaceId: 'ws-1',
    contactId: 'contact-1',
    intent: 'sale_lifecycle',
    action: 'sale.created',
    status: 'executed',
  });
  expect(createCall.data.meta).toMatchObject({
    commercial: true,
    subject: 'lead:lead-1',
    occurredAt: '2026-05-07T12:00:00.000Z',
    idempotencyKey: 'sale.created:lead:lead-1:2026-05-07T12:00:00.000Z',
  });
  expect((createCall.data.meta as { payload: unknown }).payload).toMatchObject({
    amount: 147,
    externalPaymentId: 'pi_abc123',
    paymentMethod: 'PIX',
    status: 'pending',
  });
}

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

  describe('recordCommercial', () => {
    it('records a sale.created event with typed payload, workspaceId, and timestamp', async () => {
      const occurredAt = new Date('2026-05-07T12:00:00Z');

      const id = await service.recordCommercial(buildSaleCreatedEvent(occurredAt));

      expect(id).toBe('event-1');
      assertSaleCreatedCall(prisma.autopilotEvent.create.mock.calls[0][0]);
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
    it('claims pending outbox events without marking downstream dispatch success', async () => {
      prisma.mindOutboxEvent.findMany.mockResolvedValueOnce([{ id: 'outbox-1' }]);
      prisma.mindOutboxEvent.updateMany.mockResolvedValueOnce({ count: 1 });

      await expect(service.dispatchPending('ws-1', 10)).resolves.toEqual({ dispatched: 1 });

      expect(prisma.mindOutboxEvent.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['outbox-1'] }, workspaceId: 'ws-1', status: 'pending' },
        data: expect.objectContaining({
          status: 'processing',
          attempts: { increment: 1 },
          dispatchedAt: null,
          lastError: null,
        }),
      });
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
});
