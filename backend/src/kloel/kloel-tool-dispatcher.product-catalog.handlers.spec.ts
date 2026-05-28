import type { CouponService } from './coupon.service';
import type { KloelChatCheckoutTool } from './kloel-chat-checkout.tool';
import type { KloelChatToolsService } from './kloel-chat-tools.service';
import type { KloelProductSubResourceToolsService } from './kloel-product-sub-resource-tools.service';
import {
  dispatchProductCatalogTool,
  isProductCatalogTool,
  isProductSubResourceTool,
  PRODUCT_CATALOG_TOOL_NAMES,
} from './kloel-tool-dispatcher.product-catalog.handlers';
import type { ProductCatalogToolDeps } from './kloel-tool-dispatcher.product-catalog.handlers';

type Stub = {
  chatToolsService: {
    toolSaveProduct: jest.Mock;
    toolListProducts: jest.Mock;
    toolUpdateProduct: jest.Mock;
    toolUploadPlanImage: jest.Mock;
    toolUploadProductImage: jest.Mock;
  };
  couponService: { create: jest.Mock };
  checkoutService: { create: jest.Mock };
  productSubTools: { executeTool: jest.Mock };
};

const makeStubDeps = (): { stub: Stub; deps: ProductCatalogToolDeps } => {
  const stub: Stub = {
    chatToolsService: {
      toolSaveProduct: jest.fn().mockResolvedValue({ success: true, product: { id: 'p1' } }),
      toolListProducts: jest.fn().mockResolvedValue({ success: true, products: [] }),
      toolUpdateProduct: jest.fn().mockResolvedValue({ success: true }),
      toolUploadPlanImage: jest.fn().mockResolvedValue({ success: true, url: 'plan.png' }),
      toolUploadProductImage: jest.fn().mockResolvedValue({ success: true, url: 'prod.png' }),
    },
    couponService: {
      create: jest.fn().mockResolvedValue({ success: true, coupon: { id: 'c1' } }),
    },
    checkoutService: {
      create: jest.fn().mockResolvedValue({ success: true, checkout: { id: 'ck1' } }),
    },
    productSubTools: {
      executeTool: jest.fn().mockResolvedValue({ success: true, message: 'sub-resource ok' }),
    },
  };
  const deps: ProductCatalogToolDeps = {
    chatToolsService: stub.chatToolsService as unknown as KloelChatToolsService,
    couponService: stub.couponService as unknown as CouponService,
    checkoutService: stub.checkoutService as unknown as KloelChatCheckoutTool,
    productSubTools: stub.productSubTools as unknown as KloelProductSubResourceToolsService,
  };
  return { stub, deps };
};

describe('kloel-tool-dispatcher.product-catalog.handlers', () => {
  describe('isProductCatalogTool / isProductSubResourceTool', () => {
    it('recognises every catalog tool name', () => {
      for (const name of PRODUCT_CATALOG_TOOL_NAMES) {
        expect(isProductCatalogTool(name)).toBe(true);
      }
    });

    it('returns false for unrelated tool names', () => {
      expect(isProductCatalogTool('toggle_theme')).toBe(false);
      expect(isProductCatalogTool('delete_product')).toBe(false);
      expect(isProductCatalogTool('')).toBe(false);
    });

    it('isProductSubResourceTool returns true only for sub-resource family', () => {
      expect(isProductSubResourceTool('plan_create')).toBe(true);
      expect(isProductSubResourceTool('add_url')).toBe(true);
      expect(isProductSubResourceTool('save_product')).toBe(false);
      expect(isProductSubResourceTool('foo')).toBe(false);
    });

    it('excludes delete_product (stays on dispatcher for receipt timing)', () => {
      expect(PRODUCT_CATALOG_TOOL_NAMES.has('delete_product')).toBe(false);
    });
  });

  describe('dispatchProductCatalogTool', () => {
    it('returns null for unrelated tool names', async () => {
      const { deps } = makeStubDeps();
      expect(
        await dispatchProductCatalogTool(deps, 'ws1', 'totally_unrelated', {}),
      ).toBeNull();
    });

    it('routes save_product and create_product through chatToolsService.toolSaveProduct', async () => {
      const { stub, deps } = makeStubDeps();
      await dispatchProductCatalogTool(deps, 'ws1', 'save_product', { name: 'p' });
      await dispatchProductCatalogTool(deps, 'ws1', 'create_product', { name: 'p' }, 'u1');
      expect(stub.chatToolsService.toolSaveProduct).toHaveBeenCalledTimes(2);
      // create_product enriched with actorId from userId
      expect(stub.chatToolsService.toolSaveProduct).toHaveBeenNthCalledWith(2, 'ws1', {
        name: 'p',
        actorId: 'u1',
      });
    });

    it('routes list_products with no args', async () => {
      const { stub, deps } = makeStubDeps();
      await dispatchProductCatalogTool(deps, 'ws1', 'list_products', {});
      expect(stub.chatToolsService.toolListProducts).toHaveBeenCalledWith('ws1');
    });

    it('routes update_product and enriches with actorId when userId given', async () => {
      const { stub, deps } = makeStubDeps();
      await dispatchProductCatalogTool(deps, 'ws1', 'update_product', { id: 'p1' }, 'u1');
      expect(stub.chatToolsService.toolUpdateProduct).toHaveBeenCalledWith('ws1', {
        id: 'p1',
        actorId: 'u1',
      });
    });

    it('routes update_product without actorId when userId missing', async () => {
      const { stub, deps } = makeStubDeps();
      await dispatchProductCatalogTool(deps, 'ws1', 'update_product', { id: 'p1' });
      expect(stub.chatToolsService.toolUpdateProduct).toHaveBeenCalledWith('ws1', { id: 'p1' });
    });

    it('routes upload_plan_image and upload_product_image (with actorId enrichment)', async () => {
      const { stub, deps } = makeStubDeps();
      await dispatchProductCatalogTool(deps, 'ws1', 'upload_plan_image', { planId: 'pl1' });
      await dispatchProductCatalogTool(
        deps,
        'ws1',
        'upload_product_image',
        { productId: 'p1' },
        'u1',
      );
      expect(stub.chatToolsService.toolUploadPlanImage).toHaveBeenCalledWith('ws1', {
        planId: 'pl1',
      });
      expect(stub.chatToolsService.toolUploadProductImage).toHaveBeenCalledWith('ws1', {
        productId: 'p1',
        actorId: 'u1',
      });
    });

    it('routes coupon_create through CouponService when available', async () => {
      const { stub, deps } = makeStubDeps();
      await dispatchProductCatalogTool(deps, 'ws1', 'coupon_create', {
        productId: 'p1',
        code: 'X10',
        discountValue: 10,
      });
      expect(stub.couponService.create).toHaveBeenCalledWith('ws1', {
        productId: 'p1',
        code: 'X10',
        discountType: 'percentage',
        discountValue: 10,
      });
    });

    it('coupon_create falls back to defaults for missing fields', async () => {
      const { stub, deps } = makeStubDeps();
      await dispatchProductCatalogTool(deps, 'ws1', 'coupon_create', {});
      expect(stub.couponService.create).toHaveBeenCalledWith('ws1', {
        productId: '',
        code: '',
        discountType: 'percentage',
        discountValue: 0,
      });
    });

    it('coupon_create returns service-unavailable error when CouponService is missing', async () => {
      const { deps } = makeStubDeps();
      deps.couponService = undefined;
      const result = await dispatchProductCatalogTool(deps, 'ws1', 'coupon_create', {});
      expect(result).toEqual({ success: false, error: 'coupon_service_unavailable' });
    });

    it('checkout_create uses fallback name when neither name nor checkoutName provided', async () => {
      const { stub, deps } = makeStubDeps();
      await dispatchProductCatalogTool(deps, 'ws1', 'checkout_create', { productId: 'p1' });
      expect(stub.checkoutService.create).toHaveBeenCalledWith('ws1', {
        productId: 'p1',
        name: 'Checkout',
      });
    });

    it('checkout_create prefers args.name over args.checkoutName', async () => {
      const { stub, deps } = makeStubDeps();
      await dispatchProductCatalogTool(deps, 'ws1', 'checkout_create', {
        productId: 'p1',
        name: 'Primary',
        checkoutName: 'Secondary',
      });
      expect(stub.checkoutService.create).toHaveBeenCalledWith('ws1', {
        productId: 'p1',
        name: 'Primary',
      });
    });

    it('checkout_create returns service-unavailable error when KloelChatCheckoutTool is missing', async () => {
      const { deps } = makeStubDeps();
      deps.checkoutService = undefined;
      const result = await dispatchProductCatalogTool(deps, 'ws1', 'checkout_create', {});
      expect(result).toEqual({ success: false, error: 'checkout_service_unavailable' });
    });

    it('routes every sub-resource tool to productSubTools.executeTool', async () => {
      const { stub, deps } = makeStubDeps();
      const subResourceNames = [
        'plan_create',
        'create_plan',
        'update_plan',
        'create_checkout',
        'update_checkout',
        'list_checkouts',
        'create_coupon',
        'list_coupons',
        'delete_plan',
        'delete_checkout',
        'add_url',
        'update_url',
        'delete_url',
        'delete_coupon',
        'update_coupon',
      ];
      for (const name of subResourceNames) {
        await dispatchProductCatalogTool(deps, 'ws1', name, { foo: 1 });
      }
      expect(stub.productSubTools.executeTool).toHaveBeenCalledTimes(subResourceNames.length);
      for (let i = 0; i < subResourceNames.length; i += 1) {
        expect(stub.productSubTools.executeTool).toHaveBeenNthCalledWith(
          i + 1,
          subResourceNames[i],
          'ws1',
          { foo: 1 },
        );
      }
    });

    it('sub-resource tools return unavailable error when productSubTools is missing', async () => {
      const { deps } = makeStubDeps();
      deps.productSubTools = undefined;
      const result = await dispatchProductCatalogTool(deps, 'ws1', 'plan_create', {});
      expect(result).toEqual({
        success: false,
        error: 'product_sub_resource_tools_not_available',
      });
    });
  });
});
