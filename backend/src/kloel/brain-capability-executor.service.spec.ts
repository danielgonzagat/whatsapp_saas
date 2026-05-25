import { BrainCapabilityExecutorService } from './brain-capability-executor.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

describe('BrainCapabilityExecutorService', () => {
  const eventsRecord = jest.fn().mockResolvedValue(undefined);
  const ensureTokenBudget = jest.fn().mockResolvedValue(undefined);

  const prismaMock = createPartialPrismaMock({
    product: ['findMany'],
    contact: ['findMany'],
    conversation: ['findMany'],
    checkoutOrder: ['aggregate', 'count'],
  });
  const productFindMany = prismaMock.product.findMany;
  const contactFindMany = prismaMock.contact.findMany;
  const conversationFindMany = prismaMock.conversation.findMany;
  const orderAggregate = prismaMock.checkoutOrder.aggregate;
  const orderCount = prismaMock.checkoutOrder.count;

  let service: BrainCapabilityExecutorService;

  beforeEach(() => {
    jest.clearAllMocks();
    eventsRecord.mockResolvedValue(undefined);
    ensureTokenBudget.mockResolvedValue(undefined);
    service = new BrainCapabilityExecutorService(
      prismaMock as never,
      { record: eventsRecord } as never,
      { ensureTokenBudget } as never,
    );
  });

  describe('listProducts', () => {
    it('returns products scoped to workspace and emits capability event', async () => {
      productFindMany.mockResolvedValue([
        { id: 'p-1', name: 'A', price: 100, active: true, createdAt: new Date() },
      ]);

      const result = await service.listProducts('ws-1');

      expect(result.ok).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(productFindMany).toHaveBeenCalledTimes(1);
      const call = productFindMany.mock.calls[0][0];
      expect(call.where.workspaceId).toBe('ws-1');
      expect(eventsRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          action: 'brain.capability.invoked',
          intent: 'list_products',
          status: 'executed',
        }),
      );
    });

    it('returns ok:false when prisma throws and emits error event', async () => {
      productFindMany.mockRejectedValue(new Error('db down'));

      const result = await service.listProducts('ws-1');

      expect(result).toEqual({ ok: false, error: 'db down' });
      expect(eventsRecord).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error', intent: 'list_products' }),
      );
    });
  });

  describe('searchContact', () => {
    it('returns query_required without DB call when query is empty', async () => {
      const result = await service.searchContact('ws-1', { query: '   ' });
      expect(result).toEqual({ ok: false, error: 'query_required' });
      expect(contactFindMany).not.toHaveBeenCalled();
    });

    it('isolates contact search by workspaceId', async () => {
      contactFindMany.mockResolvedValue([]);
      await service.searchContact('ws-only', { query: 'john' });
      const call = contactFindMany.mock.calls[0][0];
      expect(call.where.workspaceId).toBe('ws-only');
    });
  });

  describe('listConversations', () => {
    it('isolates conversation list by workspaceId and applies open status filter', async () => {
      conversationFindMany.mockResolvedValue([]);
      await service.listConversations('ws-9', { status: 'open' });
      const call = conversationFindMany.mock.calls[0][0];
      expect(call.where.workspaceId).toBe('ws-9');
      expect(call.where.status).toEqual({ not: 'closed' });
    });
  });

  describe('sendMessageViaChannel', () => {
    it('returns phone_required when phone is missing', async () => {
      const result = await service.sendMessageViaChannel('ws-1', { message: 'hi' });
      expect(result).toEqual({ ok: false, error: 'phone_required' });
      expect(ensureTokenBudget).not.toHaveBeenCalled();
    });

    it('rejects when ensureTokenBudget throws (plan-limit denial)', async () => {
      ensureTokenBudget.mockRejectedValue(new Error('plan_limit_exceeded'));
      const result = await service.sendMessageViaChannel('ws-1', {
        phone: '+5511999998888',
        message: 'oi',
      });
      expect(result).toEqual({ ok: false, error: 'plan_limit_exceeded' });
      // event.record should still be called for observability via emitCapabilityInvoked
      expect(eventsRecord).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error', intent: 'send_message_via_channel' }),
      );
    });

    it('records message.sent event when send succeeds', async () => {
      const result = await service.sendMessageViaChannel('ws-1', {
        phone: '+5511',
        message: 'olá',
        channel: 'whatsapp',
      });
      expect(result.ok).toBe(true);
      expect(eventsRecord).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws-1', action: 'message.sent' }),
      );
    });
  });

  describe('queryRevenueSummary', () => {
    it('isolates checkout aggregations by workspaceId', async () => {
      orderAggregate.mockResolvedValue({ _sum: { totalInCents: 10000 }, _avg: { totalInCents: 1000 } });
      orderCount.mockResolvedValueOnce(10).mockResolvedValueOnce(7);

      const result = await service.queryRevenueSummary('ws-rev', { days: 7 });

      expect(result.ok).toBe(true);
      const aggArgs = orderAggregate.mock.calls[0][0];
      const countArgs1 = orderCount.mock.calls[0][0];
      expect(aggArgs.where.workspaceId).toBe('ws-rev');
      expect(countArgs1.where.workspaceId).toBe('ws-rev');
    });
  });
});
