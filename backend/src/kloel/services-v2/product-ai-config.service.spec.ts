import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductAIConfigService } from './product-ai-config.service';

type ProductFindFirst = jest.Mock<Promise<{ id: string } | null>, [unknown]>;
type ConfigFindUnique = jest.Mock<Promise<Record<string, unknown> | null>, [unknown]>;
type ConfigUpsert = jest.Mock<Promise<Record<string, unknown>>, [unknown]>;

describe('ProductAIConfigService.update', () => {
  let service: ProductAIConfigService;
  let productFindFirst: ProductFindFirst;
  let configFindUnique: ConfigFindUnique;
  let configUpsert: ConfigUpsert;

  const WS = 'ws-1';
  const PRODUCT_ID = 'prod-1';

  beforeEach(() => {
    productFindFirst = jest.fn<Promise<{ id: string } | null>, [unknown]>().mockResolvedValue({
      id: PRODUCT_ID,
    });
    configFindUnique = jest
      .fn<Promise<Record<string, unknown> | null>, [unknown]>()
      .mockResolvedValue(null);
    configUpsert = jest
      .fn<Promise<Record<string, unknown>>, [unknown]>()
      .mockImplementation((args) =>
        Promise.resolve({
          id: 'cfg-1',
          productId: PRODUCT_ID,
          ...(args as { create: Record<string, unknown> }).create,
        }),
      );

    const prisma = {
      product: { findFirst: productFindFirst },
      productAIConfig: { findUnique: configFindUnique, upsert: configUpsert },
    } as unknown as PrismaService;

    service = new ProductAIConfigService(prisma);
  });

  it('upserts AI guidance into the customerProfile json (happy path)', async () => {
    const result = await service.update(WS, {
      productId: PRODUCT_ID,
      persona: 'Consultor sênior',
      instructions: 'Seja direto',
      knowledgeBase: 'FAQ',
      enabled: true,
    });

    expect(result.success).toBe(true);
    const upsertArg = configUpsert.mock.calls[0][0] as {
      where: { productId: string };
      create: { productId: string; customerProfile: Record<string, unknown> };
    };
    expect(upsertArg.where.productId).toBe(PRODUCT_ID);
    expect(upsertArg.create.customerProfile).toEqual({
      persona: 'Consultor sênior',
      instructions: 'Seja direto',
      knowledgeBase: 'FAQ',
      aiEnabled: true,
    });
  });

  it('merges into an existing customerProfile without clobbering other keys', async () => {
    configFindUnique.mockResolvedValueOnce({
      customerProfile: { idealCustomer: 'PMEs', persona: 'old' },
    });

    await service.update(WS, { productId: PRODUCT_ID, persona: 'new' });

    const upsertArg = configUpsert.mock.calls[0][0] as {
      update: { customerProfile: Record<string, unknown> };
    };
    expect(upsertArg.update.customerProfile).toEqual({
      idealCustomer: 'PMEs',
      persona: 'new',
    });
  });

  it('enforces workspace isolation — throws when product is not in the workspace', async () => {
    productFindFirst.mockResolvedValueOnce(null);

    await expect(
      service.update(WS, { productId: 'other-ws-product', persona: 'x' }),
    ).rejects.toThrow(NotFoundException);
    expect(configUpsert).not.toHaveBeenCalled();
  });

  it('returns failure envelope when productId is missing', async () => {
    const result = await service.update(WS, { productId: '' });
    expect(result).toEqual({ success: false, data: null });
    expect(productFindFirst).not.toHaveBeenCalled();
  });
});
