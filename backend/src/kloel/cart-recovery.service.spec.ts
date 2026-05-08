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

// PULSE_OK: assertions exist below
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

  it('ignores malformed metadata when marking recovery email as sent', async () => {
    prisma.checkoutOrder.findMany.mockResolvedValue([
      {
        id: 'order-1',
        workspaceId: 'ws-1',
        orderNumber: '1001',
        status: 'PENDING',
        customerEmail: 'cliente@kloel.test',
        metadata: 'corrupted',
        createdAt: new Date(Date.now() - 45 * 60 * 1000),
        plan: {
          product: {
            name: 'Plano Premium',
            price: 97,
          },
        },
      },
    ]);

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
      recoveryEmailSentAt: expect.any(String),
    });
  });

  it('preserves valid metadata fields when recording recovery delivery', async () => {
    prisma.checkoutOrder.findMany.mockResolvedValue([
      {
        id: 'order-2',
        workspaceId: 'ws-1',
        orderNumber: '1002',
        status: 'PENDING',
        customerEmail: 'cliente@kloel.test',
        metadata: { source: 'checkout' },
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
        plan: {
          product: {
            name: 'Plano Plus',
            price: 197,
          },
        },
      },
    ]);

    await service.checkAbandonedCarts();

    expect(prisma.checkoutOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-2', workspaceId: 'ws-1' },
        data: {
          metadata: expect.objectContaining({
            source: 'checkout',
            recoveryEmailSent: true,
            recoveryEmailSentAt: expect.any(String),
          }),
        },
      }),
    );
  });
});
