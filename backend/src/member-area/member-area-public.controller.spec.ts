import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { MemberAreaPublicController } from './member-area-public.controller';

type PublicMemberAreaPrismaMock = {
  memberArea: {
    findFirst: jest.Mock;
  };
  memberEnrollment: {
    findFirst: jest.Mock;
  };
};

function buildController() {
  const prisma: PublicMemberAreaPrismaMock = {
    memberArea: {
      findFirst: jest.fn(),
    },
    memberEnrollment: {
      findFirst: jest.fn(),
    },
  };
  return {
    prisma,
    controller: new MemberAreaPublicController(prisma as never as PrismaService),
  };
}

describe('MemberAreaPublicController', () => {
  beforeEach(() => {
    process.env.MEMBER_AREA_ACCESS_SECRET = 'member-area-secret-for-tests';
  });

  afterEach(() => {
    delete process.env.MEMBER_AREA_ACCESS_SECRET;
  });

  it('returns public area metadata without lessons', async () => {
    const { controller, prisma } = buildController();
    prisma.memberArea.findFirst.mockResolvedValue({
      id: 'area-1',
      name: 'Curso',
      slug: 'curso',
      totalModules: 1,
      totalLessons: 1,
    });

    await expect(controller.getPublicArea('curso')).resolves.toEqual({
      area: expect.objectContaining({ id: 'area-1', slug: 'curso' }),
    });
  });

  it('issues a signed token only for an active enrolled email', async () => {
    const { controller, prisma } = buildController();
    prisma.memberEnrollment.findFirst.mockResolvedValue({
      id: 'enrollment-1',
      studentEmail: 'Buyer@Example.com',
      memberAreaId: 'area-1',
      memberArea: { id: 'area-1', name: 'Curso', slug: 'curso' },
    });

    const result = await controller.requestAccess('curso', { email: 'buyer@example.com' });

    expect(result.token).toContain('.');
    expect(prisma.memberEnrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'active',
          memberArea: { slug: 'curso', active: true },
        }),
      }),
    );
  });

  it('does not issue access for non-enrolled email', async () => {
    const { controller, prisma } = buildController();
    prisma.memberEnrollment.findFirst.mockResolvedValue(null);

    await expect(
      controller.requestAccess('curso', { email: 'buyer@example.com' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects malformed emails before querying enrollment data', async () => {
    const { controller, prisma } = buildController();

    await expect(
      controller.requestAccess('curso', { email: '!@!.!.!.!.!.!.!' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.memberEnrollment.findFirst).not.toHaveBeenCalled();
  });

  it('returns content only with a valid token for the enrollment', async () => {
    const { controller, prisma } = buildController();
    prisma.memberEnrollment.findFirst
      .mockResolvedValueOnce({
        id: 'enrollment-1',
        studentEmail: 'buyer@example.com',
        memberAreaId: 'area-1',
        memberArea: { id: 'area-1', name: 'Curso', slug: 'curso' },
      })
      .mockResolvedValueOnce({
        id: 'enrollment-1',
        studentName: 'Buyer',
        progress: 0,
        memberArea: {
          id: 'area-1',
          name: 'Curso',
          slug: 'curso',
          modules: [
            {
              id: 'module-1',
              name: 'Modulo 1',
              lessons: [{ id: 'lesson-1', name: 'Aula 1', type: 'VIDEO' }],
            },
          ],
        },
      });

    const access = await controller.requestAccess('curso', { email: 'buyer@example.com' });
    const content = await controller.getContent('curso', access.token);

    expect(content.area.modules[0].lessons[0]).toMatchObject({ id: 'lesson-1' });
  });

  it('rejects tampered tokens', async () => {
    const { controller } = buildController();

    await expect(controller.getContent('curso', 'bad.token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
