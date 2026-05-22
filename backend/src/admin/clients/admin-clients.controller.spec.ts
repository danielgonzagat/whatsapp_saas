import { AdminRole } from '@prisma/client';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';
import { AdminClientsController } from './admin-clients.controller';

describe('AdminClientsController', () => {
  const clients = {
    list: jest.fn(),
  };

  let controller: AdminClientsController;

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
    controller = new AdminClientsController(clients as never);
  });

  describe('GET /admin/clients (list)', () => {
    it('lists clients with default filters and returns array with total', async () => {
      const mockResult = {
        items: [
          {
            workspaceId: 'ws-1',
            name: 'Alpha',
            ownerEmail: 'a@test.com',
            ownerName: 'A',
            createdAt: '2025-01-01T00:00:00.000Z',
            kycStatus: 'approved',
            gmvLast30dInCents: 5000,
            previousGmvLast30dInCents: 3000,
            growthRate: 0.67,
            lastSaleAt: '2025-06-01T00:00:00.000Z',
            productCount: 3,
            plan: 'PRO',
            subscriptionStatus: 'ACTIVE',
            customDomain: 'alpha.com',
            healthScore: 82,
          },
        ],
        total: 1,
      };
      clients.list.mockResolvedValue(mockResult);

      const result = await controller.list({});

      expect(clients.list).toHaveBeenCalledWith({});
      expect(result).toEqual(mockResult);
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.total).toBe(1);
    });

    it('propagates explicit filter args to service', async () => {
      const mockResult = { items: [], total: 0 };
      clients.list.mockResolvedValue(mockResult);

      await controller.list({
        search: 'kloel',
        kycStatus: 'approved',
        skip: 10,
        take: 25,
      });

      expect(clients.list).toHaveBeenCalledWith({
        search: 'kloel',
        kycStatus: 'approved',
        skip: 10,
        take: 25,
      });
    });

    it('propagates service rejection', async () => {
      const error = new Error('Database connection lost');
      clients.list.mockRejectedValue(error);

      await expect(controller.list({})).rejects.toThrow('Database connection lost');
    });

    it('provides admin id from CurrentAdmin context in service call', async () => {
      const mockResult = { items: [], total: 0 };
      clients.list.mockResolvedValue(mockResult);

      await controller.list({});

      expect(clients.list).toHaveBeenCalled();
      expect(admin.id).toBe('a-1');
    });
  });
});
