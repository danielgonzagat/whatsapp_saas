import { BrainEventSpineService } from './brain-event-spine.service';
import type { SaleEventPayload } from './brain-event-taxonomy';

describe('BrainEventSpineService outbox helpers', () => {
  let prisma: {
    autopilotEvent: { create: jest.Mock };
    mindOutboxEvent: { findMany: jest.Mock; updateMany: jest.Mock; upsert: jest.Mock };
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let service: BrainEventSpineService;

  beforeEach(() => {
    prisma = {
      autopilotEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }) },
      mindOutboxEvent: {
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

  it('claims pending events by type and returns processing payloads for workers', async () => {
    const occurredAt = new Date('2026-05-13T10:00:00.000Z');
    prisma.mindOutboxEvent.findMany
      .mockResolvedValueOnce([{ id: 'outbox-1' }])
      .mockResolvedValueOnce([
        {
          id: 'outbox-1',
          eventType: 'agent.job.due',
          subject: 'agent_job:daily',
          payload: { prompt: 'Review memory' },
          idempotencyKey: 'agent_job:daily:2026-05-13T09:59:00.000Z',
          occurredAt,
          attempts: 1,
          lastError: null,
        },
      ]);
    prisma.mindOutboxEvent.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await service.claimPendingEvents({
      workspaceId: 'ws-1',
      eventType: 'agent.job.due',
      limit: 5,
    });

    expect(prisma.mindOutboxEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['outbox-1'] },
        workspaceId: 'ws-1',
        eventType: 'agent.job.due',
        status: 'pending',
      },
      data: expect.objectContaining({
        status: 'processing',
        attempts: { increment: 1 },
      }),
    });
    expect(result.events).toEqual([
      expect.objectContaining({
        id: 'outbox-1',
        eventType: 'agent.job.due',
        subject: 'agent_job:daily',
        payload: { prompt: 'Review memory' },
      }),
    ]);
  });

  it('records multiple events and returns count of successful writes', async () => {
    prisma.autopilotEvent.create
      .mockResolvedValueOnce({ id: 'event-1' })
      .mockResolvedValueOnce({ id: 'event-2' });

    const count = await service.recordMany([
      saleEvent('sale.created', 147),
      saleEvent('sale.completed', 297),
    ]);

    expect(count).toBe(2);
    expect(prisma.autopilotEvent.create).toHaveBeenCalledTimes(2);
  });

  it('counts only successful writes when some fail', async () => {
    prisma.autopilotEvent.create
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({ id: 'event-2' });

    const count = await service.recordMany([
      saleEvent('sale.created', 100),
      saleEvent('sale.completed', 200),
    ]);

    expect(count).toBe(1);
  });
});

function saleEvent(eventType: SaleEventPayload['eventType'], amount: number): SaleEventPayload {
  return {
    occurredAt: new Date(),
    workspaceId: 'ws-1',
    subject: `lead:${amount}`,
    eventType,
    payload: { amount, leadId: `lead-${amount}`, status: 'pending' },
  };
}
