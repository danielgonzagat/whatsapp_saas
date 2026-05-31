import { CampaignsService } from '../campaigns/campaigns.service';
import { CheckoutOrderService } from '../checkout/checkout-order.service';
import { PlanService } from '../plans/plan.service';
import { WhatsappService } from '../marketing/channels/whatsapp/whatsapp.service';

/**
 * Cross-service capability-resolver wiring proofs (part 2).
 *
 * Continuation of `cross-service-canonical-aliases.spec.ts`. Each block
 * proves a thin canonical-name alias exists on the real NestJS service
 * and delegates to the pre-existing canonical method with the
 * (workspaceId, args) signature expected by `KloelDomainServiceResolver`.
 * These aliases close the resolver gap documented in
 * `docs/architecture/CAPABILITY_MAP.md` (gap class B — method-missing).
 */

describe('Cross-service canonical-name aliases (capability resolver wiring) — part 2', () => {
  describe('WhatsappService.connect()', () => {
    type ConnectFn = (ws: string, args?: Record<string, unknown>) => Promise<unknown>;

    it('delegates to createSession with the same workspace and ignores args', async () => {
      const delegate = jest.fn().mockResolvedValue({ sessionId: 'sess-1' });
      const result = await (WhatsappService.prototype.connect as ConnectFn).call(
        { createSession: delegate },
        'ws-wa-1',
        { ignored: true },
      );

      const calls = delegate.mock.calls as Array<[string]>;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe('ws-wa-1');
      expect(result).toEqual({ sessionId: 'sess-1' });
    });
  });

  describe('WhatsappService.getMessages()', () => {
    type GetMessagesFn = (
      ws: string,
      args?: { chatId?: string; limit?: number; offset?: number; downloadMedia?: boolean },
    ) => Promise<unknown>;

    it('forwards chatId and options to getChatMessages', async () => {
      const delegate = jest.fn().mockResolvedValue([{ id: 'msg-1' }]);
      await (WhatsappService.prototype.getMessages as GetMessagesFn).call(
        { getChatMessages: delegate },
        'ws-msg-1',
        { chatId: 'chat-abc', limit: 25, offset: 10, downloadMedia: true },
      );

      const calls = delegate.mock.calls as Array<
        [string, string, { limit?: number; offset?: number; downloadMedia?: boolean }]
      >;
      expect(calls[0]?.[0]).toBe('ws-msg-1');
      expect(calls[0]?.[1]).toBe('chat-abc');
      expect(calls[0]?.[2]).toEqual({ limit: 25, offset: 10, downloadMedia: true });
    });

    it('throws when chatId is missing', async () => {
      const delegate = jest.fn();
      await expect(
        (WhatsappService.prototype.getMessages as GetMessagesFn).call(
          { getChatMessages: delegate },
          'ws-msg-2',
        ),
      ).rejects.toThrow(/args\.chatId is required/);
      expect(delegate).not.toHaveBeenCalled();
    });
  });

  describe('PlanService.configure()', () => {
    type ConfigureFn = (ws: string, args?: { planId?: string; name?: string }) => Promise<unknown>;

    it('splits planId from args and forwards rest as patch to update', async () => {
      const delegate = jest.fn().mockResolvedValue({ success: true });
      await (PlanService.prototype.configure as ConfigureFn).call(
        { update: delegate },
        'ws-plan-1',
        { planId: 'plan-xyz', name: 'New name' },
      );

      const calls = delegate.mock.calls as Array<[string, string, Record<string, unknown>]>;
      expect(calls[0]?.[0]).toBe('ws-plan-1');
      expect(calls[0]?.[1]).toBe('plan-xyz');
      expect(calls[0]?.[2]).toEqual({ name: 'New name' });
    });

    it('throws when planId is missing', async () => {
      const delegate = jest.fn();
      await expect(
        (PlanService.prototype.configure as ConfigureFn).call({ update: delegate }, 'ws-plan-2'),
      ).rejects.toThrow(/planId is required/);
      expect(delegate).not.toHaveBeenCalled();
    });
  });

  describe('CampaignsService.createBroadcast()', () => {
    type CreateBroadcastFn = (
      ws: string,
      args?: { name?: string; messageTemplate?: string },
    ) => Promise<unknown>;

    it('forwards name and rest of args to create', async () => {
      const delegate = jest.fn().mockResolvedValue({ id: 'camp-1' });
      await (CampaignsService.prototype.createBroadcast as CreateBroadcastFn).call(
        { create: delegate },
        'ws-bc-1',
        { name: 'Black Friday', messageTemplate: 'Promo!' },
      );

      const calls = delegate.mock.calls as Array<
        [string, { name: string; messageTemplate: string }]
      >;
      expect(calls[0]?.[0]).toBe('ws-bc-1');
      expect(calls[0]?.[1]).toEqual({ name: 'Black Friday', messageTemplate: 'Promo!' });
    });

    it('throws when name is missing', async () => {
      const delegate = jest.fn();
      await expect(
        (CampaignsService.prototype.createBroadcast as CreateBroadcastFn).call(
          { create: delegate },
          'ws-bc-2',
        ),
      ).rejects.toThrow(/args\.name is required/);
      expect(delegate).not.toHaveBeenCalled();
    });
  });

  describe('CheckoutOrderService.list()', () => {
    type OrderListFn = (
      ws: string,
      args?: { status?: string; page?: number; limit?: number },
    ) => Promise<unknown>;

    it('forwards status/page/limit to listOrders', async () => {
      const delegate = jest.fn().mockResolvedValue({ rows: [], total: 0 });
      await (CheckoutOrderService.prototype.list as OrderListFn).call(
        { listOrders: delegate },
        'ws-ord-1',
        { status: 'PAID', page: 2, limit: 10 },
      );

      const calls = delegate.mock.calls as Array<
        [string, { status?: string; page?: number; limit?: number }]
      >;
      expect(calls[0]?.[0]).toBe('ws-ord-1');
      expect(calls[0]?.[1]).toEqual({ status: 'PAID', page: 2, limit: 10 });
    });

    it('passes empty filter object when args omitted', async () => {
      const delegate = jest.fn().mockResolvedValue({ rows: [] });
      await (CheckoutOrderService.prototype.list as OrderListFn).call(
        { listOrders: delegate },
        'ws-ord-2',
      );

      const calls = delegate.mock.calls as Array<[string, Record<string, unknown>]>;
      expect(calls[0]?.[1]).toEqual({});
    });
  });

  describe('CheckoutOrderService.get()', () => {
    type OrderGetFn = (ws: string, args?: { orderId?: string }) => Promise<unknown>;

    it('forwards orderId and workspace to getOrder', async () => {
      const delegate = jest.fn().mockResolvedValue({ id: 'ord-9' });
      await (CheckoutOrderService.prototype.get as OrderGetFn).call(
        { getOrder: delegate },
        'ws-getord-1',
        { orderId: 'ord-9' },
      );

      const calls = delegate.mock.calls as Array<[string, string]>;
      expect(calls[0]).toEqual(['ord-9', 'ws-getord-1']);
    });

    it('throws when orderId is missing', async () => {
      const delegate = jest.fn();
      await expect(
        (CheckoutOrderService.prototype.get as OrderGetFn).call(
          { getOrder: delegate },
          'ws-getord-2',
        ),
      ).rejects.toThrow(/orderId is required/);
      expect(delegate).not.toHaveBeenCalled();
    });
  });
});
