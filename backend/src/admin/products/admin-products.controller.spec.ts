import { AdminRole } from '@prisma/client';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';
import { AdminProductsController } from './admin-products.controller';
import { AdminProductStateAction } from './dto/update-product-state.dto';

describe('AdminProductsController', () => {
  const products = {
    list: jest.fn(),
    detail: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
    updateState: jest.fn(),
  };

  let controller: AdminProductsController;

  const admin: AuthenticatedAdmin = {
    id: 'a-1',
    name: 'Owner Admin',
    email: 'owner@kloel.com',
    role: AdminRole.OWNER,
    sessionId: 's-1',
    scope: 'full',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminProductsController(products as never);
  });

  describe('GET /admin/products (list)', () => {
    it('calls service.list with all query params and returns result', async () => {
      const mockResult = { items: [], total: 0 };
      products.list.mockResolvedValue(mockResult);

      const result = await controller.list({
        search: 'kloel',
        status: 'APPROVED',
        workspaceId: 'ws-1',
        skip: 0,
        take: 10,
      });

      expect(products.list).toHaveBeenCalledWith({
        search: 'kloel',
        status: 'APPROVED',
        workspaceId: 'ws-1',
        skip: 0,
        take: 10,
      });
      expect(result).toEqual(mockResult);
    });

    it('calls service.list with empty query when no params provided', async () => {
      const mockResult = { items: [], total: 0 };
      products.list.mockResolvedValue(mockResult);

      await controller.list({});

      expect(products.list).toHaveBeenCalledWith({});
    });
  });

  describe('GET /admin/products/:productId (detail)', () => {
    it('calls service.detail with productId and returns the result', async () => {
      const mockDetail = {
        id: 'prod-1',
        workspaceId: 'ws-1',
        name: 'Test Product',
      };
      products.detail.mockResolvedValue(mockDetail);

      const result = await controller.detail('prod-1');

      expect(products.detail).toHaveBeenCalledWith('prod-1');
      expect(result).toEqual(mockDetail);
    });
  });

  describe('POST /admin/products/:productId/approve (approve)', () => {
    it('passes productId, admin.id, and optional dto fields to service.approve', async () => {
      products.approve.mockResolvedValue(undefined);

      const dto = { note: 'Looks good', checklist: ['images-ok'] };

      await controller.approve('prod-1', dto, admin);

      expect(products.approve).toHaveBeenCalledWith('prod-1', 'a-1', {
        note: 'Looks good',
        checklist: ['images-ok'],
      });
    });

    it('passes empty options when dto has no optional fields', async () => {
      products.approve.mockResolvedValue(undefined);

      await controller.approve('prod-1', {}, admin);

      expect(products.approve).toHaveBeenCalledWith('prod-1', 'a-1', {});
    });
  });

  describe('POST /admin/products/:productId/reject (reject)', () => {
    it('passes productId, admin.id, reason, and optional checklist to service.reject', async () => {
      products.reject.mockResolvedValue(undefined);

      const dto = { reason: 'Bad quality', checklist: ['images-missing'] };

      await controller.reject('prod-1', dto, admin);

      expect(products.reject).toHaveBeenCalledWith('prod-1', 'a-1', {
        reason: 'Bad quality',
        checklist: ['images-missing'],
      });
    });
  });

  describe('POST /admin/products/:productId/state (updateState)', () => {
    it('passes productId, admin.id, action, and note to service.updateState', async () => {
      products.updateState.mockResolvedValue(undefined);

      const dto = { action: AdminProductStateAction.PAUSE, note: 'Paused for review' };

      await controller.updateState('prod-1', dto, admin);

      expect(products.updateState).toHaveBeenCalledWith(
        'prod-1',
        'a-1',
        AdminProductStateAction.PAUSE,
        'Paused for review',
      );
    });
  });

  describe('error propagation', () => {
    it('propagates service.list rejection', async () => {
      const error = new Error('Database connection lost');
      products.list.mockRejectedValue(error);

      await expect(controller.list({})).rejects.toThrow('Database connection lost');
    });

    it('propagates service.detail rejection', async () => {
      const error = new Error('Product not found');
      products.detail.mockRejectedValue(error);

      await expect(controller.detail('prod-1')).rejects.toThrow('Product not found');
    });
  });
});
