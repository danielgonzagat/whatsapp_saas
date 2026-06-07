import { BadRequestException } from '@nestjs/common';

/**
 * Pure helpers extracted from {@link ProductController} so that the
 * DTO-validation, where-clause construction, and create/update payload
 * builders can be unit-tested without spinning up Nest, Prisma, or any
 * Express request plumbing.
 *
 * Every helper here is deterministic given its inputs and free of I/O.
 */

/** Maximum number of products returned per workspace by list / stats endpoints. */
export const PRODUCT_LIST_TAKE_CAP = 500;

/** Default currency for a product when none is supplied on creation. */
export const PRODUCT_DEFAULT_CURRENCY = 'BRL';

/** Default fulfillment format for a newly-created product. */
export const PRODUCT_DEFAULT_FORMAT = 'DIGITAL';

/** Default workflow status for a newly-created product. */
export const PRODUCT_DEFAULT_STATUS = 'DRAFT';

/** Status that flips a product to `active: true` on creation. */
export const PRODUCT_ACTIVE_STATUS = 'APPROVED';

/** Allowed shipping providers for the after-pay funnel. */
export const AFTER_PAY_SHIPPING_PROVIDERS = [
  'correios',
  'jadlog',
  'melhor_envio',
  'outro',
] as const;

/** Canonical product taxonomy shown before a workspace has created products. */
export const CANONICAL_PRODUCT_CATEGORIES = [
  'Dermocosméticos',
  'Cosméticos',
  'Suplementos',
  'Saúde e Bem-estar',
  'Beleza e Cuidados',
  'Cabelos',
  'Emagrecimento',
  'Fitness e Esportes',
  'Cursos Online',
  'E-books',
  'Mentorias e Consultorias',
  'Software e SaaS',
  'Serviços',
  'Eventos e Ingressos',
  'Moda e Acessórios',
  'Casa e Decoração',
  'Eletrônicos',
  'Pet',
  'Alimentos e Bebidas',
  'Infantil',
  'Espiritualidade',
  'Finanças e Negócios',
  'Outros',
] as const;

/** Bounds for commission percent and cookie-window validations. */
export const COMMISSION_PERCENT_MIN = 0;
export const COMMISSION_PERCENT_MAX = 100;
export const COMMISSION_COOKIE_DAYS_MIN = 1;
export const COMMISSION_COOKIE_DAYS_MAX = 3650;

/**
 * Shape of the {@link ProductController.listProducts} query-string subset
 * consumed by {@link buildProductListWhere}.
 */
export interface ProductListWhereInput {
  workspaceId: string;
  category?: string;
  /** Raw query-string value (`'true'` or `'false'`); `undefined` means "no filter". */
  active?: string;
  search?: string;
}

/**
 * Builds the Prisma `where` clause for {@link ProductController.listProducts}
 * from the controller's query-string parameters. Mirrors the original inline
 * logic (case-insensitive `name|description` search, boolean coercion of
 * `active`).
 */
export function buildProductListWhere(input: ProductListWhereInput): Record<string, unknown> {
  const where: Record<string, unknown> = { workspaceId: input.workspaceId };

  if (input.category) {
    where.category = input.category;
  }

  if (input.active !== undefined) {
    where.active = input.active === 'true';
  }

  if (input.search) {
    where.OR = [
      { name: { contains: input.search, mode: 'insensitive' } },
      { description: { contains: input.search, mode: 'insensitive' } },
    ];
  }

  return where;
}

/**
 * Shape of the update DTO consumed by {@link validateUpdateProductDto}.
 * Kept loose because the controller forwards the body verbatim.
 */
export interface UpdateProductValidationInput {
  commissionPercent?: number;
  commissionCookieDays?: number;
  afterPayChargeValue?: number | null;
  afterPayShippingProvider?: string | null;
}

/**
 * Throws {@link BadRequestException} when any of the bounded update fields
 * fall outside their allowed range. Otherwise returns silently.
 *
 * Pure: throws only typed Nest exceptions, never touches `this`.
 */
export function validateUpdateProductDto(dto: UpdateProductValidationInput): void {
  if (
    dto.commissionPercent !== undefined &&
    (dto.commissionPercent < COMMISSION_PERCENT_MIN ||
      dto.commissionPercent > COMMISSION_PERCENT_MAX)
  ) {
    throw new BadRequestException('commissionPercent precisa ficar entre 0 e 100');
  }

  if (
    dto.commissionCookieDays !== undefined &&
    (dto.commissionCookieDays < COMMISSION_COOKIE_DAYS_MIN ||
      dto.commissionCookieDays > COMMISSION_COOKIE_DAYS_MAX)
  ) {
    throw new BadRequestException('commissionCookieDays precisa ficar entre 1 e 3650');
  }

  if (
    dto.afterPayChargeValue !== undefined &&
    dto.afterPayChargeValue !== null &&
    dto.afterPayChargeValue < 0
  ) {
    throw new BadRequestException('afterPayChargeValue não pode ser negativo');
  }

  if (
    dto.afterPayShippingProvider !== undefined &&
    dto.afterPayShippingProvider !== null &&
    dto.afterPayShippingProvider !== '' &&
    !AFTER_PAY_SHIPPING_PROVIDERS.includes(
      dto.afterPayShippingProvider as (typeof AFTER_PAY_SHIPPING_PROVIDERS)[number],
    )
  ) {
    throw new BadRequestException('afterPayShippingProvider é inválido');
  }
}

/** Shape consumed by {@link buildCreateProductData}. Loosely typed on purpose. */
export interface CreateProductDtoLike {
  name: string;
  description?: string;
  price?: number;
  currency?: string;
  category?: string;
  imageUrl?: string;
  sku?: string;
  tags?: string[];
  format?: string;
  status?: string;
  salesPageUrl?: string;
  thankyouUrl?: string;
  thankyouBoletoUrl?: string;
  thankyouPixUrl?: string;
  reclameAquiUrl?: string;
  supportEmail?: string;
  warrantyDays?: number;
  guaranteeDays?: number;
  affiliatesEnabled?: boolean;
  affiliateCommission?: number;
  affiliateCommissionPercent?: number;
  affiliateApprovalMode?: string;
  isSample?: boolean;
  shippingType?: string;
  shippingValue?: number;
  originCep?: string;
  slug?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Builds the Prisma `product.create` payload from a DTO and a workspace ID.
 * Centralises every default (`'BRL'`, `'DIGITAL'`, `'DRAFT'`, etc.) and the
 * `status === 'APPROVED' ⇒ active: true` rule.
 */
export function buildCreateProductData(
  workspaceId: string,
  dto: CreateProductDtoLike,
): Record<string, unknown> {
  const commissionPercent = dto.affiliateCommissionPercent ?? dto.affiliateCommission;

  return {
    workspaceId,
    name: dto.name,
    description: dto.description || null,
    price: dto.price || 0,
    currency: dto.currency || PRODUCT_DEFAULT_CURRENCY,
    category: dto.category || null,
    imageUrl: dto.imageUrl || null,
    ...(dto.sku !== undefined ? { sku: dto.sku } : {}),
    tags: dto.tags || [],
    format: dto.format || PRODUCT_DEFAULT_FORMAT,
    status: dto.status || PRODUCT_DEFAULT_STATUS,
    active: dto.status === PRODUCT_ACTIVE_STATUS,
    salesPageUrl: dto.salesPageUrl || null,
    thankyouUrl: dto.thankyouUrl || null,
    ...(dto.thankyouBoletoUrl !== undefined ? { thankyouBoletoUrl: dto.thankyouBoletoUrl } : {}),
    ...(dto.thankyouPixUrl !== undefined ? { thankyouPixUrl: dto.thankyouPixUrl } : {}),
    ...(dto.reclameAquiUrl !== undefined ? { reclameAquiUrl: dto.reclameAquiUrl } : {}),
    supportEmail: dto.supportEmail || null,
    warrantyDays: dto.warrantyDays ?? dto.guaranteeDays ?? null,
    ...(dto.affiliatesEnabled !== undefined ? { affiliateEnabled: dto.affiliatesEnabled } : {}),
    ...(commissionPercent !== undefined ? { commissionPercent } : {}),
    ...(dto.affiliateApprovalMode !== undefined
      ? { affiliateAutoApprove: dto.affiliateApprovalMode.toLowerCase() !== 'manual' }
      : {}),
    isSample: dto.isSample || false,
    shippingType: dto.shippingType || null,
    shippingValue: dto.shippingValue || null,
    originCep: dto.originCep || null,
    ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
    metadata: dto.metadata || {},
  };
}

/** Shape consumed by {@link buildUpdateProductData}. */
export interface UpdateProductDtoLike extends Partial<CreateProductDtoLike> {
  active?: boolean;
  featured?: boolean;
  affiliateEnabled?: boolean;
  affiliateVisible?: boolean;
  affiliateAutoApprove?: boolean;
  affiliateAccessData?: boolean;
  affiliateAccessAbandoned?: boolean;
  affiliateFirstInstallment?: boolean;
  commissionType?: string;
  commissionCookieDays?: number;
  commissionPercent?: number;
  commissionLastClickPercent?: number;
  commissionOtherClicksPercent?: number;
  merchandContent?: string;
  affiliateTerms?: string;
  afterPayDuplicateAddress?: boolean;
  afterPayAffiliateCharge?: boolean;
  afterPayChargeValue?: number | null;
  afterPayShippingProvider?: string | null;
}

/**
 * Builds the Prisma `product.updateMany.data` payload from a partial update
 * DTO. Encapsulates:
 *
 *   - the `afterPayAffiliateCharge === false ⇒ afterPayChargeValue = null` rule;
 *   - conditional inclusion of `active` / `featured` only when the caller
 *     explicitly supplied them (so a missing key never resets the column);
 *   - the `price || 0` and `metadata as Prisma.InputJsonValue` coercions.
 */
export function buildUpdateProductData(dto: UpdateProductDtoLike): Record<string, unknown> {
  const { active, featured, ...rest } = dto;
  const normalizedRest: Record<string, unknown> = {
    ...rest,
    ...(rest.afterPayAffiliateCharge === false ? { afterPayChargeValue: null } : {}),
  };

  return {
    ...normalizedRest,
    ...(active !== undefined ? { active } : {}),
    ...(featured !== undefined ? { featured } : {}),
    ...(normalizedRest.price !== undefined ? { price: normalizedRest.price || 0 } : {}),
    ...(normalizedRest.metadata !== undefined ? { metadata: normalizedRest.metadata } : {}),
  };
}

/** Shape of a product row used by {@link calculateProductStats}. */
export interface ProductStatsRow {
  id: string;
  active: boolean;
}

/** Shape of the metrics map used by {@link calculateProductStats}. */
export type ProductMetricsLike = Map<
  string,
  { totalSales?: number | string | null; totalRevenue?: number | string | null }
>;

/** Aggregated product totals returned by the `stats` endpoint. */
export interface ProductStats {
  totalProducts: number;
  activeProducts: number;
  totalSales: number;
  totalRevenue: number;
}

/**
 * Aggregates per-product counts and revenue from a raw products list and a
 * metrics lookup, returning the four totals the `GET /products/stats`
 * endpoint exposes. Pure and deterministic.
 */
export function calculateProductStats(
  products: ProductStatsRow[],
  metricsByProductId: ProductMetricsLike,
): ProductStats {
  const totalProducts = products.length;
  const activeProducts = products.filter((product) => product.active).length;
  const totalSales = products.reduce(
    (sum, product) => sum + Number(metricsByProductId.get(product.id)?.totalSales || 0),
    0,
  );
  const totalRevenue = products.reduce(
    (sum, product) => sum + Number(metricsByProductId.get(product.id)?.totalRevenue || 0),
    0,
  );

  return { totalProducts, activeProducts, totalSales, totalRevenue };
}

/**
 * Builds the product category list for the workspace selector.
 * Canonical taxonomy is reference data; workspace-only categories remain visible after legacy imports.
 */
export function extractCategoriesFromProducts(
  products: Array<{ category: string | null | undefined }>,
): string[] {
  const categories: string[] = [];
  const seen = new Set<string>();

  for (const category of CANONICAL_PRODUCT_CATEGORIES) {
    seen.add(category);
    categories.push(category);
  }

  for (const product of products) {
    const category = product.category?.trim();
    if (!category || seen.has(category)) {
      continue;
    }

    seen.add(category);
    categories.push(category);
  }

  return categories;
}

/** Per-row outcome of a bulk-import call. */
export interface ProductImportResult {
  success: boolean;
}

/** Aggregated success / failure counts returned by the bulk-import endpoint. */
export interface ProductImportSummary {
  imported: number;
  failed: number;
}

/**
 * Counts the success vs. failure rows in a bulk-import results array.
 * Pure, terminates in O(n).
 */
export function countProductImportResults(results: ProductImportResult[]): ProductImportSummary {
  let imported = 0;
  let failed = 0;
  for (const row of results) {
    if (row.success) {
      imported += 1;
    } else {
      failed += 1;
    }
  }
  return { imported, failed };
}
