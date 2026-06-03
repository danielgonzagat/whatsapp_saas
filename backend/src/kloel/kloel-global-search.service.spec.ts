import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { KloelThreadSearchService } from './kloel-thread-search.service';
import { PrismaService } from '../prisma/prisma.service';

const SERVICE_MODULE = './kloel-global-search.service';

type FindManyMock = jest.Mock<(args?: unknown) => Promise<unknown[]>>;
type ThreadSearchMock = jest.Mock<
  (workspaceId: string, rawQuery: string, rawLimit?: string) => Promise<unknown[]>
>;

type PrismaSearchMock = {
  product: { findMany: FindManyMock };
  contact: { findMany: FindManyMock };
  kloelSale: { findMany: FindManyMock };
  campaign: { findMany: FindManyMock };
  memberArea: { findMany: FindManyMock };
};

type SearchableService = {
  search: (
    workspaceId: string,
    rawQuery: string,
    rawLimit?: string,
  ) => Promise<{
    query: string;
    total: number;
    results: Array<{ id: string; type: string; href: string }>;
  }>;
};

type GlobalSearchConstructor = new (
  prisma: PrismaService,
  threadSearch: KloelThreadSearchService,
) => SearchableService;

async function loadServiceConstructor(): Promise<GlobalSearchConstructor> {
  const loaded: unknown = await import(SERVICE_MODULE);
  const module = loaded as { KloelGlobalSearchService: GlobalSearchConstructor };
  return module.KloelGlobalSearchService;
}

describe('KloelGlobalSearchService', () => {
  let prisma: PrismaSearchMock;
  let threads: { search: ThreadSearchMock };
  let service: SearchableService;

  beforeEach(async () => {
    prisma = {
      product: {
        findMany: jest.fn<(args?: unknown) => Promise<unknown[]>>().mockResolvedValue([
          {
            id: 'prod-1',
            name: 'PDRN real',
            description: 'Bioestimulador cadastrado no banco',
            category: 'Saude',
            sku: 'PDRN-REAL',
            status: 'APPROVED',
            updatedAt: new Date('2026-05-10T10:00:00.000Z'),
          },
        ]),
      },
      contact: {
        findMany: jest.fn<(args?: unknown) => Promise<unknown[]>>().mockResolvedValue([
          {
            id: 'contact-1',
            name: 'Ana Cliente',
            phone: '+5511999999999',
            email: 'ana@example.com',
            updatedAt: new Date('2026-05-11T10:00:00.000Z'),
          },
        ]),
      },
      kloelSale: {
        findMany: jest.fn<(args?: unknown) => Promise<unknown[]>>().mockResolvedValue([
          {
            id: 'sale-1',
            productName: 'PDRN real',
            leadPhone: '+5511999999999',
            amount: 197,
            status: 'paid',
            createdAt: new Date('2026-05-12T10:00:00.000Z'),
          },
        ]),
      },
      campaign: {
        findMany: jest.fn<(args?: unknown) => Promise<unknown[]>>().mockResolvedValue([
          {
            id: 'camp-1',
            name: 'Campanha PDRN',
            status: 'ACTIVE',
            updatedAt: new Date('2026-05-13T10:00:00.000Z'),
          },
        ]),
      },
      memberArea: {
        findMany: jest.fn<(args?: unknown) => Promise<unknown[]>>().mockResolvedValue([
          {
            id: 'area-1',
            name: 'Curso PDRN',
            slug: 'curso-pdrn',
            description: 'Area de membros real',
            updatedAt: new Date('2026-05-14T10:00:00.000Z'),
          },
        ]),
      },
    };
    threads = {
      search: jest
        .fn<(workspaceId: string, rawQuery: string, rawLimit?: string) => Promise<unknown[]>>()
        .mockResolvedValue([
          {
            id: 'thread-1',
            title: 'Conversa sobre PDRN',
            matchedContent: 'Cliente pediu detalhes do PDRN',
            updatedAt: new Date('2026-05-15T10:00:00.000Z'),
          },
        ]),
    };
    const Service = await loadServiceConstructor();
    service = new Service(
      prisma as unknown as PrismaService,
      threads as unknown as KloelThreadSearchService,
    );
  });

  it('returns no results for missing workspace or tiny query without touching the database', async () => {
    await expect(service.search('', 'pdrn')).resolves.toEqual({
      query: 'pdrn',
      total: 0,
      results: [],
    });
    await expect(service.search('ws-1', 'p')).resolves.toEqual({
      query: 'p',
      total: 0,
      results: [],
    });

    expect(threads.search).not.toHaveBeenCalled();
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
  });

  it('searches conversations, products, customers, sales, campaigns and courses under the workspace', async () => {
    const result = await service.search('ws-1', '  PDRN real  ', '30');

    expect(threads.search).toHaveBeenCalledWith('ws-1', 'PDRN real', '5');
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-1' }) }),
    );
    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-1' }) }),
    );
    expect(prisma.kloelSale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-1' }) }),
    );
    expect(prisma.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-1' }) }),
    );
    expect(prisma.memberArea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-1' }) }),
    );

    expect(result.query).toBe('PDRN real');
    expect(result.total).toBe(6);
    expect(result.results.map((item) => item.type)).toEqual([
      'conversation',
      'course',
      'campaign',
      'sale',
      'contact',
      'product',
    ]);
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'thread-1', href: '/chat?conversationId=thread-1' }),
        expect.objectContaining({ id: 'prod-1', href: '/products/prod-1' }),
        expect.objectContaining({ id: 'contact-1', href: '/inbox?phone=%2B5511999999999' }),
        expect.objectContaining({ id: 'sale-1', href: '/vendas/gestao-vendas?search=sale-1' }),
        expect.objectContaining({ id: 'camp-1', href: '/anuncios' }),
        expect.objectContaining({ id: 'area-1', href: '/produtos/area-membros?area=curso-pdrn' }),
      ]),
    );
  });
});
