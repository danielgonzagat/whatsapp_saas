import { BadRequestException } from '@nestjs/common';
import { MemberAreaController } from './member-area.controller';

describe('MemberAreaController', () => {
  let prisma: any;
  let controller: MemberAreaController;

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

    controller = new MemberAreaController(prisma, {
      log: jest.fn(),
    } as any);
  });

  it('supports legacy string enrollment fields without forwarding any casts', async () => {
    prisma.memberArea.findFirst.mockResolvedValue({ id: 'area-1', workspaceId: 'ws-1' });
    prisma.memberEnrollment.findFirst.mockResolvedValue(null);

    await controller.enrollStudent(
      {
        user: { workspaceId: 'ws-1' },
      } as any,
      'area-1',
      {
        studentName: '',
        studentEmail: '',
        name: 'Aluno Legacy',
        email: 'legacy@kloel.test',
        phone: '5511999999999',
      } as any,
    );

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

    await expect(
      controller.enrollStudent(
        {
          user: { workspaceId: 'ws-1' },
        } as any,
        'area-1',
        {
          name: { broken: true },
          email: { broken: true },
          phone: { broken: true },
        } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.memberEnrollment.create).not.toHaveBeenCalled();
  });
});
