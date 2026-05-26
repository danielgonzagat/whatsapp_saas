import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { MindBanditService } from './mind-bandit.service';

describe('MindBanditService', () => {
  let service: MindBanditService;
  let prisma: {
    mindBanditArm: {
      upsert: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      mindBanditArm: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MindBanditService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(MindBanditService);
  });

  describe('register', () => {
    it('upserts each arm as active with workspace scoping', async () => {
      await service.register({
        workspaceId: 'ws-1',
        decisionType: 'subject_line',
        arms: ['a', 'b', 'c'],
      });
      expect(prisma.mindBanditArm.upsert).toHaveBeenCalledTimes(3);
      const firstArg = prisma.mindBanditArm.upsert.mock.calls[0][0];
      expect(firstArg.where.workspaceId_decisionType_arm.workspaceId).toBe('ws-1');
      expect(firstArg.create.isActive).toBe(true);
    });
  });

  describe('choose', () => {
    it('returns null when no active arms exist', async () => {
      prisma.mindBanditArm.findMany.mockResolvedValue([]);
      await expect(service.choose('ws-1', 'subject')).resolves.toBeNull();
    });

    it('picks an arm and increments its pulls counter', async () => {
      prisma.mindBanditArm.findMany.mockResolvedValue([
        { id: 'arm-1', arm: 'A', alpha: 5, beta: 2, pulls: 10, wins: 4 },
        { id: 'arm-2', arm: 'B', alpha: 1, beta: 1, pulls: 0, wins: 0 },
      ]);
      const choice = await service.choose('ws-1', 'subject');
      expect(choice?.arm).toMatch(/^(A|B)$/);
      expect(prisma.mindBanditArm.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { pulls: { increment: 1 } },
        }),
      );
    });

    it('only considers active arms (workspace-scoped query)', async () => {
      prisma.mindBanditArm.findMany.mockResolvedValue([]);
      await service.choose('ws-tenant-A', 'subject');
      expect(prisma.mindBanditArm.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-tenant-A', decisionType: 'subject', isActive: true },
      });
    });
  });

  describe('recordOutcome', () => {
    it('increments alpha and wins when outcome=1', async () => {
      prisma.mindBanditArm.findMany.mockResolvedValue([]);
      await service.recordOutcome({
        workspaceId: 'ws-1',
        decisionType: 'subject',
        arm: 'A',
        outcome: 1,
      });
      expect(prisma.mindBanditArm.update).toHaveBeenCalledWith({
        where: {
          workspaceId_decisionType_arm: {
            workspaceId: 'ws-1',
            decisionType: 'subject',
            arm: 'A',
          },
        },
        data: {
          alpha: { increment: 1 },
          beta: { increment: 0 },
          wins: { increment: 1 },
        },
      });
    });

    it('increments beta when outcome=0', async () => {
      prisma.mindBanditArm.findMany.mockResolvedValue([]);
      await service.recordOutcome({
        workspaceId: 'ws-1',
        decisionType: 'subject',
        arm: 'B',
        outcome: 0,
      });
      const data = prisma.mindBanditArm.update.mock.calls[0][0].data;
      expect(data.beta).toEqual({ increment: 1 });
      expect(data.wins).toEqual({ increment: 0 });
    });
  });

  describe('status', () => {
    it('computes trafficShare and overall lift', async () => {
      prisma.mindBanditArm.findMany.mockResolvedValue([
        { arm: 'A', isActive: true, pulls: 80, wins: 40, alpha: 40, beta: 40 },
        { arm: 'B', isActive: true, pulls: 20, wins: 16, alpha: 16, beta: 4 },
      ]);
      const result = await service.status('ws-1', 'subject');
      expect(result.totalPulls).toBe(100);
      const armA = result.arms.find((a) => a.arm === 'A');
      const armB = result.arms.find((a) => a.arm === 'B');
      expect(armA?.trafficShare).toBeCloseTo(0.8);
      expect(armB?.trafficShare).toBeCloseTo(0.2);
      // overall mean = 56/100 = 0.56, top recommendation should have lift > 0
      expect(typeof result.lift).toBe('number');
      expect(result.recommendation).toBeTruthy();
    });

    it('returns lift=0 when no pulls', async () => {
      prisma.mindBanditArm.findMany.mockResolvedValue([
        { arm: 'A', isActive: true, pulls: 0, wins: 0, alpha: 1, beta: 1 },
      ]);
      const result = await service.status('ws-1', 'subject');
      expect(result.lift).toBe(0);
      expect(result.totalPulls).toBe(0);
    });

    it('returns null recommendation when there are no arms', async () => {
      prisma.mindBanditArm.findMany.mockResolvedValue([]);
      const result = await service.status('ws-1', 'subject');
      expect(result.recommendation).toBeNull();
    });
  });
});
