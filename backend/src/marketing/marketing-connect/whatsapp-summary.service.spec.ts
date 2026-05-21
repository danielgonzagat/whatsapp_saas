import { WhatsAppSummaryService } from './whatsapp-summary.service';
import { createPartialPrismaMock } from '../../../test/helpers/prisma.mock';

describe('WhatsAppSummaryService', () => {
  let prismaMock: ReturnType<typeof createPartialPrismaMock>;
  let workspaceFindUnique: jest.Mock;
  let kloelSaleGroupBy: jest.Mock;
  let service: WhatsAppSummaryService;

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock = createPartialPrismaMock({
      workspace: ['findUnique'],
      kloelSale: ['groupBy'],
    });
    workspaceFindUnique = prismaMock.workspace.findUnique;
    kloelSaleGroupBy = prismaMock.kloelSale.groupBy;
    service = new WhatsAppSummaryService(prismaMock as never);
  });

  it('returns summary with sales mapped per product when workspace has selectedProducts and groupBy returns aggregates', async () => {
    workspaceFindUnique.mockResolvedValue({
      providerSettings: {
        whatsappLifecycle: {
          selectedProducts: [
            { id: 'p1', name: 'Produto A', price: 100, type: 'own' },
            { id: 'p2', name: 'Produto B', price: 200, type: 'affiliate', affiliateComm: 30 },
          ],
        },
      },
    });
    kloelSaleGroupBy.mockResolvedValue([
      { productName: 'Produto A', _count: { id: 5 }, _sum: { amount: 500 } },
      { productName: 'Produto B', _count: { id: 3 }, _sum: { amount: 600 } },
    ]);

    const result = await service.getSummary('ws-1');

    expect(result.configured).toBe(true);
    expect(result.selectedProducts).toHaveLength(2);
    expect(result.selectedProducts[0]).toMatchObject({ name: 'Produto A', salesCount: 5, revenue: 500 });
    expect(result.selectedProducts[1]).toMatchObject({ name: 'Produto B', salesCount: 3, revenue: 600 });
    expect(kloelSaleGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'ws-1', status: 'paid', productName: { in: ['Produto A', 'Produto B'] } },
      }),
    );
  });

  it('returns empty summary when selectedProducts is empty, without calling groupBy', async () => {
    workspaceFindUnique.mockResolvedValue({
      providerSettings: {
        whatsappLifecycle: { selectedProducts: [] },
      },
    });

    const result = await service.getSummary('ws-1');

    expect(kloelSaleGroupBy).not.toHaveBeenCalled();
    expect(result.configured).toBe(false);
    expect(result.selectedProducts).toHaveLength(0);
  });

  it('returns safe default when workspace is not found, without crashing', async () => {
    workspaceFindUnique.mockResolvedValue(null);

    const result = await service.getSummary('ws-1');

    expect(result.configured).toBe(false);
    expect(result.selectedProducts).toHaveLength(0);
    expect(result.sessionName).toBe('ws-1');
  });

  it('assigns salesCount 0 and revenue 0 for products whose names are missing from groupBy results', async () => {
    workspaceFindUnique.mockResolvedValue({
      providerSettings: {
        whatsappLifecycle: {
          selectedProducts: [
            { id: 'p1', name: 'Produto A', price: 100, type: 'own' },
            { id: 'p2', name: 'Produto B', price: 200, type: 'own' },
          ],
        },
      },
    });
    kloelSaleGroupBy.mockResolvedValue([
      { productName: 'Produto A', _count: { id: 5 }, _sum: { amount: 500 } },
    ]);

    const result = await service.getSummary('ws-1');

    expect(result.selectedProducts).toHaveLength(2);
    expect(result.selectedProducts[0]).toMatchObject({ name: 'Produto A', salesCount: 5, revenue: 500 });
    expect(result.selectedProducts[1]).toMatchObject({ name: 'Produto B', salesCount: 0, revenue: 0 });
  });

  it('scopes findUnique and groupBy calls to the provided workspaceId', async () => {
    workspaceFindUnique.mockResolvedValue({
      providerSettings: {
        whatsappLifecycle: {
          selectedProducts: [{ id: 'p1', name: 'Produto A', price: 100, type: 'own' }],
        },
      },
    });
    kloelSaleGroupBy.mockResolvedValue([
      { productName: 'Produto A', _count: { id: 2 }, _sum: { amount: 200 } },
    ]);

    await service.getSummary('ws-tenant-42');

    expect(workspaceFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ws-tenant-42' } }),
    );
    expect(kloelSaleGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-tenant-42' }) }),
    );
  });
});
