import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductUrlController } from './product-url.controller';

jest.mock('./helpers/common.helpers', () => ({
  ensureWorkspaceProductAccess: jest.fn().mockResolvedValue(undefined),
  getWorkspaceId: jest.fn().mockReturnValue('ws-1'),
  removeUndefined: jest.fn().mockImplementation((v: Record<string, unknown>) => v),
}));

describe('ProductUrlController', () => {
  const productUrlFindMany = jest.fn();
  const productUrlCreate = jest.fn();
  const productUrlFindFirst = jest.fn();
  const productUrlUpdate = jest.fn();
  const productUrlDelete = jest.fn();
  const auditLog = jest.fn();

  const prisma = {
    productUrl: {
      findMany: productUrlFindMany,
      create: productUrlCreate,
      findFirst: productUrlFindFirst,
      update: productUrlUpdate,
      delete: productUrlDelete,
    },
  } as never;

  const auditService = {
    log: auditLog,
  } as never;

  let controller: ProductUrlController;

  const req = {
    user: { sub: 'u-1', workspaceId: 'ws-1' },
    headers: {},
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ProductUrlController(prisma, auditService);
  });

  describe('list', () => {
    it('returns product URLs ordered by createdAt desc', async () => {
      const urls = [
        { id: 'url-1', description: 'Landing page', url: 'https://example.com' },
        { id: 'url-2', description: 'Blog', url: 'https://example.com/blog' },
      ];
      productUrlFindMany.mockResolvedValue(urls);

      const result = await controller.list('prod-1', req);

      expect(result).toEqual(urls);
      expect(productUrlFindMany).toHaveBeenCalledWith({
        where: { productId: 'prod-1' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });

    it('returns empty array when no URLs exist', async () => {
      productUrlFindMany.mockResolvedValue([]);

      const result = await controller.list('prod-1', req);

      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('creates a product URL with all optional fields', async () => {
      const body = {
        description: 'Site oficial',
        url: 'https://site.com',
        isPrivate: true,
        active: false,
        aiLearning: true,
        aiTopics: 'vendas',
        chatEnabled: true,
      };
      const created = { id: 'url-1', productId: 'prod-1', ...body };
      productUrlCreate.mockResolvedValue(created);

      const result = await controller.create('prod-1', body, req);

      expect(result).toEqual(created);
      expect(productUrlCreate).toHaveBeenCalledTimes(1);
      const callData = productUrlCreate.mock.calls[0][0].data;
      expect(callData.description).toBe('Site oficial');
      expect(callData.url).toBe('https://site.com');
      expect(callData.isPrivate).toBe(true);
      expect(callData.active).toBe(false);
      expect(callData.aiLearning).toBe(true);
      expect(callData.chatEnabled).toBe(true);
    });

    it('throws BadRequestException when description is missing', async () => {
      await expect(controller.create('prod-1', { url: 'https://x.com' }, req)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when url is missing', async () => {
      await expect(controller.create('prod-1', { description: 'No url' }, req)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('updates an existing product URL', async () => {
      productUrlFindFirst.mockResolvedValue({ id: 'url-1', productId: 'prod-1' });
      const updated = { id: 'url-1', description: 'Updated', url: 'https://new.com' };
      productUrlUpdate.mockResolvedValue(updated);

      const result = await controller.update(
        'prod-1',
        'url-1',
        { description: 'Updated', url: 'https://new.com' },
        req,
      );

      expect(result).toEqual(updated);
      expect(productUrlUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'url-1' } }),
      );
    });

    it('throws NotFoundException when URL does not exist', async () => {
      productUrlFindFirst.mockResolvedValue(null);

      await expect(
        controller.update('prod-1', 'url-missing', { description: 'X' }, req),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('deletes a product URL and logs the audit entry', async () => {
      productUrlFindFirst.mockResolvedValue({ id: 'url-1', productId: 'prod-1' });
      productUrlDelete.mockResolvedValue({ id: 'url-1' });
      auditLog.mockResolvedValue(undefined);

      const result = await controller.delete('prod-1', 'url-1', req);

      expect(result).toEqual({ id: 'url-1' });
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELETE_RECORD',
          resource: 'ProductUrl',
          resourceId: 'url-1',
        }),
      );
    });

    it('throws NotFoundException when URL to delete does not exist', async () => {
      productUrlFindFirst.mockResolvedValue(null);

      await expect(controller.delete('prod-1', 'url-missing', req)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('identity propagation', () => {
    it('passes workspaceId from req.user into getWorkspaceId and ensureWorkspaceProductAccess', async () => {
      const { ensureWorkspaceProductAccess, getWorkspaceId } = jest.requireMock(
        './helpers/common.helpers',
      );
      productUrlFindMany.mockResolvedValue([]);

      const customReq = {
        user: { sub: 'u-99', workspaceId: 'ws-99' },
        headers: {},
      } as never;

      await controller.list('prod-1', customReq);

      expect(getWorkspaceId).toHaveBeenCalledWith(customReq);
      expect(ensureWorkspaceProductAccess).toHaveBeenCalledWith(prisma, 'prod-1', 'ws-1');
    });
  });
});
