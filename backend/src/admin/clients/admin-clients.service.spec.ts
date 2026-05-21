import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminClientsService } from './admin-clients.service';

const mockBuildRow = jest.fn();

jest.mock('./admin-client-row.builder', () => ({
  buildAdminClientRow: (...args: unknown[]) => mockBuildRow(...args),
}));

describe('AdminClientsService', () => {
  let service: AdminClientsService;

  const workspaceRecord = {
    id: 'ws_1',
    name: 'Test WS',
    customDomain: null,
    createdAt: new Date('2026-01-01'),
    agents: [{ email: 'admin@test.com', name: 'Admin', kycStatus: 'approved' }],
    subscription: { plan: 'free', status: 'active' },
  };

  const mockWorkspaceFindMany = jest.fn();
  const mockWorkspaceCount = jest.fn();
  const mockOrderGroupBy = jest.fn();
  const mockProductGroupBy = jest.fn();

  const prismaMock = {
    workspace: {
      findMany: mockWorkspaceFindMany,
      count: mockWorkspaceCount,
    },
    checkoutOrder: {
      groupBy: mockOrderGroupBy,
    },
    product: {
      groupBy: mockProductGroupBy,
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockBuildRow.mockImplementation((ws: { id: string; name: string }) => ({
      workspaceId: ws.id,
      name: ws.name,
    }));

    mockWorkspaceFindMany.mockResolvedValue([workspaceRecord]);
    mockWorkspaceCount.mockResolvedValue(1);
    mockOrderGroupBy.mockResolvedValue([]);
    mockProductGroupBy.mockResolvedValue([]);

    prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => {
      return Promise.all(ops);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminClientsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get(AdminClientsService);
  });

  describe('list', () => {
    it('returns items and total from transaction', async () => {
      const result = await service.list({});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].workspaceId).toBe('ws_1');
      expect(result.total).toBe(1);
    });

    it('returns empty items when no workspaces match', async () => {
      mockWorkspaceFindMany.mockResolvedValueOnce([]);
      mockWorkspaceCount.mockResolvedValueOnce(0);

      const result = await service.list({});

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('applies default pagination with skip=0 and take=50', async () => {
      await service.list({});

      expect(mockWorkspaceFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 50,
        }),
      );
    });

    it('applies custom skip and take', async () => {
      await service.list({ skip: 10, take: 20 });

      expect(mockWorkspaceFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 20,
        }),
      );
    });

    it('caps take at MAX_TAKE of 100', async () => {
      await service.list({ take: 500 });

      expect(mockWorkspaceFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        }),
      );
    });

    it('applies search filter', async () => {
      await service.list({ search: 'test' });

      expect(mockWorkspaceFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ name: { contains: 'test', mode: 'insensitive' } }]),
          }),
        }),
      );
    });

    it('returns items even when metric maps are empty', async () => {
      const result = await service.list({});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].workspaceId).toBe('ws_1');
    });
  });
});
