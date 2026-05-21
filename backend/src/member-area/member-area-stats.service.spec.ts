import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { MemberAreaStatsService } from './member-area-stats.service';

describe('MemberAreaStatsService', () => {
  let service: MemberAreaStatsService;
  let prisma: {
    memberEnrollment: { aggregate: jest.Mock };
    memberModule: { count: jest.Mock };
    memberLesson: { count: jest.Mock };
    memberArea: { updateMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      memberEnrollment: {
        aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 }, _avg: { progress: null } }),
      },
      memberModule: { count: jest.fn().mockResolvedValue(0) },
      memberLesson: { count: jest.fn().mockResolvedValue(0) },
      memberArea: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemberAreaStatsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(MemberAreaStatsService);
  });

  it('recalculates totals from aggregate + counts', async () => {
    prisma.memberEnrollment.aggregate.mockResolvedValue({
      _count: { _all: 42 },
      _avg: { progress: 0.73 },
    });
    prisma.memberModule.count.mockResolvedValue(5);
    prisma.memberLesson.count.mockResolvedValue(20);

    await service.recalculate('area-1', 'ws-1');

    expect(prisma.memberArea.updateMany).toHaveBeenCalledWith({
      where: { id: 'area-1', workspaceId: 'ws-1' },
      data: {
        totalStudents: 42,
        avgCompletion: 0.73,
        totalModules: 5,
        totalLessons: 20,
      },
    });
  });

  it('enforces workspace isolation on enrollment aggregate AND on update', async () => {
    await service.recalculate('area-1', 'ws-tenant-A');
    expect(prisma.memberEnrollment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { memberAreaId: 'area-1', workspaceId: 'ws-tenant-A' },
      }),
    );
    expect(prisma.memberArea.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'area-1', workspaceId: 'ws-tenant-A' },
      }),
    );
  });

  it('coerces null avg progress to 0 (Prisma returns null when no rows)', async () => {
    prisma.memberEnrollment.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _avg: { progress: null },
    });
    await service.recalculate('area-empty', 'ws-1');
    expect(prisma.memberArea.updateMany.mock.calls[0][0].data.avgCompletion).toBe(0);
  });
});
