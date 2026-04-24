import { BadRequestException } from '@nestjs/common';
import type { AuditService } from '../audit/audit.service';
import type { AuthenticatedRequest } from '../common/interfaces';
import type { PrismaService } from '../prisma/prisma.service';
import { MemberAreaStatsService } from './member-area-stats.service';
import { MemberEnrollmentsController } from './member-enrollments.controller';

type MemberAreaPrismaMock = {
  memberArea: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  memberEnrollment: {
    findFirst: jest.Mock;
    create: jest.Mock;
    aggregate: jest.Mock;
  };
  memberModule: {
    count: jest.Mock;
  };
  memberLesson: {
    count: jest.Mock;
  };
};

type EnrollmentRequest = AuthenticatedRequest & {
  user: {
    workspaceId: string;
  };
};

type EnrollmentPayload = Parameters<MemberEnrollmentsController['enrollStudent']>[2];

describe('MemberEnrollmentsController', () => {
  let prisma: MemberAreaPrismaMock;
  let controller: MemberEnrollmentsController;

  beforeEach(() => {
    prisma = {
      memberArea: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
      memberEnrollment: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'enrollment-1' }),
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 1 },
          _avg: { progress: 0 },
        }),
      },
      memberModule: {
        count: jest.fn().mockResolvedValue(0),
      },
      memberLesson: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const typedPrisma = prisma as never as PrismaService;
    const stats = new MemberAreaStatsService(typedPrisma);
    const audit = { log: jest.fn() } as never as AuditService;

    controller = new MemberEnrollmentsController(typedPrisma, audit, stats);
  });

  it('supports legacy string enrollment fields without forwarding any casts', async () => {
    prisma.memberArea.findFirst.mockResolvedValue({ id: 'area-1', workspaceId: 'ws-1' });
    prisma.memberEnrollment.findFirst.mockResolvedValue(null);

    const request: EnrollmentRequest = {
      user: { workspaceId: 'ws-1' },
    } as EnrollmentRequest;
    const payload: EnrollmentPayload = {
      studentName: '',
      studentEmail: '',
      name: 'Aluno Legacy',
      email: 'legacy@kloel.test',
      phone: '5511999999999',
    };

    await controller.enrollStudent(request, 'area-1', payload);

    expect(prisma.memberEnrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentName: 'Aluno Legacy',
          studentEmail: 'legacy@kloel.test',
          studentPhone: '5511999999999',
        }),
      }),
    );
  });

  it('rejects malformed legacy enrollment fields instead of persisting object payloads', async () => {
    prisma.memberArea.findFirst.mockResolvedValue({ id: 'area-1', workspaceId: 'ws-1' });

    const request: EnrollmentRequest = {
      user: { workspaceId: 'ws-1' },
    } as EnrollmentRequest;
    const payload = {
      name: { broken: true },
      email: { broken: true },
      phone: { broken: true },
    } as never as EnrollmentPayload;

    await expect(controller.enrollStudent(request, 'area-1', payload)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prisma.memberEnrollment.create).not.toHaveBeenCalled();
  });

  it('keeps the stats recomputation workspace-bounded when enrolling a student', async () => {
    prisma.memberArea.findFirst.mockResolvedValue({ id: 'area-1', workspaceId: 'ws-1' });
    prisma.memberEnrollment.findFirst.mockResolvedValue(null);

    const request: EnrollmentRequest = {
      user: { workspaceId: 'ws-1' },
    } as EnrollmentRequest;
    const payload: EnrollmentPayload = {
      studentName: 'Aluno X',
      studentEmail: 'x@kloel.test',
    };

    await controller.enrollStudent(request, 'area-1', payload);

    expect(prisma.memberEnrollment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ memberAreaId: 'area-1', workspaceId: 'ws-1' }),
      }),
    );
  });
});
