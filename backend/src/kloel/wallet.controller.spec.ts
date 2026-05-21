import { WalletController } from './wallet.controller';

describe('WalletController withdrawal approval gate', () => {
  let walletService: { requestWithdrawal: jest.Mock; getBalance: jest.Mock };
  let prisma: {
    approvalRequest: {
      create: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let controller: WalletController;

  beforeEach(() => {
    walletService = {
      requestWithdrawal: jest.fn().mockResolvedValue({
        success: true,
        message: 'Saque solicitado',
        transactionId: 'wtx-1',
      }),
      getBalance: jest.fn(),
    };
    prisma = {
      approvalRequest: {
        create: jest.fn().mockResolvedValue({
          id: 'ap-wallet-1',
          state: 'OPEN',
          title: 'Aprovar saque de R$ 500,00',
          createdAt: new Date('2026-05-11T22:45:00.000Z'),
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    controller = new WalletController(walletService as never, prisma as never, {} as never);
  });

  it('creates an approval request instead of executing withdrawal immediately', async () => {
    const result = await controller.withdraw('ws-1', {
      amount: 500,
      pixKey: 'owner@example.com',
    });

    expect(walletService.requestWithdrawal).not.toHaveBeenCalled();
    expect(prisma.approvalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          kind: 'wallet:withdrawal',
          entityType: 'KloelWallet',
          entityId: 'ws-1',
          state: 'OPEN',
          payload: expect.objectContaining({
            amount: 500,
            bankInfo: { pixKey: 'owner@example.com' },
            risk: 'critical',
            requiresApproval: true,
          }),
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        approvalRequired: true,
        approvalRequestId: 'ap-wallet-1',
      }),
    );
  });

  it('executes withdrawal only when an approved request is supplied', async () => {
    prisma.approvalRequest.findFirst.mockResolvedValueOnce({
      id: 'ap-wallet-1',
      payload: { amount: 500, bankInfo: { pixKey: 'owner@example.com' } },
    });

    const result = await controller.withdraw('ws-1', {
      amount: 1,
      approvalRequestId: 'ap-wallet-1',
    });

    expect(walletService.requestWithdrawal).toHaveBeenCalledWith('ws-1', 500, {
      pixKey: 'owner@example.com',
    });
    expect(prisma.approvalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ap-wallet-1', workspaceId: 'ws-1', state: 'APPROVED' },
        data: expect.objectContaining({ state: 'COMPLETED' }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        transactionId: 'wtx-1',
        approvalExecuted: true,
      }),
    );
  });

  it('does not execute withdrawal when approval is missing', async () => {
    const result = await controller.withdraw('ws-1', {
      amount: 1,
      approvalRequestId: 'ap-wallet-1',
    });

    expect(walletService.requestWithdrawal).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, message: 'Saque aprovado nao encontrado.' });
  });
});
