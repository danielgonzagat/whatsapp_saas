import { Test, type TestingModule } from '@nestjs/testing';

import { FinancialAlertService } from '../../common/financial-alert.service';
import { PrismaService } from '../../prisma/prisma.service';

import { ConnectLedgerMaturationService } from './connect-ledger-maturation.service';
import { LedgerService } from './ledger.service';

async function buildService({
  prisma,
  ledger,
  financialAlert,
}: {
  prisma: Record<string, unknown>;
  ledger: Record<string, unknown>;
  financialAlert: Record<string, unknown>;
}) {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      ConnectLedgerMaturationService,
      { provide: PrismaService, useValue: prisma },
      { provide: LedgerService, useValue: ledger },
      { provide: FinancialAlertService, useValue: financialAlert },
    ],
  }).compile();

  return moduleRef.get(ConnectLedgerMaturationService);
}

describe('ConnectLedgerMaturationService.matureDueEntries', () => {
  it('promotes only due CREDIT_PENDING entries', async () => {
    const prisma = {
      connectLedgerEntry: {
        findMany: jest.fn().mockResolvedValue([{ id: 'cle_due_1' }, { id: 'cle_due_2' }]),
      },
      adminAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      },
    };
    const ledger = {
      moveFromPendingToAvailable: jest.fn().mockResolvedValue(undefined),
    };
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };
    const service = await buildService({ prisma, ledger, financialAlert });

    const now = new Date('2026-05-02T12:00:00Z');
    const result = await service.matureDueEntries(now);

    expect(prisma.connectLedgerEntry.findMany).toHaveBeenCalledWith({
      where: {
        type: 'CREDIT_PENDING',
        matured: false,
        scheduledFor: { lte: now },
      },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
      take: 500,
    });
    expect(ledger.moveFromPendingToAvailable).toHaveBeenCalledTimes(2);
    expect(ledger.moveFromPendingToAvailable).toHaveBeenNthCalledWith(1, 'cle_due_1');
    expect(ledger.moveFromPendingToAvailable).toHaveBeenNthCalledWith(2, 'cle_due_2');
    expect(result).toEqual({ scanned: 2, matured: 2, failed: 0 });
    expect(financialAlert.reconciliationAlert).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('continues after individual entry failures and reports them', async () => {
    const prisma = {
      connectLedgerEntry: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'cle_ok_1' }, { id: 'cle_fail_1' }, { id: 'cle_ok_2' }]),
      },
      adminAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      },
    };
    const ledger = {
      moveFromPendingToAvailable: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(undefined),
    };
    const financialAlert = {
      reconciliationAlert: jest.fn(),
    };
    const service = await buildService({ prisma, ledger, financialAlert });

    const result = await service.matureDueEntries(new Date('2026-05-03T00:00:00Z'));

    expect(ledger.moveFromPendingToAvailable).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ scanned: 3, matured: 2, failed: 1 });
    expect(financialAlert.reconciliationAlert).toHaveBeenCalledWith(
      'connect ledger maturation failed',
      {
        details: {
          entryId: 'cle_fail_1',
          error: 'boom',
        },
      },
    );
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'system.connect.maturation_failed',
        entityType: 'connect_ledger_entry',
        entityId: 'cle_fail_1',
        details: {
          entryId: 'cle_fail_1',
          error: 'boom',
        },
      },
    });
  });
});
