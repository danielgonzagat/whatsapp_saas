import { NotFoundException } from '@nestjs/common';
import { WebinarController } from './webinar.controller';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

const prismaMock = createPartialPrismaMock({
  webinar: ['findMany', 'create', 'findFirst', 'findFirstOrThrow', 'updateMany', 'deleteMany'],
});

const auditServiceMock = {
  log: jest.fn(),
};

describe('WebinarController', () => {
  let controller: WebinarController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new WebinarController(prismaMock as never, auditServiceMock as never);
  });

  describe('list', () => {
    it('returns webinars filtered by workspaceId ordered by date desc', async () => {
      const webinars = [
        { id: 'w-1', title: 'Intro', date: new Date('2026-05-14') },
        { id: 'w-2', title: 'Deep Dive', date: new Date('2026-05-10') },
      ];
      prismaMock.webinar.findMany.mockResolvedValueOnce(webinars);

      const req = {
        user: { sub: 'u-1', workspaceId: 'ws-1', email: 'a@test.com', role: 'user' },
        headers: {},
      } as never;

      const result = await controller.list(req);

      expect(prismaMock.webinar.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        orderBy: { date: 'desc' },
      });
      expect(result).toEqual({ webinars, count: 2 });
    });

    it('returns empty when workspaceId is missing', async () => {
      const req = {
        user: { sub: 'u-1', email: 'a@test.com', role: 'user' },
        headers: {},
      } as never;

      const result = await controller.list(req);

      expect(prismaMock.webinar.findMany).not.toHaveBeenCalled();
      expect(result).toEqual({ webinars: [], count: 0 });
    });
  });

  describe('create', () => {
    it('creates a webinar and returns it with success', async () => {
      const created = { id: 'w-3', title: 'New Webinar', date: new Date('2026-06-01') };
      prismaMock.webinar.create.mockResolvedValueOnce(created);

      const req = {
        user: { sub: 'u-1', workspaceId: 'ws-1', email: 'a@test.com', role: 'user' },
        headers: {},
      } as never;

      const body = {
        title: 'New Webinar',
        url: 'https://example.com',
        date: '2026-06-01T00:00:00.000Z',
        description: 'A great webinar',
        productId: 'prod-1',
      };

      const result = await controller.create(req, body);

      expect(prismaMock.webinar.create).toHaveBeenCalledWith({
        data: {
          workspaceId: 'ws-1',
          title: 'New Webinar',
          url: 'https://example.com',
          date: new Date('2026-06-01T00:00:00.000Z'),
          description: 'A great webinar',
          productId: 'prod-1',
        },
      });
      expect(result).toEqual({ webinar: created, success: true });
    });

    it('throws NotFoundException when workspaceId is missing', async () => {
      const req = {
        user: { sub: 'u-1', email: 'a@test.com', role: 'user' },
        headers: {},
      } as never;

      const body = { title: 'Test', url: 'https://x.com', date: '2026-01-01' };

      await expect(controller.create(req, body)).rejects.toThrow(NotFoundException);
    });

    it('propagates prisma rejection', async () => {
      prismaMock.webinar.create.mockRejectedValueOnce(new Error('DB down'));

      const req = {
        user: { sub: 'u-1', workspaceId: 'ws-1', email: 'a@test.com', role: 'user' },
        headers: {},
      } as never;

      const body = { title: 'Test', url: 'https://x.com', date: '2026-01-01' };

      await expect(controller.create(req, body)).rejects.toThrow('DB down');
    });
  });

  describe('update', () => {
    it('updates an existing webinar and returns it with success', async () => {
      const existing = { id: 'w-1', title: 'Old', workspaceId: 'ws-1' };
      const updated = { id: 'w-1', title: 'New Title' };
      prismaMock.webinar.findFirst.mockResolvedValueOnce(existing);
      prismaMock.webinar.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.webinar.findFirstOrThrow.mockResolvedValueOnce(updated);

      const req = {
        user: { sub: 'u-1', workspaceId: 'ws-1', email: 'a@test.com', role: 'user' },
        headers: {},
      } as never;

      const body = { title: 'New Title' };

      const result = await controller.update(req, 'w-1', body);

      expect(prismaMock.webinar.findFirst).toHaveBeenCalledWith({
        where: { id: 'w-1', workspaceId: 'ws-1' },
      });
      expect(prismaMock.webinar.updateMany).toHaveBeenCalledWith({
        where: { id: 'w-1', workspaceId: 'ws-1' },
        data: { title: 'New Title' },
      });
      expect(prismaMock.webinar.findFirstOrThrow).toHaveBeenCalledWith({
        where: { id: 'w-1', workspaceId: 'ws-1' },
      });
      expect(result).toEqual({ webinar: updated, success: true });
    });

    it('throws NotFoundException when webinar not found', async () => {
      prismaMock.webinar.findFirst.mockResolvedValueOnce(null);

      const req = {
        user: { sub: 'u-1', workspaceId: 'ws-1', email: 'a@test.com', role: 'user' },
        headers: {},
      } as never;

      await expect(controller.update(req, 'w-missing', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes a webinar and audits the deletion', async () => {
      const existing = { id: 'w-1', title: 'To Delete', workspaceId: 'ws-1' };
      prismaMock.webinar.findFirst.mockResolvedValueOnce(existing);
      prismaMock.webinar.deleteMany.mockResolvedValueOnce({ count: 1 });
      auditServiceMock.log.mockResolvedValueOnce(undefined);

      const req = {
        user: { sub: 'u-1', workspaceId: 'ws-1', email: 'a@test.com', role: 'user' },
        headers: {},
      } as never;

      const result = await controller.remove(req, 'w-1');

      expect(prismaMock.webinar.findFirst).toHaveBeenCalledWith({
        where: { id: 'w-1', workspaceId: 'ws-1' },
      });
      expect(auditServiceMock.log).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        action: 'DELETE_RECORD',
        resource: 'Webinar',
        resourceId: 'w-1',
        details: { deletedBy: 'user', title: 'To Delete' },
      });
      expect(prismaMock.webinar.deleteMany).toHaveBeenCalledWith({
        where: { id: 'w-1', workspaceId: 'ws-1' },
      });
      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException when webinar not found', async () => {
      prismaMock.webinar.findFirst.mockResolvedValueOnce(null);

      const req = {
        user: { sub: 'u-1', workspaceId: 'ws-1', email: 'a@test.com', role: 'user' },
        headers: {},
      } as never;

      await expect(controller.remove(req, 'w-missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
