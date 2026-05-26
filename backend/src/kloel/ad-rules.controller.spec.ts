import { NotFoundException } from '@nestjs/common';
import { AdRulesController } from './ad-rules.controller';

describe('AdRulesController', () => {
  const findMany = jest.fn();
  const create = jest.fn();
  const findFirst = jest.fn();
  const updateMany = jest.fn();
  const deleteMany = jest.fn();
  const findFirstOrThrow = jest.fn();
  const auditLog = jest.fn();
  const opsAlert = jest.fn();

  let controller: AdRulesController;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new AdRulesController(
      {
        adRule: {
          findMany,
          create,
          findFirst,
          updateMany,
          deleteMany,
          findFirstOrThrow,
        },
      } as never,
      { log: auditLog } as never,
      { alertOnCriticalError: opsAlert } as never,
    );
  });

  const req = {
    user: { sub: 'user-1', workspaceId: 'ws-1' },
    headers: {},
  } as never;

  describe('list', () => {
    it('returns workspace-filtered rules ordered by createdAt desc (happy path)', async () => {
      const mockRules = [
        { id: 'rule-1', name: 'Rule 1', createdAt: new Date() },
        { id: 'rule-2', name: 'Rule 2', createdAt: new Date() },
      ];
      findMany.mockResolvedValue(mockRules);

      const result = await controller.list(req);

      expect(findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockRules);
    });

    it('propagates error when prisma rejects (no longer masked)', async () => {
      const error = new Error('Table does not exist');
      findMany.mockRejectedValue(error);

      await expect(controller.list(req)).rejects.toThrow('Table does not exist');
    });
  });

  describe('create', () => {
    it('creates a rule propagating workspaceId from req (identity propagated)', async () => {
      const body = {
        name: 'Test Rule',
        condition: 'clicks > 100',
        action: 'NOTIFY',
        alertMethod: 'EMAIL',
        alertTarget: 'admin@test.com',
      };
      const mockRule = { id: 'rule-3', workspaceId: 'ws-1', ...body };
      create.mockResolvedValue(mockRule);

      const result = await controller.create(req, body);

      expect(create).toHaveBeenCalledWith({
        data: {
          workspaceId: 'ws-1',
          name: 'Test Rule',
          condition: 'clicks > 100',
          action: 'NOTIFY',
          alertMethod: 'EMAIL',
          alertTarget: 'admin@test.com',
        },
      });
      expect(result).toEqual(mockRule);
    });

    it('omits optional alert fields when not provided', async () => {
      const body = { name: 'Min Rule', condition: 'true', action: 'LOG' };
      create.mockResolvedValue({ id: 'rule-4', ...body, workspaceId: 'ws-1' });

      await controller.create(req, body);

      const callData = create.mock.calls[0][0].data;
      expect(callData.alertMethod).toBeUndefined();
      expect(callData.alertTarget).toBeUndefined();
    });
  });

  describe('update', () => {
    it('updates a rule via updateMany and returns refreshed record (alternate route happy)', async () => {
      findFirst.mockResolvedValue({ id: 'rule-1', workspaceId: 'ws-1', name: 'Old' });
      updateMany.mockResolvedValue({ count: 1 });
      findFirstOrThrow.mockResolvedValue({ id: 'rule-1', name: 'Updated', active: true });

      const dto = { name: 'Updated', active: false };
      const result = await controller.update(req, 'rule-1', dto);

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'rule-1', workspaceId: 'ws-1' },
      });
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'rule-1', workspaceId: 'ws-1' },
        data: dto,
      });
      expect(result).toEqual({ id: 'rule-1', name: 'Updated', active: true });
    });

    it('throws NotFoundException when rule does not exist (error propagation)', async () => {
      findFirst.mockResolvedValue(null);

      await expect(controller.update(req, 'bad-id', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('audit-logs the deletion and returns success', async () => {
      findFirst.mockResolvedValue({ id: 'rule-1', name: 'To Delete' });
      deleteMany.mockResolvedValue({ count: 1 });

      const result = await controller.remove(req, 'rule-1');

      expect(auditLog).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        action: 'DELETE_RECORD',
        resource: 'AdRule',
        resourceId: 'rule-1',
        details: { deletedBy: 'user', name: 'To Delete' },
      });
      expect(deleteMany).toHaveBeenCalledWith({
        where: { id: 'rule-1', workspaceId: 'ws-1' },
      });
      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException when target rule not found', async () => {
      findFirst.mockResolvedValue(null);

      await expect(controller.remove(req, 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggle', () => {
    it('flips active flag and returns refreshed rule', async () => {
      findFirst.mockResolvedValue({ id: 'rule-1', active: true });
      updateMany.mockResolvedValue({ count: 1 });
      findFirstOrThrow.mockResolvedValue({ id: 'rule-1', active: false });

      const result = await controller.toggle(req, 'rule-1');

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'rule-1', workspaceId: 'ws-1' },
        data: { active: false },
      });
      expect(result).toEqual({ id: 'rule-1', active: false });
    });

    it('throws NotFoundException when toggle target missing', async () => {
      findFirst.mockResolvedValue(null);

      await expect(controller.toggle(req, 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
