import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MemberAreasController } from './member-areas.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';
import type { AuthenticatedRequest } from '../common/interfaces';

const mockSerializeArea = jest.fn(
  (_req: unknown, area: Record<string, unknown> | null | undefined) => area,
);
jest.mock('./member-area.helpers', () => {
  const actual = jest.requireActual<typeof import('./member-area.helpers')>(
    './member-area.helpers',
  );
  return {
    ...actual,
    serializeArea: (...args: unknown[]) => mockSerializeArea(...args),
  };
});

function req(overrides?: Partial<AuthenticatedRequest['user']>): AuthenticatedRequest {
  return {
    user: { workspaceId: 'ws_test', id: 'agent_1', ...overrides } as AuthenticatedRequest['user'],
  } as AuthenticatedRequest;
}

function makeDto(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    name: 'Test Area',
    description: 'A test area',
    type: 'COURSE',
    template: 'academy',
    ...overrides,
  };
}

describe('MemberAreasController', () => {
  let controller: MemberAreasController;
  let prisma: ReturnType<typeof createPartialPrismaMock>;
  let audit: { log: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = createPartialPrismaMock({
      memberArea: ['findMany', 'findFirst', 'count', 'create', 'updateMany', 'deleteMany'],
    });

    audit = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const opsAlert = {
      alertOnCriticalError: jest.fn().mockResolvedValue(undefined),
    } as unknown as OpsAlertService;

    controller = new MemberAreasController(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      opsAlert,
    );

    mockSerializeArea.mockImplementation(
      (_req: unknown, area: Record<string, unknown> | null | undefined) => area,
    );
  });

  describe('listAreas', () => {
    it('returns areas with count', async() => {
      const raw = [{ id: 'a1', name: 'Area 1', modules: [] }];
      prisma.memberArea.findMany.mockResolvedValue(raw);

      const result = await controller.listAreas(req());

      expect(prisma.memberArea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws_test' } }),
      );
      expect(result).toEqual({ areas: raw, count: 1 });
    });

    it('filters by type', async() => {
      prisma.memberArea.findMany.mockResolvedValue([]);

      await controller.listAreas(req(), 'COMMUNITY');

      expect(prisma.memberArea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws_test', type: 'COMMUNITY' },
        }),
      );
    });

    it('filters active=true', async() => {
      prisma.memberArea.findMany.mockResolvedValue([]);

      await controller.listAreas(req(), undefined, 'true');

      expect(prisma.memberArea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws_test', active: true },
        }),
      );
    });

    it('filters active=false', async() => {
      prisma.memberArea.findMany.mockResolvedValue([]);

      await controller.listAreas(req(), undefined, 'false');

      expect(prisma.memberArea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws_test', active: false },
        }),
      );
    });

    it('adds OR search clause', async() => {
      prisma.memberArea.findMany.mockResolvedValue([]);

      await controller.listAreas(req(), undefined, undefined, 'python');

      expect(prisma.memberArea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId: 'ws_test',
            OR: [
              { name: { contains: 'python', mode: 'insensitive' } },
              { description: { contains: 'python', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('combines type + active + search', async() => {
      prisma.memberArea.findMany.mockResolvedValue([]);

      await controller.listAreas(req(), 'COURSE', 'true', 'js');

      const callArgs = prisma.memberArea.findMany.mock.calls[0][0];
      expect(callArgs.where.type).toBe('COURSE');
      expect(callArgs.where.active).toBe(true);
      expect(callArgs.where.OR).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('aggregates area counts and stats', async() => {
      prisma.memberArea.count.mockResolvedValueOnce(10);
      prisma.memberArea.count.mockResolvedValueOnce(7);
      prisma.memberArea.findMany.mockResolvedValue([
        { totalStudents: 100, avgCompletion: 0.8, totalModules: 5, totalLessons: 20 },
        { totalStudents: 50, avgCompletion: 0.6, totalModules: 3, totalLessons: 12 },
      ]);

      const result = await controller.getStats(req());

      expect(result).toEqual({
        totalAreas: 10,
        activeAreas: 7,
        totalStudents: 150,
        avgCompletion: 0.7,
        totalModules: 8,
        totalLessons: 32,
      });
    });

    it('returns zeroed stats for empty workspace', async() => {
      prisma.memberArea.count.mockResolvedValueOnce(0);
      prisma.memberArea.count.mockResolvedValueOnce(0);
      prisma.memberArea.findMany.mockResolvedValue([]);

      const result = await controller.getStats(req());

      expect(result).toEqual({
        totalAreas: 0,
        activeAreas: 0,
        totalStudents: 0,
        avgCompletion: 0,
        totalModules: 0,
        totalLessons: 0,
      });
    });

    it('scopes all queries to workspaceId', async() => {
      prisma.memberArea.count.mockResolvedValue(0);
      prisma.memberArea.findMany.mockResolvedValue([]);

      await controller.getStats(req());

      expect(prisma.memberArea.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws_test' } }),
      );
      expect(prisma.memberArea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws_test' } }),
      );
    });
  });

  describe('getArea', () => {
    it('returns area wrapped in { area }', async() => {
      const raw = { id: 'a1', name: 'Area 1', modules: [] };
      prisma.memberArea.findFirst.mockResolvedValue(raw);

      const result = await controller.getArea(req(), 'a1');

      expect(prisma.memberArea.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'a1', workspaceId: 'ws_test' } }),
      );
      expect(result).toEqual({ area: raw });
    });

    it('throws NotFoundException when area missing', async() => {
      prisma.memberArea.findFirst.mockResolvedValue(null);

      await expect(controller.getArea(req(), 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createArea', () => {
    it('creates an area and returns it', async() => {
      const created = { id: 'new_a', name: 'Test Area', slug: 'test-area-xxx' };
      prisma.memberArea.create.mockResolvedValue(created);

      const result = await controller.createArea(req(), makeDto() as never);

      expect(prisma.memberArea.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'ws_test',
            name: 'Test Area',
            type: 'COURSE',
            template: 'academy',
          }),
        }),
      );
      expect(result).toEqual({ area: created, success: true });
    });

    it('auto-generates slug when not provided', async() => {
      prisma.memberArea.create.mockResolvedValue({ id: 'a1', name: 'My Course' });

      await controller.createArea(req(), makeDto({ slug: undefined }) as never);

      const createArgs = prisma.memberArea.create.mock.calls[0][0];
      expect(createArgs.data.slug).toBeTruthy();
      expect(typeof createArgs.data.slug).toBe('string');
    });

    it('preserves explicit slug when provided', async() => {
      prisma.memberArea.create.mockResolvedValue({ id: 'a1', slug: 'my-custom-slug' });

      await controller.createArea(req(), makeDto({ slug: 'my-custom-slug' }) as never);

      const createArgs = prisma.memberArea.create.mock.calls[0][0];
      expect(createArgs.data.slug).toBe('my-custom-slug');
    });

    it('sets feature flags with defaults', async() => {
      prisma.memberArea.create.mockResolvedValue({});

      await controller.createArea(req(), makeDto() as never);

      const createArgs = prisma.memberArea.create.mock.calls[0][0];
      expect(createArgs.data.certificates).toBe(true);
      expect(createArgs.data.quizzes).toBe(true);
      expect(createArgs.data.community).toBe(true);
      expect(createArgs.data.gamification).toBe(true);
      expect(createArgs.data.progressTrack).toBe(true);
      expect(createArgs.data.downloads).toBe(true);
      expect(createArgs.data.comments).toBe(true);
    });

    it('throws BadRequestException on P2002 unique constraint', async() => {
      const p2002Error = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      prisma.memberArea.create.mockRejectedValue(p2002Error);

      await expect(controller.createArea(req(), makeDto() as never)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.createArea(req(), makeDto() as never)).rejects.toThrow(
        /slug already exists/i,
      );
    });

    it('wraps generic errors in BadRequestException', async() => {
      prisma.memberArea.create.mockRejectedValue(new Error('Database down'));

      await expect(controller.createArea(req(), makeDto() as never)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateArea', () => {
    const existing = { id: 'a1', name: 'Old', workspaceId: 'ws_test' };

    beforeEach(() => {
      prisma.memberArea.findFirst
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({ ...existing, name: 'Updated' });
      prisma.memberArea.updateMany.mockResolvedValue({ count: 1 });
    });

    it('updates and returns updated area', async() => {
      const result = await controller.updateArea(req(), 'a1', { name: 'Updated' } as never);

      expect(prisma.memberArea.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'a1', workspaceId: 'ws_test' },
          data: expect.objectContaining({ name: 'Updated' }),
        }),
      );
      expect(result).toEqual({
        area: expect.objectContaining({ name: 'Updated' }),
        success: true,
      });
    });

    it('throws NotFoundException when area missing', async() => {
      prisma.memberArea.findFirst.mockReset();
      prisma.memberArea.findFirst.mockResolvedValue(null);

      await expect(
        controller.updateArea(req(), 'missing', { name: 'X' } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('only updates provided fields', async() => {
      await controller.updateArea(req(), 'a1', { name: 'New Name' } as never);

      const updateData = prisma.memberArea.updateMany.mock.calls[0][0].data;
      expect(updateData).toHaveProperty('name', 'New Name');
      expect(updateData).not.toHaveProperty('type');
      expect(updateData).not.toHaveProperty('slug');
    });
  });

  describe('deleteArea', () => {
    const existing = { id: 'a1', name: 'To Delete', workspaceId: 'ws_test' };

    it('deletes area and logs audit', async() => {
      prisma.memberArea.findFirst.mockResolvedValue(existing);
      prisma.memberArea.deleteMany.mockResolvedValue({ count: 1 });

      const result = await controller.deleteArea(req(), 'a1');

      expect(audit.log).toHaveBeenCalledWith({
        workspaceId: 'ws_test',
        action: 'DELETE_RECORD',
        resource: 'MemberArea',
        resourceId: 'a1',
        details: { deletedBy: 'user', name: 'To Delete' },
      });
      expect(prisma.memberArea.deleteMany).toHaveBeenCalledWith({
        where: { id: 'a1', workspaceId: 'ws_test' },
      });
      expect(result).toEqual({ success: true, deleted: 'a1' });
    });

    it('throws NotFoundException when area does not exist', async() => {
      prisma.memberArea.findFirst.mockResolvedValue(null);

      await expect(controller.deleteArea(req(), 'missing')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when deleteMany returns count 0 (race)', async() => {
      prisma.memberArea.findFirst.mockResolvedValue(existing);
      prisma.memberArea.deleteMany.mockResolvedValue({ count: 0 });

      await expect(controller.deleteArea(req(), 'a1')).rejects.toThrow(NotFoundException);
    });

    it('scopes deletion to workspaceId', async() => {
      prisma.memberArea.findFirst.mockResolvedValue(existing);
      prisma.memberArea.deleteMany.mockResolvedValue({ count: 1 });

      await controller.deleteArea(req({ workspaceId: 'ws_other' }), 'a1');

      expect(prisma.memberArea.deleteMany).toHaveBeenCalledWith({
        where: { id: 'a1', workspaceId: 'ws_other' },
      });
    });
  });
});
