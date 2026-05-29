import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductUrlService } from './product-url.service';

type ProductFindFirst = jest.Mock<Promise<{ id: string } | null>, [unknown]>;
type UrlFindMany = jest.Mock<Promise<Array<Record<string, unknown>>>, [unknown]>;

describe('ProductUrlService.list', () => {
  let service: ProductUrlService;
  let productFindFirst: ProductFindFirst;
  let urlFindMany: UrlFindMany;

  const WS = 'ws-1';
  const PRODUCT_ID = 'prod-1';

  beforeEach(() => {
    productFindFirst = jest.fn<Promise<{ id: string } | null>, [unknown]>().mockResolvedValue({
      id: PRODUCT_ID,
    });
    urlFindMany = jest
      .fn<Promise<Array<Record<string, unknown>>>, [unknown]>()
      .mockResolvedValue([
        { id: 'url-1', productId: PRODUCT_ID, url: 'https://x.com', description: 'Vendas' },
      ]);

    const prisma = {
      product: { findFirst: productFindFirst },
      productUrl: { findMany: urlFindMany },
    } as unknown as PrismaService;
    const audit = { log: jest.fn() } as unknown as AuditService;

    service = new ProductUrlService(prisma, audit);
  });

  it('lists URLs for a product owned by the workspace (happy path)', async () => {
    const result = await service.list(WS, { productId: PRODUCT_ID });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    const findManyArg = urlFindMany.mock.calls[0]![0] as {
      where: { productId: string; product: { workspaceId: string } };
    };
    expect(findManyArg.where.productId).toBe(PRODUCT_ID);
    expect(findManyArg.where.product.workspaceId).toBe(WS);
  });

  it('enforces workspace isolation — throws when product is not in the workspace', async () => {
    productFindFirst.mockResolvedValueOnce(null);

    await expect(service.list(WS, { productId: 'other-ws-product' })).rejects.toThrow(
      NotFoundException,
    );
    expect(urlFindMany).not.toHaveBeenCalled();
  });

  it('rejects when productId is missing', async () => {
    await expect(service.list(WS, {})).rejects.toThrow(BadRequestException);
    expect(productFindFirst).not.toHaveBeenCalled();
  });
});
