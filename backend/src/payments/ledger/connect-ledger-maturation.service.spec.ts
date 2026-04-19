import { Test, type TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { ConnectLedgerMaturationService } from './connect-ledger-maturation.service';
import { LedgerService } from './ledger.service';

async function buildService({
  prisma,
  ledger,
}: {
  prisma: Record<string, unknown>;
  ledger: Record<string, unknown>;
}) {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      ConnectLedgerMaturationService,
      { provide: PrismaService, useValue: prisma },
      { provide: LedgerService, useValue: ledger },
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
    };
    const ledger = {
      moveFromPendingToAvailable: jest.fn().mockResolvedValue(undefined),
    };
    const service = await buildService({ prisma, ledger });

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
  });

  it('continues after individual entry failures and reports them', async () => {
    const prisma = {
      connectLedgerEntry: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'cle_ok_1' }, { id: 'cle_fail_1' }, { id: 'cle_ok_2' }]),
      },
    };
    const ledger = {
      moveFromPendingToAvailable: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(undefined),
    };
    const service = await buildService({ prisma, ledger });

    const result = await service.matureDueEntries(new Date('2026-05-03T00:00:00Z'));

    expect(ledger.moveFromPendingToAvailable).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ scanned: 3, matured: 2, failed: 1 });
  });
});
