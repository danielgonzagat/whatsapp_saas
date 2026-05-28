import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import { MemberModulesController } from './member-modules.controller';

describe('MemberModulesController', () => {
  let auditService: { log: jest.Mock };
  let prisma: ReturnType<typeof createPartialPrismaMock>;

  let controller: MemberModulesController;

  const mockReq = (overrides: Partial<{ sub: string; workspaceId: string }> = {}) =>
    ({
      user: {
        sub: overrides.sub ?? 'u-1',
        workspaceId: overrides.workspaceId ?? 'ws-1',
      },
      headers: {},
    }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPartialPrismaMock({
      memberArea: ['findFirst', 'updateMany'],
      memberModule: ['findFirst', 'create', 'update', 'delete', 'count'],
      memberLesson: ['findFirst', 'create', 'update', 'delete', 'count'],
    });
    auditService = { log: jest.fn() };
    controller = new MemberModulesController(
      prisma as PrismaService,
      auditService as AuditService,
    );
  });

  describe('createModule', () => {
    it('creates a module inside a member area', async () => {
      prisma.memberArea.findFirst.mockResolvedValue({
        id: 'area-1',
        workspaceId: 'ws-1',
      });
      prisma.memberModule.create.mockResolvedValue({
        id: 'mod-1',
        name: 'Module 1',
        memberAreaId: 'area-1',
      });
      prisma.memberModule.count.mockResolvedValue(1);
      prisma.memberArea.updateMany.mockResolvedValue({ count: 1 });

      const dto = { name: 'Module 1', description: 'Desc', position: 0 };
      const result = await controller.createModule(mockReq(), 'area-1', dto);

      expect(result.success).toBe(true);
      expect(result.module.name).toBe('Module 1');
    });

    it('throws NotFoundException when member area not found', async () => {
      prisma.memberArea.findFirst.mockResolvedValue(null);
      await expect(
        controller.createModule(mockReq(), 'nonexistent', { name: 'M' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns existing module on duplicate name (idempotent)', async () => {
      prisma.memberArea.findFirst.mockResolvedValue({
        id: 'area-1',
        workspaceId: 'ws-1',
      });
      prisma.memberModule.findFirst.mockResolvedValue({
        id: 'mod-old',
        name: 'Duplicate',
      });

      const result = await controller.createModule(mockReq(), 'area-1', {
        name: 'Duplicate',
      });
      expect(result).toHaveProperty('data');
      expect(result.data.name).toBe('Duplicate');
    });
  });

  describe('updateModule', () => {
    it('updates a module', async () => {
      prisma.memberArea.findFirst.mockResolvedValue({
        id: 'area-1',
        workspaceId: 'ws-1',
      });
      prisma.memberModule.findFirst.mockResolvedValue({
        id: 'mod-1',
        memberAreaId: 'area-1',
      });
      prisma.memberModule.update.mockResolvedValue({
        id: 'mod-1',
        name: 'Updated',
        memberAreaId: 'area-1',
      });

      const result = await controller.updateModule(mockReq(), 'area-1', 'mod-1', {
        name: 'Updated',
      });
      expect(result.success).toBe(true);
      expect(result.module.name).toBe('Updated');
    });

    it('throws NotFoundException when area not found', async () => {
      prisma.memberArea.findFirst.mockResolvedValue(null);
      await expect(controller.updateModule(mockReq(), 'nonexistent', 'mod-1', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when module not found', async () => {
      prisma.memberArea.findFirst.mockResolvedValue({
        id: 'area-1',
        workspaceId: 'ws-1',
      });
      prisma.memberModule.findFirst.mockResolvedValue(null);
      await expect(controller.updateModule(mockReq(), 'area-1', 'nonexistent', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteModule', () => {
    it('deletes a module and updates counts', async () => {
      prisma.memberArea.findFirst.mockResolvedValue({
        id: 'area-1',
        workspaceId: 'ws-1',
      });
      prisma.memberModule.findFirst.mockResolvedValue({
        id: 'mod-1',
        memberAreaId: 'area-1',
      });
      prisma.memberModule.delete.mockResolvedValue({ id: 'mod-1' });
      prisma.memberModule.count.mockResolvedValue(0);
      prisma.memberLesson.count.mockResolvedValue(0);
      prisma.memberArea.updateMany.mockResolvedValue({ count: 1 });

      const result = await controller.deleteModule(mockReq(), 'area-1', 'mod-1');
      expect(result.success).toBe(true);
      expect(result.deleted).toBe('mod-1');
    });

    it('throws NotFoundException when module not found', async () => {
      prisma.memberArea.findFirst.mockResolvedValue({
        id: 'area-1',
        workspaceId: 'ws-1',
      });
      prisma.memberModule.findFirst.mockResolvedValue(null);
      await expect(controller.deleteModule(mockReq(), 'area-1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createLesson', () => {
    it('creates a lesson inside a module', async () => {
      prisma.memberArea.findFirst.mockResolvedValue({
        id: 'area-1',
        workspaceId: 'ws-1',
      });
      prisma.memberModule.findFirst.mockResolvedValue({
        id: 'mod-1',
        memberAreaId: 'area-1',
      });
      prisma.memberLesson.create.mockResolvedValue({
        id: 'les-1',
        name: 'Lesson 1',
        moduleId: 'mod-1',
      });
      prisma.memberLesson.count.mockResolvedValue(1);
      prisma.memberArea.updateMany.mockResolvedValue({ count: 1 });

      const result = await controller.createLesson(mockReq(), 'area-1', 'mod-1', {
        name: 'Lesson 1',
        type: 'VIDEO',
      });
      expect(result.success).toBe(true);
      expect(result.lesson.name).toBe('Lesson 1');
    });

    it('throws NotFoundException when area not found', async () => {
      prisma.memberArea.findFirst.mockResolvedValue(null);
      await expect(
        controller.createLesson(mockReq(), 'nonexistent', 'mod-1', { name: 'L' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when module not found in area', async () => {
      prisma.memberArea.findFirst.mockResolvedValue({
        id: 'area-1',
        workspaceId: 'ws-1',
      });
      prisma.memberModule.findFirst.mockResolvedValue(null);
      await expect(
        controller.createLesson(mockReq(), 'area-1', 'nonexistent', { name: 'L' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateLesson', () => {
    it('updates a lesson', async () => {
      prisma.memberArea.findFirst.mockResolvedValue({
        id: 'area-1',
        workspaceId: 'ws-1',
      });
      prisma.memberLesson.findFirst.mockResolvedValue({
        id: 'les-1',
        name: 'Old',
        moduleId: 'mod-1',
      });
      prisma.memberLesson.update.mockResolvedValue({
        id: 'les-1',
        name: 'Updated',
        moduleId: 'mod-1',
      });

      const result = await controller.updateLesson(mockReq(), 'area-1', 'les-1', {
        name: 'Updated',
      });
      expect(result.success).toBe(true);
      expect(result.lesson.name).toBe('Updated');
    });

    it('throws NotFoundException when lesson not found', async () => {
      prisma.memberArea.findFirst.mockResolvedValue({
        id: 'area-1',
        workspaceId: 'ws-1',
      });
      prisma.memberLesson.findFirst.mockResolvedValue(null);
      await expect(controller.updateLesson(mockReq(), 'area-1', 'nonexistent', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteLesson', () => {
    it('deletes a lesson and updates count', async () => {
      prisma.memberArea.findFirst.mockResolvedValue({
        id: 'area-1',
        workspaceId: 'ws-1',
      });
      prisma.memberLesson.findFirst.mockResolvedValue({
        id: 'les-1',
        name: 'Lesson',
        moduleId: 'mod-1',
      });
      prisma.memberLesson.delete.mockResolvedValue({ id: 'les-1' });
      prisma.memberLesson.count.mockResolvedValue(0);
      prisma.memberArea.updateMany.mockResolvedValue({ count: 1 });

      const result = await controller.deleteLesson(mockReq(), 'area-1', 'les-1');
      expect(result.success).toBe(true);
      expect(result.deleted).toBe('les-1');
    });

    it('throws NotFoundException when lesson not found', async () => {
      prisma.memberArea.findFirst.mockResolvedValue({
        id: 'area-1',
        workspaceId: 'ws-1',
      });
      prisma.memberLesson.findFirst.mockResolvedValue(null);
      await expect(controller.deleteLesson(mockReq(), 'area-1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('parseReleaseDate', () => {
    it('rejects invalid date strings via createModule', async () => {
      prisma.memberArea.findFirst.mockResolvedValue({
        id: 'area-1',
        workspaceId: 'ws-1',
      });
      await expect(
        controller.createModule(mockReq(), 'area-1', {
          name: 'M',
          releaseDate: 'not-a-date',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
