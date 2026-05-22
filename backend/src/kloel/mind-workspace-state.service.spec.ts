import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { MindWorkspaceStateService } from './mind-workspace-state.service';
import type { MindTick } from './mind.types';

describe('MindWorkspaceStateService', () => {
  let service: MindWorkspaceStateService;
  let prisma: {
    $queryRaw: jest.Mock;
    mindWorkspaceState: {
      updateMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn(),
      mindWorkspaceState: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MindWorkspaceStateService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(MindWorkspaceStateService);
  });

  describe('tryAcquireTickLease', () => {
    it('returns true when raw insert/upsert returns a row', async () => {
      prisma.$queryRaw.mockResolvedValue([{ workspaceId: 'ws-1' }]);
      await expect(service.tryAcquireTickLease('ws-1', 'owner-A')).resolves.toBe(true);
    });

    it('returns false when raw returns no rows (lease already held)', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(service.tryAcquireTickLease('ws-1', 'owner-A')).resolves.toBe(false);
    });
  });

  describe('releaseTickLease', () => {
    it('clears lease for the given owner', async () => {
      await service.releaseTickLease('ws-1', 'owner-A');
      expect(prisma.mindWorkspaceState.updateMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', tickLeaseOwner: 'owner-A' },
        data: { tickLeaseOwner: null, tickLeaseUntil: null },
      });
    });
  });

  describe('watermark', () => {
    it('returns the stored watermark when present', async () => {
      const stored = new Date('2026-01-01');
      prisma.mindWorkspaceState.findUnique.mockResolvedValue({ lastWatermark: stored });
      await expect(service.watermark('ws-1', new Date('2026-02-01'))).resolves.toBe(stored);
    });

    it('returns fallback when state row is missing', async () => {
      const fallback = new Date('2026-03-01');
      prisma.mindWorkspaceState.findUnique.mockResolvedValue(null);
      await expect(service.watermark('ws-1', fallback)).resolves.toBe(fallback);
    });
  });

  describe('recordSuccess', () => {
    it('upserts with tick stats and increments tickCount in the update branch', async () => {
      const tick: MindTick = {
        workspaceId: 'ws-1',
        durationMs: 42,
        perceived: 5,
        surpriseTotal: 1,
        decisionsMade: 2,
      } as MindTick;
      await service.recordSuccess({ tick, lastWatermark: new Date('2026-01-01') });
      const arg = prisma.mindWorkspaceState.upsert.mock.calls[0][0];
      expect(arg.where).toEqual({ workspaceId: 'ws-1' });
      expect(arg.update.tickCount).toEqual({ increment: 1 });
      expect(arg.create.tickCount).toBe(1);
    });
  });

  describe('recordFailure', () => {
    it('persists error message clipped to 500 chars + health=error', async () => {
      const longMsg = 'X'.repeat(1000);
      await service.recordFailure('ws-1', new Error(longMsg));
      const arg = prisma.mindWorkspaceState.upsert.mock.calls[0][0];
      expect(arg.update.lastError.length).toBe(500);
      expect(arg.update.health).toEqual({ status: 'error' });
    });

    it('stringifies non-Error values', async () => {
      await service.recordFailure('ws-1', 'crash code 5');
      const arg = prisma.mindWorkspaceState.upsert.mock.calls[0][0];
      expect(arg.update.lastError).toBe('crash code 5');
    });
  });
});
