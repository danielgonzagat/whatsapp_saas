import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { UnknownRecord } from '../common/types';

interface BoletoSalesResult {
  saleId: string;
  externalPaymentId: string;
  boletoBarcode: string;
  boletoUrl: string;
  boletoExpiresAt: Date | string;
}

/**
 * Coerces an unknown value to a string. Numbers/booleans are stringified.
 * Anything else (object, array, null, undefined) falls back.
 */
export function parseStr(value: unknown, fallback = ''): string {
  return typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : fallback;
}

/**
 * Coerces an unknown value to a finite number, otherwise the fallback.
 */
export function parseNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Returns the subset of `keys` whose trimmed string value in `args` is empty.
 * Used to validate that required string inputs are present.
 */
export function missingStringInputs(args: UnknownRecord, keys: string[]): string[] {
  return keys.filter((key) => !parseStr(args[key]).trim());
}

/**
 * Builds the buyer-data payload expected by SalesService.createBoletoOrder
 * from a free-form args bag. Pure transform — no DB access.
 */
export function boletoBuyerDataFromArgs(args: UnknownRecord) {
  const neighborhood = parseStr(args.customerNeighborhood).trim();
  return {
    name: parseStr(args.customerName).trim(),
    email: parseStr(args.customerEmail).trim(),
    cpf: parseStr(args.customerCpf).trim(),
    phone: parseStr(args.customerPhone).trim(),
    address: {
      zipCode: parseStr(args.customerZipCode).replace(/\D/g, ''),
      street: parseStr(args.customerStreet).trim(),
      number: parseStr(args.customerNumber).trim(),
      ...(neighborhood ? { neighborhood } : {}),
      city: parseStr(args.customerCity).trim(),
      state: parseStr(args.customerState)
        .replace(/[^a-z]/gi, '')
        .toUpperCase(),
    },
  };
}

/**
 * Resolves a product id given:
 *   - explicit `args.productId`, OR
 *   - case-insensitive `name contains` lookup of `args.productName` within workspace.
 *
 * Returns the id or an empty string when not found.
 */
export async function resolveProductIdByName(
  prisma: PrismaService,
  workspaceId: string,
  args: UnknownRecord,
): Promise<string> {
  const explicit = parseStr(args.productId);
  if (explicit) {
    return explicit;
  }
  const productName = parseStr(args.productName);
  if (!productName) {
    return '';
  }
  const found = await prisma.product.findFirst({
    where: {
      workspaceId,
      name: { contains: productName, mode: 'insensitive' },
    },
  });
  return found?.id ?? '';
}

/**
 * Strips diacritics and lowercases — used for accent-insensitive fallback matching.
 */
const DIACRITICS_RE = /[\\u0300-\\u036f]/g;

function normalizeForAccentFallback(value: string): string {
  return value.normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase();
}

/**
 * Same as {@link resolveProductIdByName} but, when the contains-insensitive query
 * misses, performs an in-memory accent-insensitive scan of up to 200 workspace
 * products. This covers cases like accented vs unaccented product names.
 */
export async function resolveProductIdWithAccentFallback(
  prisma: PrismaService,
  workspaceId: string,
  args: UnknownRecord,
): Promise<string> {
  const direct = await resolveProductIdByName(prisma, workspaceId, args);
  if (direct) {
    return direct;
  }
  const productName = parseStr(args.productName);
  if (!productName) {
    return '';
  }
  const stripped = normalizeForAccentFallback(productName);
  const all = await prisma.product.findMany({
    where: { workspaceId },
    select: { id: true, name: true },
    take: 200,
  });
  const found = all.find((prod) => normalizeForAccentFallback(prod.name).includes(stripped));
  return found?.id ?? '';
}

/**
 * Pure builder for `productPlan.create` data from a free-form args bag.
 * Includes optional `shippingConfig` when shippingType is present.
 */
export function buildCreatePlanData(
  productId: string,
  args: UnknownRecord,
): Prisma.ProductPlanUncheckedCreateInput {
  return {
    productId,
    name: parseStr(args.planName, 'Plano'),
    price: parseNum(args.price),
    // Additive money-in-cents dual-write (PRODUCT-PLAN PHASE A). Converges new
    // rows onto integer cents; `price` Float stays the read source.
    priceInCents: Math.round(parseNum(args.price) * 100),
    billingType: parseStr(args.billingType, 'ONE_TIME'),
    itemsPerPlan: args.quantity ? parseNum(args.quantity) : 1,
    maxInstallments: args.maxInstallments ? parseNum(args.maxInstallments) : null,
    recurringInterval: parseStr(args.recurringInterval) || null,
    trialEnabled: args.trialEnabled === true,
    trialDays: args.trialDays ? parseNum(args.trialDays) : null,
    visibleToAffiliates:
      args.visibleToAffiliates !== undefined ? args.visibleToAffiliates === true : true,
    ...(args.shippingType
      ? {
          shippingConfig: {
            type: args.shippingType,
            value: args.shippingValue,
            originCep: args.originCep,
          } as unknown as Prisma.InputJsonValue,
        }
      : {}),
  };
}

/**
 * Pure builder for `productPlan.update` data from args. Only defined args
 * land in the patch — undefined keys are skipped (Prisma-friendly).
 */
export function buildUpdatePlanData(args: UnknownRecord): UnknownRecord {
  const data: UnknownRecord = {};
  if (args.planName !== undefined) {
    data.name = parseStr(args.planName);
  }
  if (args.price !== undefined) {
    data.price = parseNum(args.price);
    // Additive money-in-cents dual-write (PRODUCT-PLAN PHASE A). Written
    // alongside `price`; reads/checkout still consume `price` for now.
    data.priceInCents = Math.round(parseNum(args.price) * 100);
  }
  if (args.active !== undefined) {
    data.active = Boolean(args.active);
  }
  if (args.maxInstallments !== undefined) {
    data.maxInstallments = parseNum(args.maxInstallments);
  }
  if (args.couponEnabled !== undefined) {
    data.couponEnabled = Boolean(args.couponEnabled);
  }
  if (args.itemsPerPlan !== undefined) {
    data.itemsPerPlan = parseNum(args.itemsPerPlan);
  } else if (args.quantity !== undefined) {
    data.itemsPerPlan = parseNum(args.quantity);
  }
  return data;
}

/**
 * Pure builder for the JSON `config` payload of a `ProductCheckout`.
 * Applies KLOEL defaults for primaryColor/buttonText/layout etc.
 */
export function buildCreateCheckoutConfig(args: UnknownRecord): Prisma.InputJsonValue {
  return {
    paymentMethods: (Array.isArray(args.paymentMethods)
      ? args.paymentMethods
      : ['card', 'pix', 'boleto']) as Prisma.InputJsonArray,
    couponEnabled: args.couponEnabled !== false,
    couponAuto: parseStr(args.couponAuto) || null,
    counterEnabled: args.counterEnabled === true,
    primaryColor: parseStr(args.primaryColor, '#7c3aed'),
    backgroundColor: parseStr(args.backgroundColor, '#ffffff'),
    buttonText: parseStr(args.buttonText, 'Comprar agora'),
    layout: parseStr(args.layout, 'standard'),
    socialProof: args.socialProof === true,
    warranty: args.warranty === true,
    exitIntent: args.exitIntent === true,
    linkedPlanNames: (Array.isArray(args.linkedPlanNames)
      ? args.linkedPlanNames
      : []) as Prisma.InputJsonArray,
  };
}

/**
 * Pure builder for `productCoupon.create` data. Caller resolves productId.
 */
export function buildCreateCouponData(
  productId: string,
  args: UnknownRecord,
): Prisma.ProductCouponUncheckedCreateInput {
  return {
    productId,
    code: parseStr(args.code),
    discountType: parseStr(args.discountType) === 'FIXED' ? 'FIXED' : 'PERCENT',
    discountValue: parseNum(args.discountValue),
    maxUses: parseNum(args.usageLimit) || null,
    expiresAt: args.expiresInDays
      ? new Date(Date.now() + parseNum(args.expiresInDays) * 86400000)
      : null,
    active: true,
  };
}

/**
 * Pure builder for `productCoupon.update` data. Only defined args land
 * in the patch.
 */
export function buildUpdateCouponData(args: UnknownRecord): UnknownRecord {
  const data: UnknownRecord = {};
  if (args.discountValue !== undefined) {
    data.discountValue = Number(args.discountValue);
  }
  if (args.discountType) {
    data.discountType = args.discountType;
  }
  if (args.usageLimit !== undefined) {
    data.usageLimit = Number(args.usageLimit);
  }
  if (args.expiresInDays !== undefined) {
    const d = new Date();
    d.setDate(d.getDate() + Number(args.expiresInDays));
    data.expiresAt = d;
  }
  return data;
}

/**
 * Finds a `productPlan` by plan name or by product name fallback. Both
 * lookups are scoped to the workspace and case-insensitive.
 */
export async function findPlanByNames(
  prisma: PrismaService,
  workspaceId: string,
  planName: string,
  productName: string,
): Promise<{ id: string; name: string } | null> {
  if (planName) {
    const byPlan = await prisma.productPlan.findFirst({
      where: {
        name: { contains: planName, mode: 'insensitive' },
        product: { workspaceId },
      },
      select: { id: true, name: true },
    });
    if (byPlan) {
      return byPlan;
    }
  }
  if (productName) {
    const byProduct = await prisma.productPlan.findFirst({
      where: {
        product: {
          workspaceId,
          name: { contains: productName, mode: 'insensitive' },
        },
      },
      select: { id: true, name: true },
    });
    if (byProduct) {
      return byProduct;
    }
  }
  return null;
}

/**
 * Finds a `productCheckout` by checkout name or by product name fallback.
 * Both lookups are scoped to the workspace and case-insensitive.
 */
export async function findCheckoutByNames(
  prisma: PrismaService,
  workspaceId: string,
  checkoutName: string,
  productName: string,
): Promise<{ id: string; name: string } | null> {
  if (checkoutName) {
    const byCheckout = await prisma.productCheckout.findFirst({
      where: {
        name: { contains: checkoutName, mode: 'insensitive' },
        product: { workspaceId },
      },
      select: { id: true, name: true },
    });
    if (byCheckout) {
      return byCheckout;
    }
  }
  if (productName) {
    const byProduct = await prisma.productCheckout.findFirst({
      where: {
        product: {
          workspaceId,
          name: { contains: productName, mode: 'insensitive' },
        },
      },
      select: { id: true, name: true },
    });
    if (byProduct) {
      return byProduct;
    }
  }
  return null;
}

/**
 * Pure builder for the boleto-success response payload returned by
 * `toolGenerateBoleto`. Mirrors the success branch one-for-one so the
 * service body stays a thin orchestrator.
 */
export function buildBoletoSuccessResponse(boletoResult: BoletoSalesResult) {
  return {
    success: true as const,
    capabilityId: 'sales.create_boleto' as const,
    saleId: boletoResult.saleId,
    orderId: boletoResult.saleId,
    paymentId: boletoResult.externalPaymentId,
    externalPaymentId: boletoResult.externalPaymentId,
    boletoBarcode: boletoResult.boletoBarcode,
    boletoUrl: boletoResult.boletoUrl,
    boletoExpiresAt: boletoResult.boletoExpiresAt,
    outputs: {
      saleId: boletoResult.saleId,
      orderId: boletoResult.saleId,
      paymentId: boletoResult.externalPaymentId,
      externalPaymentId: boletoResult.externalPaymentId,
      boletoBarcode: boletoResult.boletoBarcode,
      boletoUrl: boletoResult.boletoUrl,
      boletoExpiresAt: boletoResult.boletoExpiresAt,
    },
    domainEvents: ['sale.created', 'payment.pending'] as const,
    message: `Boleto gerado: ${boletoResult.saleId}`,
  };
}
