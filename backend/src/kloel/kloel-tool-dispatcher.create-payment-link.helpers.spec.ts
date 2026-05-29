import type { AuditService } from '../audit/audit.service';
import type { OpsAlertService } from '../observability/ops-alert.service';
import type { PrismaService } from '../prisma/prisma.service';
import { matchInstance } from '../../test/helpers/match-instance';
import type { KloelChatToolsService } from './kloel-chat-tools.service';
import { runCreatePaymentLink } from './kloel-tool-dispatcher.create-payment-link.helpers';
import type { CreatePaymentLinkDeps } from './kloel-tool-dispatcher.create-payment-link.helpers';

type Stub = {
  prisma: { $transaction: jest.Mock };
  auditService: { logWithTx: jest.Mock };
  chatToolsService: { toolCreatePaymentLink: jest.Mock };
  opsAlert: { alertOnCriticalError: jest.Mock };
  logger: { warn: jest.Mock };
  applyReceipt: jest.Mock;
};

const makeStubDeps = (): { stub: Stub; deps: CreatePaymentLinkDeps } => {
  const txFn = jest.fn(async (callback: (tx: unknown) => Promise<void>) => {
    await callback({});
  });
  const stub: Stub = {
    prisma: { $transaction: txFn },
    auditService: { logWithTx: jest.fn().mockResolvedValue(undefined) },
    chatToolsService: {
      toolCreatePaymentLink: jest
        .fn()
        .mockResolvedValue({ success: true, paymentLink: { id: 'pl_1', url: 'https://x' } }),
    },
    opsAlert: { alertOnCriticalError: jest.fn() },
    logger: { warn: jest.fn() },
    applyReceipt: jest
      .fn()
      .mockImplementation((cap, _ws, _a, result) => ({ ...result, capabilityId: cap })),
  };
  const deps: CreatePaymentLinkDeps = {
    prisma: stub.prisma as unknown as PrismaService,
    auditService: stub.auditService as unknown as AuditService,
    chatToolsService: stub.chatToolsService as unknown as KloelChatToolsService,
    opsAlert: stub.opsAlert as unknown as OpsAlertService,
    logger: stub.logger,
    applyReceipt: stub.applyReceipt,
  };
  return { stub, deps };
};

describe('kloel-tool-dispatcher.create-payment-link.helpers', () => {
  it('forwards payment-link args + executionPath:"dispatcher" to chat tools', async () => {
    const { stub, deps } = makeStubDeps();
    await runCreatePaymentLink(
      deps,
      'ws1',
      { amount: 99.9, description: 'Plano', customerName: 'Daniel' },
      'u1',
    );
    expect(stub.chatToolsService.toolCreatePaymentLink).toHaveBeenCalledWith('ws1', {
      amount: 99.9,
      description: 'Plano',
      customerName: 'Daniel',
      executionPath: 'dispatcher',
    });
  });

  it('writes audit entry inside a transaction with ReadCommitted isolation', async () => {
    const { stub, deps } = makeStubDeps();
    await runCreatePaymentLink(deps, 'ws1', { amount: 10, description: 'x' });
    expect(stub.prisma.$transaction).toHaveBeenCalledTimes(1);
    const [, options] = stub.prisma.$transaction.mock.calls[0] as [
      unknown,
      { isolationLevel?: string },
    ];
    expect(options).toEqual({ isolationLevel: 'ReadCommitted' });
    expect(stub.auditService.logWithTx).toHaveBeenCalledTimes(1);
    const auditCall = stub.auditService.logWithTx.mock.calls[0]?.[1] as { workspaceId: string };
    expect(auditCall.workspaceId).toBe('ws1');
  });

  it('applies canonical receipt with capability id create_payment_link', async () => {
    const { stub, deps } = makeStubDeps();
    const result = await runCreatePaymentLink(deps, 'ws1', { amount: 10, description: 'x' }, 'u1');
    expect(stub.applyReceipt).toHaveBeenCalledWith(
      'create_payment_link',
      'ws1',
      expect.objectContaining({ amount: 10, description: 'x' }),
      expect.objectContaining({ success: true }),
      'u1',
      matchInstance(Number),
    );
    expect(result.capabilityId).toBe('create_payment_link');
  });

  it('never blocks payment-link delivery on audit failure', async () => {
    const { stub, deps } = makeStubDeps();
    stub.prisma.$transaction.mockRejectedValueOnce(new Error('db down'));
    const result = await runCreatePaymentLink(deps, 'ws1', { amount: 10, description: 'x' });
    expect(result.success).toBe(true);
    expect(stub.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Audit dispatch (payment link) failed'),
    );
    expect(stub.opsAlert.alertOnCriticalError).toHaveBeenCalledWith(
      matchInstance(Error),
      'KloelToolDispatcherService.sanitizeDetails',
    );
  });

  it('still applies receipt even when audit fails', async () => {
    const { stub, deps } = makeStubDeps();
    stub.prisma.$transaction.mockRejectedValueOnce(new Error('db down'));
    const result = await runCreatePaymentLink(deps, 'ws1', { amount: 10, description: 'x' });
    expect(stub.applyReceipt).toHaveBeenCalledTimes(1);
    expect(result.capabilityId).toBe('create_payment_link');
  });

  it('still applies receipt when opsAlert is undefined (no throw)', async () => {
    const { stub, deps } = makeStubDeps();
    deps.opsAlert = undefined;
    stub.prisma.$transaction.mockRejectedValueOnce(new Error('db down'));
    const result = await runCreatePaymentLink(deps, 'ws1', { amount: 10, description: 'x' });
    expect(result.success).toBe(true);
    expect(stub.applyReceipt).toHaveBeenCalledTimes(1);
  });
});
