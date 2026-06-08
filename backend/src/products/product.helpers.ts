import { ForbiddenException } from '@nestjs/common';
import type { Product, Prisma } from '@prisma/client';
import type { CreateProductDto, ProductListFilters } from './product.types';

/**
 * Convert a numeric or Prisma.Decimal-ish product price to integer cents.
 * Pure: no side effects, no I/O.
 */
export function priceInCentsOf(price: Product['price']): number {
  return Math.round(Number(price) * 100);
}

/**
 * Build the canonical commercial-spine payload for a product event.
 * Centralized so every emitter writes the same shape.
 * Pure: takes a Product + optional extras, returns plain object.
 */
export function buildCommercialPayload(
  product: Product,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    productId: product.id,
    name: product.name,
    priceInCents: priceInCentsOf(product.price),
    format: product.format,
    status: product.status,
    active: product.active,
    ...extras,
  };
}

/**
 * Compose the Prisma `where` clause for a workspace-scoped product list.
 * Pure: filters in → where out. No prisma calls.
 */
export function buildListWhere(
  workspaceId: string,
  filters: ProductListFilters = {},
): Prisma.ProductWhereInput {
  const { search, category, active, status, format } = filters;
  const where: Prisma.ProductWhereInput = { workspaceId };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (category) {
    where.category = category;
  }
  if (active !== undefined) {
    where.active = active;
  }
  if (status) {
    where.status = status;
  }
  if (format) {
    where.format = format;
  }

  return where;
}

/**
 * Normalize page/limit defaults for the product list endpoint.
 * Pure: returns the effective pagination values.
 */
export function resolvePagination(filters: ProductListFilters = {}): {
  page: number;
  limit: number;
  skip: number;
} {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Assert a workspaceId is present. Throws ForbiddenException otherwise.
 * Pure (no I/O); kept here so the service stays thin.
 */
export function assertWorkspaceId(workspaceId: string | null | undefined): void {
  if (!workspaceId) {
    throw new ForbiddenException('Workspace ID is required');
  }
}

const PRODUCT_CREATE_STRIP_KEYS = [
  'paymentType',
  'checkoutType',
  'billingType',
  'maxInstallments',
  'interestFreeInstallments',
  'affiliateApprovalMode',
  'affiliatesEnabled',
  'affiliateCommission',
  'affiliateCommissionPercent',
  'guaranteeDays',
  'packageType',
  'dimensions',
  'width',
  'height',
  'depth',
  'weight',
  'shippingResponsible',
  'dispatchTime',
  'carriers',
  'facebookPixelId',
  'googleTagManagerId',
] as const;

export function normalizeProductCreateInput(
  dto: CreateProductDto | Prisma.ProductUncheckedCreateInput,
): Prisma.ProductUncheckedCreateInput {
  const cleanDto = { ...dto } as Record<string, unknown>;
  if (cleanDto.guaranteeDays != null) {
    cleanDto.warrantyDays = Number(cleanDto.guaranteeDays);
  }
  if (cleanDto.affiliatesEnabled != null) {
    cleanDto.affiliateEnabled = Boolean(cleanDto.affiliatesEnabled);
  }
  const affiliateApprovalMode = cleanDto.affiliateApprovalMode;
  if (typeof affiliateApprovalMode === 'string') {
    cleanDto.affiliateAutoApprove = affiliateApprovalMode.toLowerCase() !== 'manual';
  }
  const commissionPct = cleanDto.affiliateCommissionPercent ?? cleanDto.affiliateCommission;
  if (commissionPct != null) {
    cleanDto.commissionPercent = Number(commissionPct);
  }
  for (const stripKey of PRODUCT_CREATE_STRIP_KEYS) {
    delete cleanDto[stripKey];
  }

  const requestedStatus =
    typeof cleanDto.status === 'string' && cleanDto.status.length > 0 ? cleanDto.status : 'DRAFT';
  return {
    ...(cleanDto as Prisma.ProductUncheckedCreateInput),
    format: dto.format || 'PHYSICAL',
    status: requestedStatus === 'APPROVED' ? 'PENDING' : requestedStatus,
    active: false,
  };
}
