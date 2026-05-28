/**
 * Pure helpers extracted from `KloelProductSubResourceToolsService` to
 * keep the service body a thin orchestrator. These complement the
 * lower-level builders in `kloel-product-sub-resource-tools.helpers.ts`
 * by covering the inline lookups, projection builders, and patch
 * builders that the service previously inlined.
 *
 * Constraints:
 *   - No `this` access.
 *   - No NestJS DI tokens.
 *   - Prisma access is via a typed `PrismaService` argument when needed.
 *   - Argument bags are `UnknownRecord` and must be narrowed via `parseStr`.
 */
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { UnknownRecord } from '../common/types';
import { parseStr } from './kloel-product-sub-resource-tools.helpers';

/**
 * Resolves a `productPlan.id` from either explicit `planId` arg or via a
 * workspace-scoped, case-insensitive name lookup (`planName` || `name`).
 * Returns the id or empty string when not found.
 */
export async function resolvePlanIdFromArgs(
  prisma: PrismaService,
  workspaceId: string,
  args: UnknownRecord,
): Promise<string> {
  const explicit = parseStr(args.planId);
  if (explicit) {
    return explicit;
  }
  const name = parseStr(args.planName || args.name);
  if (!name) {
    return '';
  }
  const found = await prisma.productPlan.findFirst({
    where: {
      name: { contains: name, mode: 'insensitive' },
      product: { workspaceId },
    },
    select: { id: true },
  });
  return found?.id ?? '';
}

/**
 * Resolves a `productCheckout.id` from either explicit `checkoutId` arg
 * or via a workspace-scoped, case-insensitive name lookup
 * (`checkoutName` || `name` || `planName`). Returns the id or empty
 * string when not found.
 */
export async function resolveCheckoutIdFromArgs(
  prisma: PrismaService,
  workspaceId: string,
  args: UnknownRecord,
): Promise<string> {
  const explicit = parseStr(args.checkoutId);
  if (explicit) {
    return explicit;
  }
  const name = parseStr(args.checkoutName || args.name || args.planName);
  if (!name) {
    return '';
  }
  const found = await prisma.productCheckout.findFirst({
    where: {
      name: { contains: name, mode: 'insensitive' },
      product: { workspaceId },
    },
    select: { id: true },
  });
  return found?.id ?? '';
}

/**
 * Pure builder for `productCheckout.update` data. Only defined args land
 * in the patch — undefined keys are skipped (Prisma-friendly).
 */
export function buildUpdateCheckoutData(args: UnknownRecord): UnknownRecord {
  const data: UnknownRecord = {};
  if (args.checkoutName !== undefined) {
    data.name = parseStr(args.checkoutName);
  }
  if (args.active !== undefined) {
    data.active = Boolean(args.active);
  }
  return data;
}

/**
 * Pure builder for the `productUrl.create` payload. Centralizes the
 * label/url fallback policy so the service body stays declarative.
 */
export function buildCreateUrlData(
  productId: string,
  args: UnknownRecord,
): Prisma.ProductUrlUncheckedCreateInput {
  const url = parseStr(args.url);
  const label = parseStr(args.label);
  return {
    productId,
    url,
    description: label || url,
    isPrivate: args.isPrivate === true,
  };
}

/**
 * Pure builder for the `productUrl.update` data patch. Only defined args
 * land in the patch — undefined keys are skipped (Prisma-friendly).
 *
 * `newUrl` is sourced from `args.url` upstream; passed in explicitly so
 * tests can exercise the empty-string vs non-empty branch deterministically.
 */
export function buildUpdateUrlData(args: UnknownRecord): Prisma.ProductUrlUpdateInput {
  const data: Prisma.ProductUrlUpdateInput = {};
  const newUrl = parseStr(args.url);
  if (newUrl) {
    data.url = newUrl;
  }
  if (args.label !== undefined) {
    data.description = parseStr(args.label);
  }
  if (args.isPrivate !== undefined) {
    data.isPrivate = args.isPrivate === true;
  }
  return data;
}

/**
 * Pure builder for the `productUrl.findFirst` where-clause used by the
 * URL-update flow. Always filters by label (case-insensitive contains)
 * and narrows to `productId` when the caller has resolved one.
 */
export function buildUpdateUrlWhereClause(
  label: string,
  productId: string,
): Prisma.ProductUrlWhereInput {
  const where: Prisma.ProductUrlWhereInput = {
    description: { contains: label, mode: 'insensitive' },
  };
  if (productId) {
    where.productId = productId;
  }
  return where;
}

/**
 * Tries to locate a `productUrl` first by label (workspace-scoped,
 * case-insensitive) and, on miss, by url substring. Returns null when
 * neither lookup matches. Pure orchestration of two Prisma reads.
 */
export async function findUrlByLabelOrUrl(
  prisma: PrismaService,
  workspaceId: string,
  label: string,
  url: string,
): Promise<{ id: string; url: string } | null> {
  if (label) {
    const byLabel = await prisma.productUrl.findFirst({
      where: {
        description: { contains: label, mode: 'insensitive' },
        product: { workspaceId },
      },
      select: { id: true, url: true },
    });
    if (byLabel) {
      return byLabel;
    }
  }
  if (url) {
    const byUrl = await prisma.productUrl.findFirst({
      where: { url: { contains: url }, product: { workspaceId } },
      select: { id: true, url: true },
    });
    if (byUrl) {
      return byUrl;
    }
  }
  return null;
}

/**
 * Workspace-scoped fallback used by `toolCreateCoupon` when the args
 * bag doesn't specify a product. Picks any product in the workspace so
 * the coupon has a parent; the upstream tool already validates that at
 * least one product exists.
 */
export async function resolveFallbackProductIdForCoupon(
  prisma: PrismaService,
  workspaceId: string,
): Promise<string> {
  const first = await prisma.product.findFirst({
    where: { workspaceId },
    select: { id: true },
  });
  return first?.id ?? '';
}

/**
 * Workspace-scoped product-id lookup by partial name (case-insensitive).
 * Used by `toolUpdateUrl` to narrow URL search when caller passes a
 * product name but no explicit `productId`.
 */
export async function findProductIdByPartialName(
  prisma: PrismaService,
  workspaceId: string,
  productName: string,
): Promise<string> {
  if (!productName) {
    return '';
  }
  const found = await prisma.product.findFirst({
    where: { workspaceId, name: { contains: productName, mode: 'insensitive' } },
    select: { id: true },
  });
  return found?.id ?? '';
}

/**
 * Projection for the create-plan success branch. Mirrors the previous
 * inline shape one-for-one so callers (chat tools) keep their contract.
 */
export function buildPlanCreateProjection(plan: {
  id: string;
  name: string;
  price: unknown;
}): { id: string; name: string; price: unknown } {
  return { id: plan.id, name: plan.name, price: plan.price };
}

/**
 * Projection for the update-plan success branch. Mirrors the previous
 * inline shape one-for-one (id/name/price/itemsPerPlan/maxInstallments/active).
 */
export function buildPlanUpdateProjection(plan: {
  id: string;
  name: string;
  price: unknown;
  itemsPerPlan: unknown;
  maxInstallments: unknown;
  active: unknown;
}): {
  id: string;
  name: string;
  price: unknown;
  itemsPerPlan: unknown;
  maxInstallments: unknown;
  active: unknown;
} {
  return {
    id: plan.id,
    name: plan.name,
    price: plan.price,
    itemsPerPlan: plan.itemsPerPlan,
    maxInstallments: plan.maxInstallments,
    active: plan.active,
  };
}

/**
 * Projection for the create/update-checkout success branch. Mirrors the
 * previous inline `{ id, name }` shape one-for-one.
 */
export function buildCheckoutProjection(checkout: {
  id: string;
  name: string;
}): { id: string; name: string } {
  return { id: checkout.id, name: checkout.name };
}

/**
 * Projection for the create-coupon success branch. Mirrors the previous
 * inline `{ id, code }` shape one-for-one.
 */
export function buildCouponCreateProjection(coupon: {
  id: string;
  code: string;
}): { id: string; code: string } {
  return { id: coupon.id, code: coupon.code };
}

/**
 * `findMany` options for `productCheckout` list-by-workspace. Extracted
 * to keep the service body a thin orchestrator and so the projection is
 * trivially assertable.
 */
export const LIST_CHECKOUTS_FIND_MANY_OPTIONS = {
  select: { id: true, name: true, createdAt: true },
  orderBy: { createdAt: 'desc' as const },
  take: 20,
} as const;

/**
 * Builds the `findMany` arg for list-checkouts scoped to a workspace.
 * Encapsulates the where-clause + projection in one place.
 */
export function buildListCheckoutsArgs(workspaceId: string): Prisma.ProductCheckoutFindManyArgs {
  return {
    where: { product: { workspaceId } },
    ...LIST_CHECKOUTS_FIND_MANY_OPTIONS,
  };
}

/**
 * Normalizes the URL-label argument bag down to a single string.
 * Accepts either `args.label` or `args.urlLabel` (kloel-chat tools emit
 * both shapes depending on prompt version).
 */
export function readUrlUpdateLabel(args: UnknownRecord): string {
  return parseStr(args.label || args.urlLabel);
}

/**
 * Normalizes the coupon-code argument bag down to a single string.
 * Accepts either `args.code` or `args.couponCode`.
 */
export function readCouponCode(args: UnknownRecord): string {
  return parseStr(args.code || args.couponCode);
}

/**
 * Normalizes the coupon-id argument bag down to a single string.
 * Accepts either `args.couponId` directly.
 */
export function readCouponId(args: UnknownRecord): string {
  return parseStr(args.couponId);
}

/**
 * Normalizes the coupon-code argument bag (delete flow). Accepts either
 * `args.couponCode` or `args.code`.
 */
export function readDeleteCouponCode(args: UnknownRecord): string {
  return parseStr(args.couponCode || args.code);
}
