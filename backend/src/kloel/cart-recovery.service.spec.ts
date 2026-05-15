import { CartRecoveryService } from './cart-recovery.service';

type FlexMock = jest.Mock & {
  mockResolvedValue: (v: unknown) => FlexMock;
  mockResolvedValueOnce: (v: unknown) => FlexMock;
  mockRejectedValue: (e: unknown) => FlexMock;
  mockReturnValue: (v: unknown) => FlexMock;
  mockImplementation: (fn: (...args: unknown[]) => unknown) => FlexMock;
};

type MockPrisma = {
  workspace: {
    findMany: FlexMock;
  };
  checkoutOrder: {
    findMany: FlexMock;
    update: FlexMock;
    updateMany: FlexMock;
  };
};

const sendEmail = jest.fn().mockResolvedValue(undefined);

jest.mock('../auth/email.service', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendEmail,
  })),
}));

describe('CartRecoveryService', () => {
  let prisma: MockPrisma;
  let service: CartRecoveryService;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-cart-recovery-tests';
    sendEmail.mockClear();
    prisma = {
      workspace: {
        findMany: jest.fn().mockResolvedValue([{ id: 'ws-1' }]),
      },
      checkoutOrder: {
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    service = new CartRecoveryService(prisma as never);
  });

  function pendingOrder(overrides?: {
    id?: string;
    email?: string;
    metadata?: unknown;
    productName?: string;
    productPrice?: number;
    productId?: string;
  }) {
    return {
      id: overrides?.id ?? 'order-1',
      workspaceId: 'ws-1',
      orderNumber: '1001',
      status: 'PENDING',
      customerEmail: overrides?.email ?? 'cliente@kloel.test',
      metadata: overrides?.metadata ?? undefined,
      createdAt: new Date(Date.now() - 45 * 60 * 1000),
      plan: {
        product: {
          id: overrides?.productId ?? 'prod-1',
          name: overrides?.productName ?? 'Plano Premium',
          price: overrides?.productPrice ?? 97,
        },
      },
    };
  }

  function makeStubGuards(overrides?: { allowed?: boolean; guardName?: string; reason?: string }) {
    return {
      evaluate: jest.fn().mockResolvedValue({
        allowed: overrides?.allowed ?? true,
        guardName: overrides?.guardName ?? 'ok',
        reason: overrides?.reason ?? null,
      }),
    };
  }

  function makeStubTransport(overrides?: { sendAvailable?: boolean; sendResult?: unknown }) {
    return {
      getCapability: jest.fn().mockResolvedValue({
        sendAvailable: overrides?.sendAvailable ?? true,
      }),
      send: jest.fn().mockResolvedValue(
        overrides?.sendResult ?? {
          success: true,
          blocked: false,
        },
      ),
    };
  }

  function makeStubBandit(overrides?: { arm?: string }) {
    return {
      register: jest.fn().mockResolvedValue(undefined),
      choose: jest.fn().mockResolvedValue(overrides?.arm ? { arm: overrides.arm } : null),
    };
  }

  function makeStubMindPolicy(chosen = 'help') {
    return {
      choose: jest.fn().mockResolvedValue({
        chosen,
        decision: {
          fallbackActive: false,
          reasonInternal: 'test-policy',
          candidates: [{ action: chosen, beliefMean: 0.8 }],
        },
      }),
    };
  }

  describe('legacy behavior (no guard, no transport, no bandit)', () => {
    it('ignores malformed metadata when marking recovery email as sent', async () => {
      prisma.checkoutOrder.findMany.mockResolvedValue([pendingOrder({ metadata: 'corrupted' })]);

      await service.checkAbandonedCarts();

      expect(prisma.checkoutOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: { in: ['ws-1'] } }),
        }),
      );
      expect(sendEmail).toHaveBeenCalledTimes(1);

      const updatePayload = prisma.checkoutOrder.updateMany.mock.calls[0][0].data.metadata;
      expect(updatePayload).toEqual({
        recoveryEmailSent: true,
        recoveryEmailSentAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    });

    it('preserves valid metadata fields when recording recovery delivery', async () => {
      prisma.checkoutOrder.findMany.mockResolvedValue([
        pendingOrder({
          id: 'order-2',
          metadata: { source: 'checkout' },
          productName: 'Plano Plus',
          productPrice: 197,
        }),
      ]);

      await service.checkAbandonedCarts();

      expect(prisma.checkoutOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-2', workspaceId: 'ws-1' },
          data: {
            metadata: expect.objectContaining({
              source: 'checkout',
              recoveryEmailSent: true,
              recoveryEmailSentAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
            }),
          },
        }),
      );
    });
  });

  describe('guard integration', () => {
    it('blocks cart recovery when guard rejects with opt_out', async () => {
      prisma.checkoutOrder.findMany.mockResolvedValue([pendingOrder()]);
      const stubGuards = makeStubGuards({
        allowed: false,
        guardName: 'opt_out',
        reason: 'Contato possui opt-out registrado.',
      });
      service = new CartRecoveryService(
        prisma as never,
        undefined,
        undefined,
        undefined,
        stubGuards as never,
      );

      await service.checkAbandonedCarts();

      expect(sendEmail).not.toHaveBeenCalled();
      expect(prisma.checkoutOrder.updateMany).not.toHaveBeenCalled();
    });

    it('allows cart recovery when guard passes all checks', async () => {
      prisma.checkoutOrder.findMany.mockResolvedValue([pendingOrder()]);
      const stubGuards = makeStubGuards({ allowed: true });
      service = new CartRecoveryService(
        prisma as never,
        undefined,
        undefined,
        undefined,
        stubGuards as never,
      );

      await service.checkAbandonedCarts();

      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(prisma.checkoutOrder.updateMany).toHaveBeenCalledTimes(1);
    });

    it('evaluates guard with cart_recovery context', async () => {
      prisma.checkoutOrder.findMany.mockResolvedValue([pendingOrder()]);
      const stubGuards = makeStubGuards({ allowed: true });
      service = new CartRecoveryService(
        prisma as never,
        undefined,
        undefined,
        undefined,
        stubGuards as never,
      );

      await service.checkAbandonedCarts();

      expect(stubGuards.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          decisionType: 'cart_recovery',
          context: expect.objectContaining({
            channel: 'email',
            withinComplianceWindow: true,
          }),
        }),
      );
    });

    it('skips orders without customer email regardless of guard', async () => {
      prisma.checkoutOrder.findMany.mockResolvedValue([pendingOrder({ email: '' })]);
      const stubGuards = makeStubGuards({ allowed: true });
      service = new CartRecoveryService(
        prisma as never,
        undefined,
        undefined,
        undefined,
        stubGuards as never,
      );

      await service.checkAbandonedCarts();

      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('transport registry integration', () => {
    it('skips order when email channel is not available', async () => {
      prisma.checkoutOrder.findMany.mockResolvedValue([pendingOrder()]);
      const stubTransport = makeStubTransport({ sendAvailable: false });
      service = new CartRecoveryService(
        prisma as never,
        undefined,
        undefined,
        undefined,
        undefined,
        stubTransport as never,
      );

      await service.checkAbandonedCarts();

      expect(sendEmail).not.toHaveBeenCalled();
      expect(prisma.checkoutOrder.updateMany).not.toHaveBeenCalled();
    });

    it('sends through transport registry when email channel is available', async () => {
      prisma.checkoutOrder.findMany.mockResolvedValue([pendingOrder()]);
      const stubTransport = makeStubTransport({ sendAvailable: true });
      service = new CartRecoveryService(
        prisma as never,
        undefined,
        undefined,
        undefined,
        undefined,
        stubTransport as never,
      );

      await service.checkAbandonedCarts();

      expect(stubTransport.send).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          channel: 'email',
          recipientId: 'cliente@kloel.test',
          content: expect.stringContaining('Voce deixou algo'),
          guardContext: expect.objectContaining({
            channel: 'email',
            withinComplianceWindow: true,
          }),
        }),
      );
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('skips safely when transport registry getCapability throws', async () => {
      prisma.checkoutOrder.findMany.mockResolvedValue([pendingOrder()]);
      const stubTransport = {
        getCapability: jest.fn().mockRejectedValue(new Error('transport unavailable')),
        send: jest.fn(),
      };
      service = new CartRecoveryService(
        prisma as never,
        undefined,
        undefined,
        undefined,
        undefined,
        stubTransport as never,
      );

      await service.checkAbandonedCarts();

      expect(stubTransport.send).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
      expect(prisma.checkoutOrder.updateMany).not.toHaveBeenCalled();
    });

    it('does not skip when transport registry is not injected', async () => {
      prisma.checkoutOrder.findMany.mockResolvedValue([pendingOrder()]);
      service = new CartRecoveryService(prisma as never);

      await service.checkAbandonedCarts();

      expect(sendEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('bandit integration', () => {
    it('registers bandit arms for cart_recovery and records bandit arm metadata', async () => {
      prisma.checkoutOrder.findMany.mockResolvedValue([pendingOrder()]);
      const stubBandit = makeStubBandit({ arm: 'proof' });
      const stubMindPolicy = makeStubMindPolicy('proof');
      service = new CartRecoveryService(
        prisma as never,
        undefined,
        stubMindPolicy as never,
        undefined,
        undefined,
        undefined,
        stubBandit as never,
      );

      await service.checkAbandonedCarts();

      expect(stubBandit.register).toHaveBeenCalledWith({
        arms: ['proof', 'urgency', 'help', 'faq', 'discount', 'pause'],
        decisionType: 'cart_recovery',
        workspaceId: 'ws-1',
      });
      expect(stubBandit.choose).toHaveBeenCalledWith('ws-1', 'cart_recovery');

      const updatePayload = prisma.checkoutOrder.updateMany.mock.calls[0][0].data.metadata;
      expect(updatePayload.banditArm).toBe('proof');
      expect(updatePayload.mindRecoveryAction).toBe('proof');
    });

    it('falls back gracefully when bandit choose returns null', async () => {
      prisma.checkoutOrder.findMany.mockResolvedValue([pendingOrder()]);
      const stubBandit = makeStubBandit();
      const stubMindPolicy = makeStubMindPolicy('help');
      service = new CartRecoveryService(
        prisma as never,
        undefined,
        stubMindPolicy as never,
        undefined,
        undefined,
        undefined,
        stubBandit as never,
      );

      await service.checkAbandonedCarts();

      expect(stubBandit.register).toHaveBeenCalledTimes(1);
      const updatePayload = prisma.checkoutOrder.updateMany.mock.calls[0][0].data.metadata;
      expect(updatePayload.banditArm).toBeUndefined();
      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it('falls back gracefully when bandit register throws', async () => {
      prisma.checkoutOrder.findMany.mockResolvedValue([pendingOrder()]);
      const stubBandit = {
        register: jest.fn().mockRejectedValue(new Error('db unavailable')),
        choose: jest.fn(),
      };
      const stubMindPolicy = makeStubMindPolicy('help');
      service = new CartRecoveryService(
        prisma as never,
        undefined,
        stubMindPolicy as never,
        undefined,
        undefined,
        undefined,
        stubBandit as never,
      );

      await service.checkAbandonedCarts();

      expect(sendEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('full stack', () => {
    it('delegates cart recovery guard blocking to the transport registry', async () => {
      prisma.checkoutOrder.findMany.mockResolvedValue([pendingOrder()]);
      const stubBandit = makeStubBandit({ arm: 'discount' });
      const stubMindPolicy = makeStubMindPolicy('discount');
      const stubTransport = makeStubTransport({
        sendAvailable: true,
        sendResult: {
          success: false,
          blocked: true,
          blockedReason: 'Limite diário de mensagens atingido.',
        },
      });
      service = new CartRecoveryService(
        prisma as never,
        undefined,
        stubMindPolicy as never,
        undefined,
        undefined,
        stubTransport as never,
        stubBandit as never,
      );

      await service.checkAbandonedCarts();

      expect(sendEmail).not.toHaveBeenCalled();
      expect(prisma.checkoutOrder.updateMany).not.toHaveBeenCalled();
      expect(stubBandit.register).toHaveBeenCalledTimes(1);
      expect(stubTransport.send).toHaveBeenCalledTimes(1);
    });

    it('checks email capability before bandit and guard evaluation', async () => {
      prisma.checkoutOrder.findMany.mockResolvedValue([pendingOrder()]);
      const stubTransport = makeStubTransport({ sendAvailable: false });
      const stubBandit = makeStubBandit();
      const stubGuards = makeStubGuards();
      const stubMindPolicy = makeStubMindPolicy('help');
      service = new CartRecoveryService(
        prisma as never,
        undefined,
        stubMindPolicy as never,
        undefined,
        stubGuards as never,
        stubTransport as never,
        stubBandit as never,
      );

      await service.checkAbandonedCarts();

      expect(stubTransport.getCapability).toHaveBeenCalledWith('ws-1', 'email');
      expect(stubBandit.register).not.toHaveBeenCalled();
      expect(stubGuards.evaluate).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('sends through transport without a duplicate direct guard evaluation', async () => {
      prisma.checkoutOrder.findMany.mockResolvedValue([pendingOrder()]);
      const stubGuards = makeStubGuards({ allowed: true });
      const stubTransport = makeStubTransport({ sendAvailable: true });
      const stubBandit = makeStubBandit({ arm: 'help' });
      const stubMindPolicy = makeStubMindPolicy('help');
      service = new CartRecoveryService(
        prisma as never,
        undefined,
        stubMindPolicy as never,
        undefined,
        stubGuards as never,
        stubTransport as never,
        stubBandit as never,
      );

      await service.checkAbandonedCarts();

      expect(stubTransport.getCapability).toHaveBeenCalledWith('ws-1', 'email');
      expect(stubBandit.register).toHaveBeenCalledTimes(1);
      expect(stubGuards.evaluate).not.toHaveBeenCalled();
      expect(stubTransport.send).toHaveBeenCalledTimes(1);
      expect(sendEmail).not.toHaveBeenCalled();
      expect(prisma.checkoutOrder.updateMany).toHaveBeenCalledTimes(1);
    });
  });
});
