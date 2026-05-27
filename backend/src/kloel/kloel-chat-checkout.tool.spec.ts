import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { randomIdSegment } from '../common/random-id';
import { KloelChatCheckoutTool } from './kloel-chat-checkout.tool';

jest.mock('../common/random-id', () => ({
  randomIdSegment: jest.fn(() => 'abcde'),
}));

const randomIdSegmentMock = randomIdSegment as jest.MockedFunction<typeof randomIdSegment>;

type ProductFindFirstArgs = { where: { id: string; workspaceId: string } };
type ProductRecord = { id: string };
type ProductCheckoutCreateArgs = {
  data: {
    productId: string;
    name: string;
    active: boolean;
    code: string;
    config: Record<string, unknown>;
  };
};
type ProductCheckoutRecord = { id: string; name: string };
type CheckoutPlanLinkCreateManyArgs = { data: Array<{ checkoutId: string; planId: string }> };

describe('KloelChatCheckoutTool', () => {
  let moduleRef: TestingModule | null = null;
  let productFindFirst: jest.Mock<Promise<ProductRecord | null>, [ProductFindFirstArgs]>;
  let productCheckoutCreate: jest.Mock<Promise<ProductCheckoutRecord>, [ProductCheckoutCreateArgs]>;
  let checkoutPlanLinkCreateMany: jest.Mock<
    Promise<{ count: number }>,
    [CheckoutPlanLinkCreateManyArgs]
  >;

  async function createService(): Promise<KloelChatCheckoutTool> {
    const prisma = {
      product: { findFirst: productFindFirst },
      productCheckout: { create: productCheckoutCreate },
      checkoutPlanLink: { createMany: checkoutPlanLinkCreateMany },
    };

    moduleRef = await Test.createTestingModule({
      providers: [KloelChatCheckoutTool, { provide: PrismaService, useValue: prisma }],
    }).compile();

    return moduleRef.get(KloelChatCheckoutTool);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    randomIdSegmentMock.mockReturnValue('abcde');
    productFindFirst = jest
      .fn<Promise<ProductRecord | null>, [ProductFindFirstArgs]>()
      .mockResolvedValue({ id: 'prod_1' });
    productCheckoutCreate = jest
      .fn<Promise<ProductCheckoutRecord>, [ProductCheckoutCreateArgs]>()
      .mockResolvedValue({ id: 'checkout_1', name: 'Main checkout' });
    checkoutPlanLinkCreateMany = jest
      .fn<Promise<{ count: number }>, [CheckoutPlanLinkCreateManyArgs]>()
      .mockResolvedValue({ count: 0 });
  });

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
      moduleRef = null;
    }

    jest.restoreAllMocks();
  });

  it('generates checkout codes with the crypto-backed random segment helper', async () => {
    const timestamp = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(timestamp);

    const service = await createService();
    const mathRandomSpy = jest.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('KloelChatCheckoutTool.create must not use Math.random');
    });

    await expect(
      service.create('ws_1', { productId: 'prod_1', name: 'Main checkout' }),
    ).resolves.toEqual({ success: true, checkout: { id: 'checkout_1', name: 'Main checkout' } });

    expect(productCheckoutCreate).toHaveBeenCalledTimes(1);
    const createCall = productCheckoutCreate.mock.calls[0]?.[0];
    expect(createCall?.data.code).toBe(`chk_${timestamp.toString(36)}_abcde`);
    expect(randomIdSegmentMock).toHaveBeenCalledWith(5);
    expect(mathRandomSpy).not.toHaveBeenCalled();
  });
});
