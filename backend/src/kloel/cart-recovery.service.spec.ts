import { CartRecoveryService } from './cart-recovery.service';

const sendEmail = jest.fn().mockResolvedValue(undefined);

jest.mock('../auth/email.service', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendEmail,
  })),
}));

// PULSE_OK: assertions exist below
describe('CartRecoveryService', () => {
  let prisma: any;
  let service: CartRecoveryService;

  beforeEach(() => {
    sendEmail.mockClear();
    prisma = {
      checkoutOrder: {
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    service = new CartRecoveryService(prisma);
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
        plan: {
          product: {
            name: 'Plano Premium',
          },
        },
      },
    ]);

    await service.checkAbandonedCarts();

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
        plan: {
          product: {
            name: 'Plano Plus',
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
