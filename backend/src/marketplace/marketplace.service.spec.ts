import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { MarketplaceService } from './marketplace.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

describe('MarketplaceService', () => {
  let service: MarketplaceService;
  let prisma: ReturnType<typeof createPartialPrismaMock>;

  beforeEach(async () => {
    prisma = createPartialPrismaMock({
      flowTemplate: ['findMany', 'findUnique', 'update'],
      flow: ['create'],
      product: ['findMany', 'count'],
      affiliateProduct: ['findFirst'],
      affiliateLink: ['findFirst'],
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [MarketplaceService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<MarketplaceService>(MarketplaceService);
  });

  describe('listTemplates', () => {
    it('returns public templates ordered by downloads desc, limited to 100', async () => {
      const templates = [
        { id: 't1', name: 'Popular', downloads: 50 },
        { id: 't2', name: 'New', downloads: 5 },
      ];
      prisma.flowTemplate.findMany.mockResolvedValue(templates);

      const result = await service.listTemplates();

      expect(result).toEqual(templates);
      expect(prisma.flowTemplate.findMany).toHaveBeenCalledWith({
        where: { isPublic: true },
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          downloads: true,
          isPublic: true,
          nodes: true,
          edges: true,
          createdAt: true,
        },
        orderBy: { downloads: 'desc' },
        take: 100,
      });
    });

    it('filters by category when provided', async () => {
      prisma.flowTemplate.findMany.mockResolvedValue([]);

      await service.listTemplates('onboarding');

      const anySelect: unknown = expect.anything();
      expect(prisma.flowTemplate.findMany).toHaveBeenCalledWith({
        where: { isPublic: true, category: 'onboarding' },
        select: anySelect,
        orderBy: { downloads: 'desc' },
        take: 100,
      });
    });

    it('returns empty array when no templates exist', async () => {
      prisma.flowTemplate.findMany.mockResolvedValue([]);

      const result = await service.listTemplates();

      expect(result).toEqual([]);
    });
  });

  describe('list', () => {
    it('returns products filtered by workspaceId and active=true', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      const result = await service.list('ws-1');

      expect(result).toEqual({ items: [], total: 0 });
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1', active: true },
        }),
      );
    });

    it('converts price to bigint and includes vendor (workspaceId)', async () => {
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'p1',
          name: 'Curso Avançado',
          description: 'Curso completo',
          price: 199.9,
          workspaceId: 'ws-vendor-1',
        },
        {
          id: 'p2',
          name: 'E-book',
          description: null,
          price: 49.99,
          workspaceId: 'ws-vendor-2',
        },
      ]);
      prisma.product.count.mockResolvedValue(2);

      const result = await service.list('ws-1');

      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        id: 'p1',
        name: 'Curso Avançado',
        description: 'Curso completo',
        price: 19990n,
        vendor: 'ws-vendor-1',
      });
      expect(result.items[1]).toEqual({
        id: 'p2',
        name: 'E-book',
        description: '',
        price: 4999n,
        vendor: 'ws-vendor-2',
      });
    });

    it('routes float prices through the canonical cents helper without binary-float drift', async () => {
      // 19.99 * 100 is 1998.9999999999998 in IEEE-754; the canonical helper
      // rounds it to exactly 1999 cents. An integer price round-trips cleanly.
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'p-drift',
          name: 'Drift Guard',
          description: 'edge',
          price: 19.99,
          workspaceId: 'ws-v',
        },
        {
          id: 'p-int',
          name: 'Round Number',
          description: 'clean',
          price: 100,
          workspaceId: 'ws-v',
        },
      ]);
      prisma.product.count.mockResolvedValue(2);

      const result = await service.list('ws-1');

      expect(result.items[0].price).toBe(1999n);
      expect(result.items[1].price).toBe(10000n);
      expect(typeof result.items[0].price).toBe('bigint');
    });

    it('filters by category when provided', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.list('ws-1', { category: 'cursos' });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1', active: true, category: 'cursos' },
        }),
      );
    });

    it('filters by search across name and description', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.list('ws-1', { search: 'python' });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId: 'ws-1',
            active: true,
            OR: [
              { name: { contains: 'python', mode: 'insensitive' } },
              { description: { contains: 'python', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('respects custom limit', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.list('ws-1', { limit: 5 });

      expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    });

    it('defaults limit to 20 when not specified', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.list('ws-1');

      expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }));
    });

    it('returns empty items when no products match', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      const result = await service.list('ws-1', { category: 'nonexistent' });

      expect(result).toEqual({ items: [], total: 0 });
    });
  });

  describe('installTemplate', () => {
    const workspaceId = 'ws-1';
    const templateId = 'tpl-1';
    const template = {
      id: templateId,
      name: 'Welcome Flow',
      description: 'Auto welcome',
      nodes: [],
      edges: [],
    };

    it('throws when template is not found', async () => {
      prisma.flowTemplate.findUnique.mockResolvedValue(null);

      await expect(service.installTemplate(workspaceId, templateId)).rejects.toThrow(
        'Template not found',
      );
    });

    it('creates a new flow from template and increments downloads', async () => {
      prisma.flowTemplate.findUnique.mockResolvedValue(template);
      const newFlow = { id: 'f-1', name: template.name };
      prisma.flow.create.mockResolvedValue(newFlow);
      prisma.flowTemplate.update.mockResolvedValue({ downloads: 1 });

      const result = await service.installTemplate(workspaceId, templateId);

      expect(prisma.flow.create).toHaveBeenCalledWith({
        data: {
          workspace: { connect: { id: workspaceId } },
          name: template.name,
          description: template.description,
          nodes: template.nodes,
          edges: template.edges,
          isActive: false,
          triggerType: 'MANUAL',
        },
      });
      expect(prisma.flowTemplate.update).toHaveBeenCalledWith({
        where: { id: templateId },
        data: { downloads: { increment: 1 } },
      });
      expect(result).toEqual(newFlow);
    });

    it('returns the created flow', async () => {
      prisma.flowTemplate.findUnique.mockResolvedValue(template);
      const newFlow = { id: 'f-2', name: 'My Flow' };
      prisma.flow.create.mockResolvedValue(newFlow);

      const result = await service.installTemplate(workspaceId, templateId);

      expect(result).toBe(newFlow);
    });
  });

  describe('getAffiliateLink', () => {
    it('rejects when productId is missing', async () => {
      await expect(service.getAffiliateLink('ws-1', { productId: '' })).rejects.toThrow(
        'productId é obrigatório',
      );
    });

    it('returns an honest zero baseline when the product is not on the marketplace', async () => {
      prisma.affiliateProduct.findFirst.mockResolvedValue(null);

      const result = await service.getAffiliateLink('ws-1', { productId: 'p-unknown' });

      expect(result).toEqual({
        success: true,
        code: null,
        path: null,
        clicks: 0,
        sales: 0,
      });
      expect(prisma.affiliateProduct.findFirst).toHaveBeenCalledWith({
        where: { productId: 'p-unknown' },
        select: { id: true },
      });
      // No product => no link lookup at all.
      expect(prisma.affiliateLink.findFirst).not.toHaveBeenCalled();
    });

    it('returns an honest zero baseline when this workspace holds no link', async () => {
      prisma.affiliateProduct.findFirst.mockResolvedValue({ id: 'ap-1' });
      prisma.affiliateLink.findFirst.mockResolvedValue(null);

      const result = await service.getAffiliateLink('ws-1', { productId: 'p-1' });

      expect(result).toEqual({
        success: true,
        code: null,
        path: null,
        clicks: 0,
        sales: 0,
      });
      expect(prisma.affiliateLink.findFirst).toHaveBeenCalledWith({
        where: { affiliateProductId: 'ap-1', affiliateWorkspaceId: 'ws-1' },
      });
    });

    it('returns the REAL persisted clicks/sales counters from the link row, not a hardcoded zero', async () => {
      prisma.affiliateProduct.findFirst.mockResolvedValue({ id: 'ap-1' });
      prisma.affiliateLink.findFirst.mockResolvedValue({
        code: 'abc123',
        clicks: 42,
        sales: 7,
      });

      const result = await service.getAffiliateLink('ws-1', { productId: 'p-1' });

      expect(result).toEqual({
        success: true,
        code: 'abc123',
        path: '/pay/abc123',
        clicks: 42,
        sales: 7,
      });
    });

    it('scopes the link lookup to the requesting workspace (workspace isolation)', async () => {
      prisma.affiliateProduct.findFirst.mockResolvedValue({ id: 'ap-1' });
      prisma.affiliateLink.findFirst.mockResolvedValue({
        code: 'xyz',
        clicks: 1,
        sales: 0,
      });

      await service.getAffiliateLink('ws-owner', { productId: 'p-1' });

      expect(prisma.affiliateLink.findFirst).toHaveBeenCalledWith({
        where: { affiliateProductId: 'ap-1', affiliateWorkspaceId: 'ws-owner' },
      });
    });
  });
});
