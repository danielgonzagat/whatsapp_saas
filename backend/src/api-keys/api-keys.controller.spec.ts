import { NotFoundException } from '@nestjs/common';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';

describe('ApiKeysController', () => {
  let service: {
    list: jest.Mock;
    create: jest.Mock;
    rotate: jest.Mock;
    delete: jest.Mock;
  };
  let controller: ApiKeysController;

  beforeEach(() => {
    service = {
      list: jest.fn(),
      create: jest.fn(),
      rotate: jest.fn(),
      delete: jest.fn(),
    };
    controller = new ApiKeysController(service as never);
  });

  describe('list', () => {
    it('returns keys for the authenticated workspace', async () => {
      const keys = [
        { id: 'k1', name: 'Key 1', createdAt: new Date(), lastUsedAt: null, workspaceId: 'ws-1' },
      ];
      service.list.mockResolvedValue(keys);

      const req = { user: { workspaceId: 'ws-1' } } as never;
      const result = await controller.list(req);

      expect(result).toEqual(keys);
      expect(service.list).toHaveBeenCalledWith('ws-1');
    });

    it('returns empty array when workspace has no keys', async () => {
      service.list.mockResolvedValue([]);

      const req = { user: { workspaceId: 'ws-empty' } } as never;
      const result = await controller.list(req);

      expect(result).toEqual([]);
      expect(service.list).toHaveBeenCalledWith('ws-empty');
    });

    it('delegates to service and propagates errors', async () => {
      service.list.mockRejectedValue(new Error('DB unavailable'));

      const req = { user: { workspaceId: 'ws-1' } } as never;

      await expect(controller.list(req)).rejects.toThrow('DB unavailable');
    });
  });

  describe('create', () => {
    it('creates a key with the given name for the authenticated workspace', async () => {
      const created = {
        id: 'ak-1',
        name: 'Production',
        key: 'sk_live_abc123',
        workspaceId: 'ws-1',
        createdAt: new Date(),
        lastUsedAt: null,
      };
      service.create.mockResolvedValue(created);

      const req = { user: { workspaceId: 'ws-1' } } as never;
      const body = { name: 'Production' };
      const result = await controller.create(req, body);

      expect(result).toEqual(created);
      expect(service.create).toHaveBeenCalledWith('ws-1', 'Production');
    });

    it('propagates errors from service', async () => {
      service.create.mockRejectedValue(new Error('constraint violation'));

      const req = { user: { workspaceId: 'ws-1' } } as never;
      const body = { name: 'Test' };

      await expect(controller.create(req, body)).rejects.toThrow('constraint violation');
    });
  });

  describe('rotate', () => {
    it('rotates key for the given id and workspace', async () => {
      const rotated = {
        id: 'ak-1',
        name: 'Old Key',
        key: 'sk_live_newkey',
        workspaceId: 'ws-1',
        createdAt: new Date(),
        lastUsedAt: null,
      };
      service.rotate.mockResolvedValue(rotated);

      const req = { user: { workspaceId: 'ws-1' } } as never;
      const result = await controller.rotate(req, 'ak-1');

      expect(result).toEqual(rotated);
      expect(service.rotate).toHaveBeenCalledWith('ws-1', 'ak-1');
    });

    it('propagates NotFoundException when key does not exist', async () => {
      service.rotate.mockRejectedValue(new NotFoundException('API Key not found'));

      const req = { user: { workspaceId: 'ws-1' } } as never;

      await expect(controller.rotate(req, 'ak-nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('propagates NotFoundException when key belongs to other workspace', async () => {
      service.rotate.mockRejectedValue(new NotFoundException('API Key not found'));

      const req = { user: { workspaceId: 'ws-2' } } as never;

      await expect(controller.rotate(req, 'ak-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('deletes key for the given id and workspace', async () => {
      service.delete.mockResolvedValue({ count: 1 });

      const req = { user: { workspaceId: 'ws-1' } } as never;
      const result = await controller.delete(req, 'ak-1');

      expect(result).toEqual({ count: 1 });
      expect(service.delete).toHaveBeenCalledWith('ws-1', 'ak-1');
    });

    it('propagates NotFoundException when key does not exist', async () => {
      service.delete.mockRejectedValue(new NotFoundException('API Key not found'));

      const req = { user: { workspaceId: 'ws-1' } } as never;

      await expect(controller.delete(req, 'ak-nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('propagates NotFoundException when key belongs to other workspace', async () => {
      service.delete.mockRejectedValue(new NotFoundException('API Key not found'));

      const req = { user: { workspaceId: 'ws-2' } } as never;

      await expect(controller.delete(req, 'ak-1')).rejects.toThrow(NotFoundException);
    });
  });
});
