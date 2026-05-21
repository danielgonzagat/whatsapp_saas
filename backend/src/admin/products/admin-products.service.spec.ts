import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { AdminProductsService } from './admin-products.service';
import { AdminProductStateAction } from './dto/update-product-state.dto';

const mockListAdminProducts = jest.fn<Promise<unknown>, unknown[]>();
const mockGetAdminProductDetail = jest.fn<Promise<unknown>, unknown[]>();

jest.mock('./queries/list-products.query', () => ({
  listAdminProducts: (...args: unknown[]) => mockListAdminProducts(...args),
}));
jest.mock('./queries/detail-product.query', () => ({
  getAdminProductDetail: (...args: unknown[]) => mockGetAdminProductDetail(...args),
}));

describe('AdminProductsService', () => {
  let service: AdminProductsService;

  const actorId = 'admin_1';
  const productId = 'prod_1';

  const mockProductFindUnique = jest.fn<Promise<unknown>, unknown[]>();
  const mockProductUpdateMany = jest.fn<Promise<unknown>, unknown[]>();

  const prismaMock = {
    product: {
      findUnique: mockProductFindUnique,
      updateMany: mockProductUpdateMany,
    },
  };

  const mockAudit = {
    append: jest.fn<Promise<void>, unknown[]>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockListAdminProducts.mockResolvedValue({ items: [], total: 0 });
    mockGetAdminProductDetail.mockResolvedValue(null);
    mockProductFindUnique.mockResolvedValue(null);
    mockProductUpdateMany.mockResolvedValue({ count: 1 });
    mockAudit.append.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminProductsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AdminAuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get(AdminProductsService);
  });

  describe('list', () => {
    it('delegates to listAdminProducts query', async () => {
      const rows = [{ id: 'p1', name: 'Test', status: 'PENDING' }];
      mockListAdminProducts.mockResolvedValueOnce({ items: rows, total: 1 });

      const result = await service.list({ skip: 0, take: 10 });

      expect(result).toEqual({ items: rows, total: 1 });
      expect(mockListAdminProducts).toHaveBeenCalledWith(prismaMock, { skip: 0, take: 10 });
    });
  });

  describe('detail', () => {
    it('returns product detail when found', async () => {
      const detail = { id: productId, name: 'Product', status: 'PENDING' };
      mockGetAdminProductDetail.mockResolvedValueOnce(detail);

      const result = await service.detail(productId);

      expect(result).toEqual(detail);
      expect(mockGetAdminProductDetail).toHaveBeenCalledWith(prismaMock, productId);
    });

    it('throws when product not found', async () => {
      mockGetAdminProductDetail.mockResolvedValueOnce(null);

      await expect(service.detail('unknown')).rejects.toThrow(/n.o encontrado/i);
    });
  });

  describe('approve', () => {
    const product = { id: productId, workspaceId: 'ws_1', status: 'PENDING', name: 'Prod' };

    beforeEach(() => {
      mockProductFindUnique.mockResolvedValue(product);
    });

    it('marks product APPROVED and writes audit', async () => {
      await service.approve(productId, actorId, { note: 'ok' });

      expect(mockProductUpdateMany).toHaveBeenCalledWith({
        where: { id: productId, workspaceId: 'ws_1' },
        data: { status: 'APPROVED', active: true },
      });
      expect(mockAudit.append).toHaveBeenCalledWith(
        expect.objectContaining({
          adminUserId: actorId,
          action: 'admin.products.approved',
          entityType: 'Product',
          entityId: productId,
          details: expect.objectContaining({ note: 'ok' }),
        }),
      );
    });

    it('throws when product not found', async () => {
      mockProductFindUnique.mockResolvedValueOnce(null);

      await expect(service.approve('unknown', actorId)).rejects.toThrow(/n.o encontrado/i);
    });
  });

  describe('reject', () => {
    const product = { id: productId, workspaceId: 'ws_1', status: 'PENDING', name: 'Prod' };

    beforeEach(() => {
      mockProductFindUnique.mockResolvedValue(product);
    });

    it('marks product REJECTED and writes audit', async () => {
      await service.reject(productId, actorId, { reason: 'bad', checklist: ['doc'] });

      expect(mockProductUpdateMany).toHaveBeenCalledWith({
        where: { id: productId, workspaceId: 'ws_1' },
        data: { status: 'REJECTED', active: false },
      });
      expect(mockAudit.append).toHaveBeenCalledWith(
        expect.objectContaining({
          adminUserId: actorId,
          action: 'admin.products.rejected',
          entityType: 'Product',
          entityId: productId,
          details: expect.objectContaining({ reason: 'bad' }),
        }),
      );
    });

    it('throws when product not found', async () => {
      mockProductFindUnique.mockResolvedValueOnce(null);

      await expect(service.reject('unknown', actorId, { reason: 'bad' })).rejects.toThrow(
        /n.o encontrado/i,
      );
    });
  });

  describe('updateState', () => {
    const product = {
      id: productId,
      workspaceId: 'ws_1',
      status: 'APPROVED',
      name: 'Prod',
      active: true,
    };

    beforeEach(() => {
      mockProductFindUnique.mockResolvedValue(product);
    });

    it('makes active=false status=PAUSED and writes audit on PAUSE', async () => {
      await service.updateState(productId, actorId, AdminProductStateAction.PAUSE, 'pause note');

      expect(mockProductUpdateMany).toHaveBeenCalledWith({
        where: { id: productId, workspaceId: 'ws_1' },
        data: { active: false, status: 'PAUSED' },
      });
      expect(mockAudit.append).toHaveBeenCalledWith(
        expect.objectContaining({
          adminUserId: actorId,
          action: 'admin.products.paused',
          entityType: 'Product',
          entityId: productId,
          details: expect.objectContaining({ note: 'pause note' }),
        }),
      );
    });

    it('makes active=true status=APPROVED on REACTIVATE', async () => {
      await service.updateState(productId, actorId, AdminProductStateAction.REACTIVATE);

      expect(mockProductUpdateMany).toHaveBeenCalledWith({
        where: { id: productId, workspaceId: 'ws_1' },
        data: { active: true, status: 'APPROVED' },
      });
      expect(mockAudit.append).toHaveBeenCalledWith(
        expect.objectContaining({
          adminUserId: actorId,
          action: 'admin.products.reactivated',
          entityType: 'Product',
          entityId: productId,
        }),
      );
    });

    it('throws when product not found', async () => {
      mockProductFindUnique.mockResolvedValueOnce(null);

      await expect(
        service.updateState('unknown', actorId, AdminProductStateAction.PAUSE),
      ).rejects.toThrow(/n.o encontrado/i);
    });
  });
});
