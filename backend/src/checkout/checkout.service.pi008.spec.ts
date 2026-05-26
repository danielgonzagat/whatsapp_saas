import { NotFoundException } from '@nestjs/common';
import { CheckoutService } from './checkout.service';

type CheckoutServicePrismaMock = {
  checkoutProductPlan: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
  };
  product: { findFirst: jest.Mock };
};

type ProductServiceMock = {
  createCheckout: jest.Mock;
  updatePlan: jest.Mock;
  updateConfig: jest.Mock;
  syncCheckoutLinks: jest.Mock;
  getPlanLinkManager: jest.Mock;
};

type EventEmitterMock = {
  checkoutCreated: jest.Mock;
  checkoutUpdated: jest.Mock;
};

type CheckoutServiceInternals = {
  logger: { log: (message: string) => void };
  publicPayloadBuilder: {
    build: (p: Record<string, unknown>, opts?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
};
// ─── setup ────────────────────────────────────────────────────────────────

describe('CheckoutService — PI-008 checkout page configuration', () => {
  let service: CheckoutService;
  let prisma: CheckoutServicePrismaMock;
  let productSvc: ProductServiceMock;
  let eventEmitter: EventEmitterMock;

  beforeEach(() => {
    prisma = {
      checkoutProductPlan: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      product: { findFirst: jest.fn() },
    };
    productSvc = {
      createCheckout: jest.fn(),
      updatePlan: jest.fn(),
      updateConfig: jest.fn(),
      syncCheckoutLinks: jest.fn(),
      getPlanLinkManager: jest.fn().mockReturnValue({
        ensurePlanReferenceCode: jest.fn().mockImplementation(async (p: Record<string, unknown>) => p),
      }),
    };
    eventEmitter = {
      checkoutCreated: jest.fn().mockResolvedValue(undefined),
      checkoutUpdated: jest.fn().mockResolvedValue(undefined),
    };
    service = new CheckoutService(
      prisma as never, productSvc as never, {} as never, {} as never, eventEmitter as never,
    );
    const internal = service as unknown as CheckoutServiceInternals;
    jest.spyOn(internal.logger, 'log').mockImplementation(() => undefined);
    internal.publicPayloadBuilder.build = jest.fn().mockResolvedValue({ id: 'payload' });
  });

  afterEach(() => { jest.restoreAllMocks(); });
  // ─── create ─────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates checkout and emits checkout.created event', async () => {
      const dto = { name: 'Meu Checkout', priceInCents: 9990 };
      const created = { id: 'chk_new', name: 'Meu Checkout', kind: 'CHECKOUT' };
      productSvc.createCheckout.mockResolvedValue(created);

      const result = await service.create('ws_1', 'prod_1', dto);

      expect(productSvc.createCheckout).toHaveBeenCalledWith('prod_1', dto, 'ws_1');
      expect(eventEmitter.checkoutCreated).toHaveBeenCalledWith({
        workspaceId: 'ws_1', checkoutId: 'chk_new', productId: 'prod_1',
      });
      expect(result).toEqual(created);
    });

    it('does not emit when createCheckout returns null', async () => {
      productSvc.createCheckout.mockResolvedValue(null);
      const result = await service.create('ws_1', 'prod_1', { name: 'X', priceInCents: 1000 });
      expect(eventEmitter.checkoutCreated).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });
  // ─── update ─────────────────────────────────────────────────────────────

  describe('update', () => {
    it('verifies ownership, updates, and emits checkout.updated', async () => {
      prisma.checkoutProductPlan.findFirst.mockResolvedValueOnce({ id: 'chk_1', productId: 'prod_1' });
      productSvc.updatePlan.mockResolvedValue({ id: 'chk_1', name: 'Atualizado', kind: 'CHECKOUT' });

      const result = await service.update('ws_1', 'chk_1', { name: 'Atualizado' });

      expect(prisma.checkoutProductPlan.findFirst).toHaveBeenCalledWith({
        where: { id: 'chk_1', kind: 'CHECKOUT', product: { workspaceId: 'ws_1' } },
        select: { id: true, productId: true },
      });
      expect(productSvc.updatePlan).toHaveBeenCalledWith('chk_1', { name: 'Atualizado' });
      expect(eventEmitter.checkoutUpdated).toHaveBeenCalledWith({ workspaceId: 'ws_1', checkoutId: 'chk_1' });
      expect(result).toEqual(expect.objectContaining({ name: 'Atualizado' }));
    });

    it('rejects when checkout not found in workspace', async () => {
      prisma.checkoutProductPlan.findFirst.mockResolvedValueOnce(null);
      await expect(service.update('ws_1', 'chk_missing', {})).rejects.toThrow(NotFoundException);
      expect(productSvc.updatePlan).not.toHaveBeenCalled();
    });
  });
  // ─── findByProduct ──────────────────────────────────────────────────────

  describe('findByProduct', () => {
    it('returns checkouts for product', async () => {
      prisma.product.findFirst.mockResolvedValueOnce({ id: 'prod_1' });
      const checkouts = [{ id: 'chk_1', name: 'A', kind: 'CHECKOUT', checkoutConfig: null, checkoutLinks: [] }];
      prisma.checkoutProductPlan.findMany.mockResolvedValueOnce(checkouts);

      const result = await service.findByProduct('ws_1', 'prod_1');

      expect(prisma.product.findFirst).toHaveBeenCalledWith({
        where: { id: 'prod_1', workspaceId: 'ws_1' }, select: { id: true },
      });
      expect(prisma.checkoutProductPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { productId: 'prod_1', kind: 'CHECKOUT' } }),
      );
      expect(result).toEqual(checkouts);
    });

    it('throws NotFoundException when product not in workspace', async () => {
      prisma.product.findFirst.mockResolvedValueOnce(null);
      await expect(service.findByProduct('ws_1', 'prod_missing')).rejects.toThrow(NotFoundException);
    });
  });
  // ─── linkPlans ──────────────────────────────────────────────────────────

  describe('linkPlans', () => {
    it('verifies ownership and syncs links', async () => {
      prisma.checkoutProductPlan.findFirst.mockResolvedValueOnce({ id: 'chk_1', productId: 'prod_1' });
      productSvc.syncCheckoutLinks.mockResolvedValue(undefined);

      await service.linkPlans('ws_1', 'chk_1', ['plan_1', 'plan_2']);

      expect(prisma.checkoutProductPlan.findFirst).toHaveBeenCalledWith({
        where: { id: 'chk_1', kind: 'CHECKOUT', product: { workspaceId: 'ws_1' } },
        select: { id: true, productId: true },
      });
      expect(productSvc.syncCheckoutLinks).toHaveBeenCalledWith('chk_1', ['plan_1', 'plan_2']);
    });

    it('rejects when checkout not found', async () => {
      prisma.checkoutProductPlan.findFirst.mockResolvedValueOnce(null);
      await expect(service.linkPlans('ws_1', 'chk_missing', ['plan_1'])).rejects.toThrow(NotFoundException);
    });
  });
  // ─── setTheme ───────────────────────────────────────────────────────────

  describe('setTheme', () => {
    it('verifies ownership and updates config', async () => {
      prisma.checkoutProductPlan.findFirst.mockResolvedValueOnce({ id: 'chk_1', productId: 'prod_1' });
      productSvc.updateConfig.mockResolvedValue({ id: 'cfg_1', theme: 'NOIR' });

      const result = await service.setTheme('ws_1', 'chk_1', { theme: 'NOIR' });
      expect(productSvc.updateConfig).toHaveBeenCalledWith('chk_1', { theme: 'NOIR' });
      expect(result).toEqual(expect.objectContaining({ theme: 'NOIR' }));
    });
  });
  // ─── setCoupons ─────────────────────────────────────────────────────────

  describe('setCoupons', () => {
    it('verifies ownership and updates config', async () => {
      prisma.checkoutProductPlan.findFirst.mockResolvedValueOnce({ id: 'chk_1', productId: 'prod_1' });
      productSvc.updateConfig.mockResolvedValue({ id: 'cfg_1', enableCoupon: false });

      const result = await service.setCoupons('ws_1', 'chk_1', { enableCoupon: false });
      expect(productSvc.updateConfig).toHaveBeenCalledWith('chk_1', { enableCoupon: false });
      expect(result).toEqual(expect.objectContaining({ enableCoupon: false }));
    });
  });
  // ─── setTimer ───────────────────────────────────────────────────────────

  describe('setTimer', () => {
    it('verifies ownership and updates config', async () => {
      prisma.checkoutProductPlan.findFirst.mockResolvedValueOnce({ id: 'chk_1', productId: 'prod_1' });
      productSvc.updateConfig.mockResolvedValue({ id: 'cfg_1', enableTimer: true });

      const dto = { enableTimer: true, timerType: 'COUNTDOWN' as const, timerMinutes: 15 };
      const result = await service.setTimer('ws_1', 'chk_1', dto);
      expect(productSvc.updateConfig).toHaveBeenCalledWith('chk_1', dto);
      expect(result).toEqual(expect.objectContaining({ enableTimer: true }));
    });
  });
  // ─── setSocialProof ─────────────────────────────────────────────────────

  describe('setSocialProof', () => {
    it('verifies ownership and updates config', async () => {
      prisma.checkoutProductPlan.findFirst.mockResolvedValueOnce({ id: 'chk_1', productId: 'prod_1' });
      productSvc.updateConfig.mockResolvedValue({ id: 'cfg_1', socialProofEnabled: true });

      const result = await service.setSocialProof('ws_1', 'chk_1', { socialProofEnabled: true });
      expect(productSvc.updateConfig).toHaveBeenCalledWith('chk_1', { socialProofEnabled: true });
      expect(result).toEqual(expect.objectContaining({ socialProofEnabled: true }));
    });
  });
  // ─── setExitIntent ──────────────────────────────────────────────────────

  describe('setExitIntent', () => {
    it('verifies ownership and updates config with enabled=true', async () => {
      prisma.checkoutProductPlan.findFirst.mockResolvedValueOnce({ id: 'chk_1', productId: 'prod_1' });
      productSvc.updateConfig.mockResolvedValue({ id: 'cfg_1', enableExitIntent: true });

      const result = await service.setExitIntent('ws_1', 'chk_1', true);
      expect(productSvc.updateConfig).toHaveBeenCalledWith('chk_1', { enableExitIntent: true });
      expect(result).toEqual(expect.objectContaining({ enableExitIntent: true }));
    });

    it('updates with enabled=false', async () => {
      prisma.checkoutProductPlan.findFirst.mockResolvedValueOnce({ id: 'chk_1', productId: 'prod_1' });
      productSvc.updateConfig.mockResolvedValue({ id: 'cfg_1', enableExitIntent: false });

      const result = await service.setExitIntent('ws_1', 'chk_1', false);
      expect(productSvc.updateConfig).toHaveBeenCalledWith('chk_1', { enableExitIntent: false });
      expect(result).toEqual(expect.objectContaining({ enableExitIntent: false }));
    });
  });
});