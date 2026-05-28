/**
 * Product-catalog tool dispatch helpers extracted from
 * KloelToolDispatcherService. Covers the direct product CRUD entries plus
 * the small product-sub-resource family (plans, checkouts, coupons, URLs)
 * and the legacy `coupon_create` / `checkout_create` shortcuts.
 *
 *   - save_product / create_product   → toolSaveProduct
 *   - list_products                   → toolListProducts
 *   - update_product                  → toolUpdateProduct
 *   - delete_product                  → toolDeleteProduct (with canonical receipt)
 *   - upload_plan_image               → toolUploadPlanImage
 *   - upload_product_image            → toolUploadProductImage
 *   - coupon_create                   → CouponService.create
 *   - checkout_create                 → KloelChatCheckoutTool.create
 *   - plan_create / create_plan / update_plan / delete_plan /
 *     create_checkout / update_checkout / delete_checkout / list_checkouts /
 *     create_coupon / update_coupon / delete_coupon / list_coupons /
 *     add_url / update_url / delete_url →
 *       KloelProductSubResourceToolsService.executeTool
 *
 * Behaviour and argument coercion are preserved one-for-one with the
 * previous inline switch cases. The dispatcher continues to apply the
 * canonical receipt wrapper for `delete_product` via the caller's
 * `withCanonicalReceipt` callback.
 */

import { asNumber, asString } from './kloel-tool-dispatcher.helpers';
import type { CouponService } from './coupon.service';
import type { KloelChatCheckoutTool } from './kloel-chat-checkout.tool';
import type { KloelChatToolsService } from './kloel-chat-tools.service';
import type { KloelProductSubResourceToolsService } from './kloel-product-sub-resource-tools.service';
import type { UnknownRecord } from '../common/types';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

/**
 * Tool names handled by {@link dispatchProductCatalogTool}. Mirrors the
 * case labels that previously lived in the dispatcher switch. The
 * `delete_product` case is **intentionally absent** from this set — it
 * stays on the dispatcher so the canonical-receipt `startedAt` window is
 * captured around the chat-tools call (the inline behaviour observed
 * `Date.now()` before invocation, which a fall-through helper cannot
 * preserve).
 */
export const PRODUCT_CATALOG_TOOL_NAMES = new Set<string>([
  'save_product',
  'create_product',
  'list_products',
  'update_product',
  'upload_plan_image',
  'upload_product_image',
  'coupon_create',
  'checkout_create',
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
]);

/** Tool names that are routed to {@link KloelProductSubResourceToolsService}. */
const PRODUCT_SUB_RESOURCE_TOOLS = new Set<string>([
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
]);

export function isProductCatalogTool(toolName: string): boolean {
  return PRODUCT_CATALOG_TOOL_NAMES.has(toolName);
}

export function isProductSubResourceTool(toolName: string): boolean {
  return PRODUCT_SUB_RESOURCE_TOOLS.has(toolName);
}

/** Dependencies required by the product-catalog dispatcher. */
export interface ProductCatalogToolDeps {
  chatToolsService: KloelChatToolsService;
  couponService: CouponService | undefined;
  checkoutService: KloelChatCheckoutTool | undefined;
  productSubTools: KloelProductSubResourceToolsService | undefined;
}

/**
 * Dispatch a product-catalog tool. Returns `null` when the tool name is
 * not part of this domain so the caller can fall through.
 */
export async function dispatchProductCatalogTool(
  deps: ProductCatalogToolDeps,
  workspaceId: string,
  toolName: string,
  args: UnknownRecord,
  userId?: string,
): Promise<ToolResult | null> {
  const asToolArgs = <T>(value: UnknownRecord): T => value as T;
  const { chatToolsService, couponService, checkoutService, productSubTools } = deps;

  switch (toolName) {
    case 'save_product':
    case 'create_product': {
      const productArgs = userId ? { ...args, actorId: userId } : args;
      return await chatToolsService.toolSaveProduct(workspaceId, asToolArgs(productArgs));
    }
    case 'list_products':
      return await chatToolsService.toolListProducts(workspaceId);
    case 'update_product': {
      const productArgs = userId ? { ...args, actorId: userId } : args;
      return await chatToolsService.toolUpdateProduct(workspaceId, asToolArgs(productArgs));
    }
    case 'upload_plan_image':
      return await chatToolsService.toolUploadPlanImage(workspaceId, asToolArgs(args));
    case 'upload_product_image': {
      const productArgs = userId ? { ...args, actorId: userId } : args;
      return await chatToolsService.toolUploadProductImage(workspaceId, asToolArgs(productArgs));
    }
    case 'coupon_create':
      if (couponService) {
        return couponService.create(workspaceId, {
          productId: asString(args.productId),
          code: asString(args.code),
          discountType: asString(args.discountType, 'percentage'),
          discountValue: asNumber(args.discountValue),
        });
      }
      return { success: false, error: 'coupon_service_unavailable' };
    case 'checkout_create':
      if (checkoutService) {
        return checkoutService.create(workspaceId, {
          productId: asString(args.productId),
          name: asString(args.name) || asString(args.checkoutName, 'Checkout'),
        });
      }
      return { success: false, error: 'checkout_service_unavailable' };
    case 'plan_create':
    case 'create_plan':
    case 'update_plan':
    case 'create_checkout':
    case 'update_checkout':
    case 'list_checkouts':
    case 'create_coupon':
    case 'list_coupons':
    case 'delete_plan':
    case 'delete_checkout':
    case 'add_url':
    case 'update_url':
    case 'delete_url':
    case 'delete_coupon':
    case 'update_coupon':
      if (productSubTools) {
        return await productSubTools.executeTool(toolName, workspaceId, asToolArgs(args));
      }
      return { success: false, error: 'product_sub_resource_tools_not_available' };
    default:
      return null;
  }
}
