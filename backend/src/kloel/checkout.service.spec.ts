import { PrismaService } from '../prisma/prisma.service';
import { randomIdSegment } from '../common/random-id';
import { CheckoutService } from './checkout.service';

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

describe('CheckoutService', () => {
  let productFindFirst: jest.Mock<Promise<ProductRecord | null>, [ProductFindFirstArgs]>;
  let productCheckoutCreate: jest.Mock<Promise<ProductCheckoutRecord>, [ProductCheckoutCreateArgs]>;
  let checkoutPlanLinkCreateMany: jest.Mock<
    Promise<{ count: number }>,
    [CheckoutPlanLinkCreateManyArgs]
  >;

  function createService(): CheckoutService {
    const prisma = {
      product: { findFirst: productFindFirst },
      productCheckout: { create: productCheckoutCreate },
      checkoutPlanLink: { createMany: checkoutPlanLinkCreateMany },
    } as unknown as PrismaService;

    return new CheckoutService(prisma);
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('generates checkout codes with the crypto-backed random segment helper', async () => {
    const timestamp = 1_700_000_000_000;
    const mathRandomSpy = jest.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('CheckoutService.create must not use Math.random');
    });
    jest.spyOn(Date, 'now').mockReturnValue(timestamp);

    const service = createService();

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
