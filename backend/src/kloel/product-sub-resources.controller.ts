import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CampaignsService } from '../campaigns/campaigns.service';
import { generateUniquePublicCheckoutCode } from '../checkout/checkout-code.util';
import { buildPayCheckoutUrl } from '../checkout/checkout-public-url.util';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { normalizeStorageUrlForRequest } from '../common/storage/public-storage-url.util';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PartnershipsService } from '../partnerships/partnerships.service';
import { ValidateCouponDto } from './dto/product-sub-resources.dto';
import {
  findConflictingProductCouponInWorkspace,
  syncWorkspaceCheckoutCouponForProduct,
} from './product-coupon-sync.util';

const U0300__U036F_RE = /[\u0300-\u036f]/g;
const A_Z0_9_RE = /[^a-z0-9]+/g;
const PATTERN_RE = /^-+|-+$/g;

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string'
    ? v
    : typeof v === 'number' || typeof v === 'boolean'
      ? String(v)
      : fb;
}

/** Loose body type — accepts idempotencyKey and any other fields for safe retry.
 *  Values are narrowed at each consumption site via parseObject/parseNumber/etc.
 *  Using `unknown` here would cascade 100+ casts through helper functions that
 *  already perform runtime narrowing, so we keep the structural escape hatch. */
type LooseObject = Record<string, unknown>;
type AffiliateCodeClient = Pick<
  PrismaService,
  'checkoutProductPlan' | 'checkoutPlanLink' | 'affiliateLink'
>;

function getWorkspaceId(req: AuthenticatedRequest): string {
  return req.user?.workspaceId || req.workspaceId || '';
}

async function ensureWorkspaceProductAccess(
  prisma: PrismaService,
  productId: string,
  workspaceId: string,
) {
  const product = await prisma.product.findFirst({
    where: { id: productId, workspaceId },
  });

  if (!product) {
    throw new NotFoundException('Produto não encontrado');
  }

  return product;
}

function parseObject(value: unknown): LooseObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as LooseObject;
}

function parseNumber(value: unknown): number | undefined {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function isPublicCheckoutCodeTaken(prisma: AffiliateCodeClient, code: string) {
  const [plan, checkoutLink, affiliateLink] = await Promise.all([
    prisma.checkoutProductPlan.findFirst({
      where: { referenceCode: code },
      select: { id: true },
    }),
    prisma.checkoutPlanLink.findFirst({
      where: { referenceCode: code },
      select: { id: true },
    }),
    prisma.affiliateLink.findFirst({
      where: { code },
      select: { id: true },
    }),
  ]);

  return Boolean(plan || checkoutLink || affiliateLink);
}

async function generateAffiliatePublicCode(prisma: AffiliateCodeClient) {
  return generateUniquePublicCheckoutCode((candidate) =>
    isPublicCheckoutCodeTaken(prisma, candidate),
  );
}

const COMMISSION_ROLE_VALUES = ['COPRODUCER', 'MANAGER', 'AFFILIATE'] as const;
const COMMISSION_PARTNER_INVITE_ROLES = new Set(['COPRODUCER', 'MANAGER']);
const PRODUCT_COMMISSION_TYPE_VALUES = ['first_click', 'last_click', 'proportional'] as const;

function normalizeCommissionRole(value: unknown): string | null {
  const role = safeStr(value).trim().toUpperCase();
  return (COMMISSION_ROLE_VALUES as readonly string[]).includes(role) ? role : null;
}

function normalizeOptionalEmail(value: unknown): string | null {
  const email = safeStr(value).trim().toLowerCase();
  return email || null;
}

function normalizeOptionalText(value: unknown): string | null {
  const text = safeStr(value).trim();
  return text || null;
}

function assertPercentageRange(
  value: number | undefined,
  fieldLabel: string,
  {
    min = 0,
    max = 100,
  }: {
    min?: number;
    max?: number;
  } = {},
) {
  if (value === undefined) {
    return;
  }

  if (value < min || value > max) {
    throw new BadRequestException(`${fieldLabel} precisa ficar entre ${min} e ${max}`);
  }
}

function buildCommissionPayload(body: LooseObject, current?: LooseObject) {
  const role = normalizeCommissionRole(body.role ?? current?.role);
  if (!role) {
    throw new BadRequestException('Role da comissão é obrigatório e precisa ser válido');
  }

  const percentage = parseNumber(body.percentage ?? current?.percentage);
  if (percentage === undefined) {
    throw new BadRequestException('Percentual da comissão é obrigatório');
  }
  assertPercentageRange(percentage, 'O percentual da comissão');

  const agentName = normalizeOptionalText(body.agentName ?? current?.agentName);
  const agentEmail = normalizeOptionalEmail(body.agentEmail ?? current?.agentEmail);

  if (!agentName && !agentEmail) {
    throw new BadRequestException('Informe ao menos nome ou e-mail do parceiro desta comissão');
  }

  if (agentEmail && !isValidEmail(agentEmail)) {
    throw new BadRequestException('E-mail do parceiro é inválido');
  }

  return {
    role,
    percentage,
    agentName,
    agentEmail,
  };
}

function findSingleAtIndex(email: string): number {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) {
    return -1;
  }
  if (atIndex !== email.lastIndexOf('@')) {
    return -1;
  }
  if (atIndex === email.length - 1) {
    return -1;
  }
  return atIndex;
}

function isValidEmailDomain(domain: string): boolean {
  if (!domain || domain.startsWith('.') || domain.endsWith('.')) {
    return false;
  }
  const dotIndex = domain.lastIndexOf('.');
  return dotIndex > 0 && dotIndex < domain.length - 1;
}

function isValidEmail(value: string): boolean {
  const email = String(value || '')
    .trim()
    .toLowerCase();
  if (!email || email.includes(' ')) {
    return false;
  }

  const atIndex = findSingleAtIndex(email);
  if (atIndex < 0) {
    return false;
  }

  const local = email.slice(0, atIndex);
  if (!local) {
    return false;
  }

  return isValidEmailDomain(email.slice(atIndex + 1));
}

async function ensureNoDuplicateCommission(
  prisma: PrismaService,
  productId: string,
  payload: {
    role: string;
    agentName: string | null;
    agentEmail: string | null;
  },
  ignoreCommissionId?: string,
) {
  const existing = await prisma.productCommission.findMany({
    where: {
      productId,
      role: payload.role,
      ...(ignoreCommissionId ? { id: { not: ignoreCommissionId } } : {}),
    },
    select: {
      id: true,
      agentName: true,
      agentEmail: true,
    },
  });

  const normalizedName = normalizeOptionalText(payload.agentName);
  const normalizedEmail = normalizeOptionalEmail(payload.agentEmail);
  const duplicate = existing.find((entry) => {
    const entryEmail = normalizeOptionalEmail(entry.agentEmail);
    const entryName = normalizeOptionalText(entry.agentName);
    return Boolean(
      (normalizedEmail && entryEmail === normalizedEmail) ||
      (!normalizedEmail &&
        normalizedName &&
        entryName &&
        entryName.toLowerCase() === normalizedName.toLowerCase()),
    );
  });

  if (duplicate) {
    throw new BadRequestException(
      'Já existe uma comissão com esse parceiro e papel para este produto',
    );
  }
}

function slugifyPlan(name: string, id: string) {
  const base = String(name || 'plano')
    .normalize('NFD')
    .replace(U0300__U036F_RE, '')
    .toLowerCase()
    .replace(A_Z0_9_RE, '-')
    .replace(PATTERN_RE, '')
    .slice(0, 48);

  return `${base || 'plano'}-${id.slice(0, 8)}`;
}

function removeUndefined<T extends LooseObject>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function buildPlanExtraConfig(body: LooseObject, current: LooseObject) {
  const next = { ...current };
  const patches: LooseObject = {
    imageUrl: body.imageUrl,
    redirectUrl: body.redirectUrl,
    freeSample: body.freeSample,
    requireEmail: body.requireEmail,
    requireEmailConfirm: body.requireEmailConfirm,
    requireAddress: body.requireAddress,
    limitSales: body.limitSales,
    salesLimit: parseNumber(body.salesLimit),
    limitPerApproved: body.limitPerApproved,
    approvedLimit: parseNumber(body.approvedLimit),
    minStock: body.minStock,
    stockMin: parseNumber(body.stockMin),
    notifyBoleto: body.notifyBoleto,
    limitedBilling: body.limitedBilling,
    affiliateRecurring: body.affiliateRecurring,
    boletoInstallment: body.boletoInstallment,
    boletoInstallments: parseNumber(body.boletoInstallments),
    boletoInterest: body.boletoInterest,
    paymentMethods:
      body.paymentMethods && typeof body.paymentMethods === 'object'
        ? body.paymentMethods
        : undefined,
  };

  for (const [key, entry] of Object.entries(patches)) {
    if (entry !== undefined) {
      next[key] = entry;
    }
  }

  return next;
}

function buildPackagingConfig(body: LooseObject, current: LooseObject) {
  const next = { ...current };
  const rawDimensions = parseObject(body.dimensions);
  const dimensions =
    body.dimensions && typeof body.dimensions === 'object'
      ? removeUndefined({
          width: parseNumber(rawDimensions.width),
          height: parseNumber(rawDimensions.height),
          length: parseNumber(rawDimensions.length),
        })
      : undefined;

  const patches: LooseObject = {
    packageType: body.packageType,
    dimensions,
    weight: parseNumber(body.weight),
  };

  for (const [key, entry] of Object.entries(patches)) {
    if (entry !== undefined) {
      next[key] = entry;
    }
  }

  return next;
}

function pickRequestedFreightType(body: LooseObject): string | undefined {
  if (typeof body.freightType === 'string') {
    return body.freightType;
  }
  if (typeof body.shippingCost === 'string') {
    return body.shippingCost;
  }
  return undefined;
}

function resolveFreightType(body: LooseObject, current: LooseObject): string | undefined {
  if (body.freeShipping === true) {
    return 'free';
  }
  const requested = pickRequestedFreightType(body);
  if (requested !== undefined) {
    return requested;
  }
  if (body.freeShipping === false) {
    return current.freightType === 'free' ? 'calculated' : safeStr(current.freightType);
  }
  return undefined;
}

function pickRecordOrUndefined(value: unknown): LooseObject | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as LooseObject;
  }
  return undefined;
}

function buildShippingPatches(
  body: LooseObject,
  freightType: string | undefined,
  shippingCostNumber: number | undefined,
): LooseObject {
  return {
    shipper: body.shipper ?? body.whoShips,
    shipFrom: body.shipFrom,
    dispatchTime: body.dispatchTime,
    carriers: Array.isArray(body.carriers) ? body.carriers : undefined,
    freightType,
    fixedFreight: shippingCostNumber,
    tracking: body.tracking,
    regionPrazos: pickRecordOrUndefined(body.regionPrazos),
    faqAnswers: pickRecordOrUndefined(body.faqAnswers),
  };
}

function buildShippingConfig(body: LooseObject, current: LooseObject) {
  const next = { ...current };
  const freightType = resolveFreightType(body, current);
  const fixedFreight = parseNumber(body.fixedFreight) ?? parseNumber(body.shippingPrice);
  const shippingCostNumber = fixedFreight ?? parseNumber(body.shippingCost);
  const patches = buildShippingPatches(body, freightType, shippingCostNumber);

  for (const [key, entry] of Object.entries(patches)) {
    if (entry !== undefined) {
      next[key] = entry;
    }
  }

  return next;
}

function resolvePlanPrice(body: LooseObject): number | undefined {
  const direct = parseNumber(body.price);
  if (direct !== undefined) {
    return direct;
  }
  const cents = parseNumber(body.priceInCents);
  if (cents === undefined) {
    return undefined;
  }
  return Number(cents / 100);
}

function resolveVisibleToAffiliates(body: LooseObject): unknown {
  if (body.visibleToAffiliates !== undefined) {
    return body.visibleToAffiliates;
  }
  if (body.hideAffiliates === undefined) {
    return undefined;
  }
  return !body.hideAffiliates;
}

function buildPlanData(body: LooseObject, current?: LooseObject) {
  const currentExtra = parseObject(current?.checkoutImages);
  const currentPackaging = parseObject(current?.packagingConfig);
  const currentShipping = parseObject(current?.shippingConfig);

  const price = resolvePlanPrice(body);
  const itemsPerPlan =
    parseNumber(body.itemsPerPlan) ?? parseNumber(body.quantity) ?? parseNumber(body.items);
  const active = body.active ?? body.isActive ?? body.available;
  const visibleToAffiliates = resolveVisibleToAffiliates(body);
  const maxNoInterest =
    parseNumber(body.maxNoInterest) ?? parseNumber(body.interestFreeInstallments);
  const recurringInterval = body.recurringInterval ?? body.subscriptionPeriod;

  return removeUndefined({
    name: body.name,
    price,
    billingType: body.billingType,
    itemsPerPlan,
    maxInstallments: parseNumber(body.maxInstallments),
    maxNoInterest,
    discountByPayment: body.discountByPayment,
    recurringInterval,
    trialEnabled: body.trialEnabled,
    trialDays: parseNumber(body.trialDays),
    trialPrice: parseNumber(body.trialPrice),
    visibleToAffiliates,
    active,
    orderBumpPlanId: body.orderBumpPlanId,
    orderBumpText: body.orderBumpText,
    termsUrl: body.termsUrl,
    thankyouUrl: body.thankyouUrl,
    thankyouBoletoUrl: body.thankyouBoletoUrl,
    thankyouPixUrl: body.thankyouPixUrl,
    checkoutImages: buildPlanExtraConfig(body, currentExtra),
    packagingConfig: buildPackagingConfig(body, currentPackaging),
    shippingConfig: buildShippingConfig(body, currentShipping),
  });
}

function serializePlanIdentity(plan: LooseObject) {
  const planName = safeStr(plan.name);
  const planId = safeStr(plan.id);
  const upperRef = safeStr(plan.referenceCode).trim().toUpperCase();
  return {
    slug: slugifyPlan(planName, planId),
    referenceCode: upperRef || planId.slice(0, 8).toUpperCase(),
    priceInCents: Math.round(Number(plan.price || 0) * 100),
    quantity: plan.itemsPerPlan,
    items: plan.itemsPerPlan,
    isActive: plan.active,
    available: plan.active,
    hideAffiliates: !plan.visibleToAffiliates,
    interestFreeInstallments: plan.maxNoInterest,
    subscriptionPeriod: plan.recurringInterval,
  };
}

function serializePlanShipping(shipping: LooseObject, freightType: string) {
  return {
    freeShipping: freightType.toLowerCase() === 'free' || shipping.freeShipping === true,
    shippingPrice: shipping.fixedFreight ?? shipping.shippingValue ?? null,
    whoShips: shipping.shipper || '',
    shipper: shipping.shipper || '',
    shipFrom: shipping.shipFrom || '',
    dispatchTime: shipping.dispatchTime || '',
    carriers: Array.isArray(shipping.carriers) ? shipping.carriers : [],
    freightType,
    fixedFreight: shipping.fixedFreight ?? '',
    tracking: shipping.tracking || '',
    regionPrazos: shipping.regionPrazos || {},
    faqAnswers: shipping.faqAnswers || {},
  };
}

function serializePlanPackaging(packaging: LooseObject) {
  return {
    packageType: packaging.packageType || '',
    dimensions: packaging.dimensions || {},
    weight: packaging.weight ?? '',
  };
}

const PLAN_CHECKOUT_FLAG_DEFAULTS: LooseObject = {
  imageUrl: null,
  redirectUrl: '',
  freeSample: false,
  requireEmail: true,
  requireEmailConfirm: false,
  requireAddress: false,
  limitSales: false,
  salesLimit: '',
  limitPerApproved: false,
  approvedLimit: '',
  minStock: false,
  stockMin: '',
  notifyBoleto: true,
  limitedBilling: false,
  affiliateRecurring: true,
  boletoInstallment: false,
  boletoInstallments: '',
  boletoInterest: false,
};

const DEFAULT_PAYMENT_METHODS = Object.freeze({
  credit: true,
  boleto: true,
  pix: true,
});

function resolvePlanCheckoutFlag(extra: LooseObject, key: string, fallback: unknown): unknown {
  const value = extra[key];
  // `imageUrl` and `redirectUrl` treat empty string as "no value"; others only coalesce null/undefined.
  if (key === 'imageUrl' || key === 'redirectUrl') {
    return value || fallback;
  }
  return value ?? fallback;
}

function serializePlanCheckoutFlags(extra: LooseObject) {
  const flags: LooseObject = {};
  for (const [key, fallback] of Object.entries(PLAN_CHECKOUT_FLAG_DEFAULTS)) {
    flags[key] = resolvePlanCheckoutFlag(extra, key, fallback);
  }
  flags.paymentMethods = extra.paymentMethods || DEFAULT_PAYMENT_METHODS;
  return flags;
}

function serializePlan(plan: LooseObject) {
  const extra = parseObject(plan.checkoutImages);
  const packaging = parseObject(plan.packagingConfig);
  const shipping = parseObject(plan.shippingConfig);
  const freightType = typeof shipping.freightType === 'string' ? shipping.freightType : '';

  return {
    ...plan,
    ...serializePlanIdentity(plan),
    ...serializePlanShipping(shipping, freightType),
    ...serializePlanPackaging(packaging),
    ...serializePlanCheckoutFlags(extra),
  };
}

function buildCheckoutData(body: LooseObject, current?: LooseObject) {
  const currentConfig = parseObject(current?.config);
  const configInput = body.config && typeof body.config === 'object' ? body.config : {};
  const flatConfig = removeUndefined({
    theme: body.theme,
    headerText: body.headerText,
    ctaText: body.ctaText,
    showTimer: body.showTimer,
    showTestimonials: body.showTestimonials,
    brandName: body.brandName,
    enableCreditCard: body.enableCreditCard,
    enablePix: body.enablePix,
    enableBoleto: body.enableBoleto,
    enableCoupon: body.enableCoupon,
    autoCouponCode: body.autoCouponCode,
    enableTimer: body.enableTimer,
    timerMinutes: parseNumber(body.timerMinutes),
    timerMessage: body.timerMessage,
    accentColor: body.accentColor,
    backgroundColor: body.backgroundColor,
    btnFinalizeText: body.btnFinalizeText,
    enableTestimonials: body.enableTestimonials,
    enableGuarantee: body.enableGuarantee,
    showCouponPopup: body.showCouponPopup,
  });

  return removeUndefined({
    name: body.name ?? body.brandName,
    active: body.active,
    config: {
      ...currentConfig,
      ...configInput,
      ...flatConfig,
    },
  });
}

function serializeCheckout(checkout: LooseObject) {
  const config = parseObject(checkout.config);

  return {
    ...checkout,
    ...config,
    config,
  };
}

function buildCouponData(body: LooseObject) {
  const rawType = typeof body.discountType === 'string' ? body.discountType.toUpperCase() : '';
  const discountType =
    rawType === 'FIXED' || rawType === 'PERCENT'
      ? rawType
      : parseNumber(body.discountFixed) !== undefined
        ? 'FIXED'
        : 'PERCENT';
  const discountValue =
    parseNumber(body.discountValue) ??
    parseNumber(body.discountFixed) ??
    parseNumber(body.discountPercent);

  if (!body.code || discountValue === undefined) {
    throw new BadRequestException('Código e valor do cupom são obrigatórios');
  }

  return removeUndefined({
    code: safeStr(body.code).trim().toUpperCase(),
    discountType,
    discountValue,
    maxUses: parseNumber(body.maxUses),
    expiresAt: body.expiresAt ? new Date(safeStr(body.expiresAt)) : undefined,
    active: body.active,
  });
}

function serializeCoupon(coupon: LooseObject) {
  return {
    ...coupon,
    discountPercent: coupon.discountType === 'PERCENT' ? coupon.discountValue : 0,
    discountFixed: coupon.discountType === 'FIXED' ? coupon.discountValue : 0,
  };
}

function serializeReview(review: LooseObject) {
  return {
    ...review,
    name: review.authorName || 'Anônimo',
    text: review.comment || '',
  };
}

function serializeAffiliateProductForResponse(
  req: AuthenticatedRequest,
  product: LooseObject | null,
) {
  if (!product) {
    return product;
  }

  return {
    ...product,
    thumbnailUrl:
      normalizeStorageUrlForRequest(product.thumbnailUrl as string | null | undefined, req) || null,
  };
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function buildAffiliateLinkUrl(req: AuthenticatedRequest, code: string | null | undefined) {
  return buildPayCheckoutUrl(req, code);
}

function normalizeAffiliatePromoMaterials(product: LooseObject) {
  const materials = new Set<string>();
  const merchandContent = safeStr(product.merchandContent).trim();
  const affiliateTerms = safeStr(product.affiliateTerms).trim();

  for (const entry of toStringList(product.promoMaterials)) {
    materials.add(entry);
  }

  if (merchandContent) {
    materials.add(merchandContent);
  }

  if (affiliateTerms) {
    materials.add(`TERMOS\n${affiliateTerms}`);
  }

  return Array.from(materials);
}

function buildAffiliateProductData(product: LooseObject) {
  return {
    listed: Boolean(product.affiliateEnabled) && Boolean(product.affiliateVisible),
    commissionPct: parseNumber(product.commissionPercent) ?? 30,
    commissionType: 'PERCENTAGE',
    cookieDays: parseNumber(product.commissionCookieDays) ?? 180,
    approvalMode: product.affiliateAutoApprove === false ? 'MANUAL' : 'AUTO',
    category: normalizeOptionalText(product.category) ?? '',
    tags: toStringList(product.tags),
    thumbnailUrl: normalizeOptionalText(product.imageUrl),
    promoMaterials: normalizeAffiliatePromoMaterials(product),
  };
}

async function recalculateAffiliateProductCounters(
  prisma: PrismaService,
  affiliateProductId: string,
) {
  const links = await prisma.affiliateLink.findMany({
    where: { affiliateProductId },
    select: {
      affiliateWorkspaceId: true,
      active: true,
      sales: true,
      revenue: true,
    },
  });

  const totalAffiliates = new Set(
    links
      .filter((link) => link.active)
      .map((link) => link.affiliateWorkspaceId)
      .filter(Boolean),
  ).size;

  const totalSales = links.reduce((sum, link) => sum + Number(link.sales || 0), 0);
  const totalRevenue = links.reduce((sum, link) => sum + Number(link.revenue || 0), 0);

  await prisma.affiliateProduct.update({
    where: { id: affiliateProductId },
    data: {
      totalAffiliates,
      totalSales,
      totalRevenue,
    },
  });
}

async function buildAffiliateSummary(
  prisma: PrismaService,
  req: AuthenticatedRequest,
  productId: string,
) {
  const affiliateProduct = await prisma.affiliateProduct.findUnique({
    where: { productId },
    include: {
      requests: { orderBy: { createdAt: 'desc' } },
      links: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!affiliateProduct) {
    return {
      affiliateProduct: null,
      requests: [],
      links: [],
      stats: {
        requests: 0,
        pendingRequests: 0,
        approvedRequests: 0,
        rejectedRequests: 0,
        activeLinks: 0,
        clicks: 0,
        sales: 0,
        revenue: 0,
        commission: 0,
      },
    };
  }

  const workspaceIds = [
    ...new Set(
      [
        ...affiliateProduct.requests.map((request) => request.affiliateWorkspaceId),
        ...affiliateProduct.links.map((link) => link.affiliateWorkspaceId),
      ].filter(Boolean),
    ),
  ];

  const workspaces = workspaceIds.length
    ? await prisma.workspace.findMany({
        where: { id: { in: workspaceIds } },
        select: { id: true, name: true },
      })
    : [];
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));

  const requests = affiliateProduct.requests.map((request) => ({
    ...request,
    affiliateName:
      request.affiliateName || workspaceById.get(request.affiliateWorkspaceId) || 'Afiliado',
  }));

  const requestByWorkspaceId = new Map(
    requests.map((request) => [request.affiliateWorkspaceId, request]),
  );

  const links = affiliateProduct.links.map((link) => {
    const linkedRequest = requestByWorkspaceId.get(link.affiliateWorkspaceId);
    return {
      ...link,
      affiliateName:
        linkedRequest?.affiliateName || workspaceById.get(link.affiliateWorkspaceId) || 'Afiliado',
      affiliateEmail: linkedRequest?.affiliateEmail || null,
      slug: link.code,
      url: buildAffiliateLinkUrl(req, link.code),
    };
  });

  const pendingRequests = requests.filter((request) => request.status === 'PENDING').length;
  const approvedRequests = requests.filter((request) => request.status === 'APPROVED').length;
  const rejectedRequests = requests.filter((request) => request.status === 'REJECTED').length;
  const activeLinks = links.filter((link) => link.active).length;
  const clicks = links.reduce((sum, link) => sum + Number(link.clicks || 0), 0);
  const sales = links.reduce((sum, link) => sum + Number(link.sales || 0), 0);
  const revenue = links.reduce((sum, link) => sum + Number(link.revenue || 0), 0);
  const commission = links.reduce((sum, link) => sum + Number(link.commissionEarned || 0), 0);

  return {
    affiliateProduct: serializeAffiliateProductForResponse(req, affiliateProduct),
    requests,
    links,
    stats: {
      requests: requests.length,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      activeLinks,
      clicks,
      sales,
      revenue,
      commission,
    },
  };
}

function findLinkedCampaignForProductCampaign(
  campaigns: LooseObject[],
  productCampaign: LooseObject,
) {
  return (
    campaigns.find((campaign) => {
      const filters = parseObject(campaign.filters);
      return (
        filters.productCampaignId === productCampaign.id ||
        filters.productCampaignCode === productCampaign.code
      );
    }) || null
  );
}

function buildDefaultCampaignMessage(product: LooseObject) {
  const productName = safeStr(product.name, 'esta oferta').trim();
  return [
    'Olá {{name}}, separei uma oportunidade especial para ',
    productName,
    '. Responda esta mensagem e eu envio os detalhes e o link certo para você agora.',
  ].join('');
}

function serializeProductCampaignRecord(
  productCampaign: LooseObject,
  linkedCampaign?: LooseObject | null,
) {
  const filters = parseObject(linkedCampaign?.filters);
  const stats = parseObject(linkedCampaign?.stats);

  return {
    ...productCampaign,
    linkedCampaignId: linkedCampaign?.id || null,
    status: linkedCampaign?.status || 'DRAFT',
    scheduledAt: linkedCampaign?.scheduledAt || null,
    messageTemplate: linkedCampaign?.messageTemplate || '',
    aiStrategy: linkedCampaign?.aiStrategy || 'BALANCED',
    tags: toStringList(filters.tags),
    smartTime: Boolean(filters.smartTime),
    sentCount: Number(stats.sent || 0),
    deliveredCount: Number(stats.delivered || 0),
    readCount: Number(stats.read || 0),
    failedCount: Number(stats.failed || 0),
    repliedCount: Number(stats.replied || 0),
  };
}

function normalizeAiTone(value: unknown): string | undefined {
  const normalized = safeStr(value).trim();
  if (!normalized) {
    return undefined;
  }

  const map: Record<string, string> = {
    consultive: 'CONSULTIVE',
    consultivo: 'CONSULTIVE',
    aggressive: 'AGGRESSIVE',
    agressivo: 'AGGRESSIVE',
    direct: 'DIRECT',
    direto: 'DIRECT',
    friendly: 'FRIENDLY',
    amigavel: 'FRIENDLY',
    amigável: 'FRIENDLY',
    empathetic: 'EMPATHETIC',
    empatico: 'EMPATHETIC',
    empático: 'EMPATHETIC',
    educative: 'EDUCATIVE',
    educativo: 'EDUCATIVE',
    urgent: 'URGENT',
    urgente: 'URGENT',
    technical: 'TECHNICAL',
    tecnico: 'TECHNICAL',
    técnico: 'TECHNICAL',
    casual: 'CASUAL',
    auto: 'AUTO',
  };

  return map[normalized.toLowerCase()] || normalized.toUpperCase();
}

function normalizeAiObjections(value: unknown): LooseObject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => {
      const objection = parseObject(entry);
      const label = safeStr(
        objection.label || objection.id || objection.q || objection.question,
        `Objeção ${index + 1}`,
      ).trim();
      const response = safeStr(objection.response || objection.a || objection.answer).trim();

      if (!label && !response) {
        return null;
      }

      return {
        id: safeStr(objection.id, `objection-${index + 1}`),
        label,
        response,
        q: label,
        a: response,
        enabled: objection.enabled !== false,
      };
    })
    .filter(Boolean);
}

function pickDefined<T extends LooseObject, K extends string>(
  source: T,
  keys: readonly K[],
): LooseObject {
  const result: LooseObject = {};
  for (const key of keys) {
    if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}

function pickRenamed(
  source: LooseObject,
  mapping: ReadonlyArray<readonly [string, string]>,
): LooseObject {
  const result: LooseObject = {};
  for (const [sourceKey, targetKey] of mapping) {
    if (source[sourceKey] !== undefined) {
      result[targetKey] = source[sourceKey];
    }
  }
  return result;
}

const CUSTOMER_PROFILE_KEYS = [
  'whobuys',
  'pains',
  'promise',
  'idealCustomer',
  'painPoints',
  'promisedResult',
  'genders',
  'ages',
  'moments',
  'knowledge',
  'buyingPower',
  'problem',
] as const;

const POSITIONING_KEYS = [
  'tier',
  'whenOffer',
  'differentiators',
  'scarcity',
  'objectionStates',
] as const;

const SALES_ARGUMENT_SHARED_KEYS = ['autoCheckoutLink', 'offerDiscount', 'useUrgency'] as const;

const SALES_ARGUMENT_EXTRA_KEYS = [
  'socialProof',
  'socialProofValues',
  'guarantee',
  'guaranteeValues',
  'benefits',
  'benefitsValues',
  'urgencyArgs',
  'urgencyValues',
] as const;

const UPSELL_BODY_MAP = [
  ['upsellEnabled', 'enabled'],
  ['upsellTargetPlan', 'targetPlan'],
  ['upsellWhen', 'when'],
  ['upsellArgument', 'argument'],
] as const;

const DOWNSELL_BODY_MAP = [
  ['downsellEnabled', 'enabled'],
  ['downsellTargetPlan', 'targetPlan'],
  ['downsellWhen', 'when'],
  ['downsellArgument', 'argument'],
] as const;

const TECHNICAL_INFO_KEYS = [
  'hasTechInfo',
  'usageMode',
  'duration',
  'contraindications',
  'expectedResults',
] as const;

function buildCustomerProfilePatch(body: LooseObject, current: LooseObject, input: LooseObject) {
  return removeUndefined({
    ...current,
    ...input,
    ...pickDefined(body, CUSTOMER_PROFILE_KEYS),
  });
}

function buildPositioningPatch(body: LooseObject, current: LooseObject) {
  return removeUndefined({
    ...current,
    ...pickDefined(body, POSITIONING_KEYS),
  });
}

function buildSalesArgumentsPatch(
  body: LooseObject,
  current: LooseObject,
  input: LooseObject,
  followUpInput: LooseObject,
) {
  return removeUndefined({
    ...current,
    ...input,
    ...pickDefined(body, SALES_ARGUMENT_SHARED_KEYS),
    ...pickDefined(followUpInput, SALES_ARGUMENT_SHARED_KEYS),
    ...pickDefined(body, SALES_ARGUMENT_EXTRA_KEYS),
  });
}

function buildUpsellPatch(body: LooseObject, current: LooseObject) {
  return removeUndefined({
    ...current,
    ...pickRenamed(body, UPSELL_BODY_MAP),
  });
}

function buildDownsellPatch(body: LooseObject, current: LooseObject) {
  return removeUndefined({
    ...current,
    ...pickRenamed(body, DOWNSELL_BODY_MAP),
  });
}

function buildFollowUpPatch(body: LooseObject, current: LooseObject, input: LooseObject) {
  const patch: LooseObject = {
    ...current,
    ...input,
    ...pickDefined(body, SALES_ARGUMENT_SHARED_KEYS),
  };
  if (body.followUp !== undefined) {
    patch.schedule = body.followUp;
  }
  if (body.followUpHours !== undefined) {
    patch.hours = parseNumber(body.followUpHours);
  }
  if (body.followUpMax !== undefined) {
    patch.maxFollowUps = parseNumber(body.followUpMax);
  }
  return removeUndefined(patch);
}

function buildTechnicalInfoPatch(body: LooseObject, current: LooseObject) {
  return removeUndefined({
    ...current,
    ...pickDefined(body, TECHNICAL_INFO_KEYS),
  });
}

function normalizeProductAiConfigInput(body: LooseObject, current?: LooseObject | null) {
  const currentCustomerProfile = parseObject(current?.customerProfile);
  const currentPositioning = parseObject(current?.positioning);
  const currentSalesArguments = parseObject(current?.salesArguments);
  const currentUpsellConfig = parseObject(current?.upsellConfig);
  const currentDownsellConfig = parseObject(current?.downsellConfig);
  const currentFollowUpConfig = parseObject(current?.followUpConfig);
  const currentTechnicalInfo = parseObject(current?.technicalInfo);

  const customerProfileInput = parseObject(body.customerProfile);
  const salesArgumentsInput = parseObject(body.salesArguments);
  const followUpConfigInput = parseObject(body.followUpConfig);

  return removeUndefined({
    customerProfile: buildCustomerProfilePatch(body, currentCustomerProfile, customerProfileInput),
    positioning: buildPositioningPatch(body, currentPositioning),
    objections: normalizeAiObjections(body.objections ?? current?.objections),
    salesArguments: buildSalesArgumentsPatch(
      body,
      currentSalesArguments,
      salesArgumentsInput,
      followUpConfigInput,
    ),
    upsellConfig: buildUpsellPatch(body, currentUpsellConfig),
    downsellConfig: buildDownsellPatch(body, currentDownsellConfig),
    tone: normalizeAiTone(body.tone ?? current?.tone),
    persistenceLevel: parseNumber(body.persistenceLevel) ?? parseNumber(body.persistence),
    messageLimit: parseNumber(body.messageLimit),
    followUpConfig: buildFollowUpPatch(body, currentFollowUpConfig, followUpConfigInput),
    technicalInfo: buildTechnicalInfoPatch(body, currentTechnicalInfo),
  });
}

function pickFirstDefined(source: LooseObject, keys: readonly string[], fallback: unknown) {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return fallback;
}

function coerceArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function coerceString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const CUSTOMER_PROFILE_ALIAS_FIELDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['whobuys', ['whobuys', 'idealCustomer']],
  ['pains', ['pains', 'painPoints']],
  ['promise', ['promise', 'promisedResult']],
  ['idealCustomer', ['idealCustomer', 'whobuys']],
  ['painPoints', ['painPoints', 'pains']],
  ['promisedResult', ['promisedResult', 'promise']],
] as const;

const CUSTOMER_PROFILE_STRING_FIELDS = ['knowledge', 'buyingPower', 'problem'] as const;
const CUSTOMER_PROFILE_ARRAY_FIELDS = ['genders', 'ages', 'moments'] as const;

function flattenCustomerProfile(customerProfile: LooseObject): LooseObject {
  const result: LooseObject = {};
  for (const [field, candidates] of CUSTOMER_PROFILE_ALIAS_FIELDS) {
    result[field] = pickFirstDefined(customerProfile, candidates, '');
  }
  for (const field of CUSTOMER_PROFILE_ARRAY_FIELDS) {
    result[field] = coerceArray(customerProfile[field]);
  }
  for (const field of CUSTOMER_PROFILE_STRING_FIELDS) {
    result[field] = coerceString(customerProfile[field]);
  }
  return result;
}

function flattenPositioning(positioning: LooseObject) {
  return {
    tier: positioning.tier || '',
    whenOffer: positioning.whenOffer || [],
    differentiators: positioning.differentiators || [],
    scarcity: positioning.scarcity || [],
    objectionStates: positioning.objectionStates || {},
  };
}

const SALES_ARGUMENTS_ARRAY_FIELDS = [
  'socialProof',
  'guarantee',
  'benefits',
  'urgencyArgs',
] as const;

const SALES_ARGUMENTS_OBJECT_FIELDS = [
  'socialProofValues',
  'guaranteeValues',
  'benefitsValues',
  'urgencyValues',
] as const;

const SALES_ARGUMENTS_BOOLEAN_FALLBACK_FIELDS = [
  'autoCheckoutLink',
  'offerDiscount',
  'useUrgency',
] as const;

function coerceObject(value: unknown): LooseObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as LooseObject) : {};
}

function flattenSalesArguments(
  salesArguments: LooseObject,
  followUpConfig: LooseObject,
): LooseObject {
  const result: LooseObject = {};
  for (const field of SALES_ARGUMENTS_ARRAY_FIELDS) {
    result[field] = coerceArray(salesArguments[field]);
  }
  for (const field of SALES_ARGUMENTS_OBJECT_FIELDS) {
    result[field] = coerceObject(salesArguments[field]);
  }
  for (const field of SALES_ARGUMENTS_BOOLEAN_FALLBACK_FIELDS) {
    result[field] = pickFirstDefined(
      { primary: salesArguments[field], secondary: followUpConfig[field] },
      ['primary', 'secondary'],
      true,
    );
  }
  return result;
}

function flattenUpsellDownsell(upsellConfig: LooseObject, downsellConfig: LooseObject) {
  return {
    upsellEnabled: Boolean(upsellConfig.enabled),
    upsellTargetPlan: upsellConfig.targetPlan || '',
    upsellWhen: upsellConfig.when || '',
    upsellArgument: upsellConfig.argument || '',
    downsellEnabled: Boolean(downsellConfig.enabled),
    downsellTargetPlan: downsellConfig.targetPlan || '',
    downsellWhen: downsellConfig.when || '',
    downsellArgument: downsellConfig.argument || '',
  };
}

function flattenFollowUpTechnical(
  config: LooseObject,
  followUpConfig: LooseObject,
  technicalInfo: LooseObject,
) {
  return {
    persistence: config.persistenceLevel ?? 3,
    followUp: followUpConfig.schedule || '',
    followUpHours: followUpConfig.hours ?? null,
    followUpMax: followUpConfig.maxFollowUps ?? null,
    hasTechInfo: Boolean(technicalInfo.hasTechInfo),
    usageMode: technicalInfo.usageMode || '',
    duration: technicalInfo.duration || '',
    contraindications: technicalInfo.contraindications || [],
    expectedResults: technicalInfo.expectedResults || [],
  };
}

function serializeProductAiConfig(config: LooseObject | null | undefined) {
  if (!config) {
    return null;
  }

  const customerProfile = parseObject(config.customerProfile);
  const positioning = parseObject(config.positioning);
  const salesArguments = parseObject(config.salesArguments);
  const upsellConfig = parseObject(config.upsellConfig);
  const downsellConfig = parseObject(config.downsellConfig);
  const technicalInfo = parseObject(config.technicalInfo);
  const followUpConfig = parseObject(config.followUpConfig);
  const objections = normalizeAiObjections(config.objections);

  return {
    ...config,
    customerProfile,
    positioning,
    objections,
    salesArguments,
    upsellConfig,
    downsellConfig,
    technicalInfo,
    followUpConfig,
    ...flattenCustomerProfile(customerProfile),
    ...flattenPositioning(positioning),
    ...flattenSalesArguments(salesArguments, followUpConfig),
    ...flattenUpsellDownsell(upsellConfig, downsellConfig),
    ...flattenFollowUpTechnical(config, followUpConfig, technicalInfo),
  };
}

/** Product plan controller. */
@Controller('products/:productId/plans')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductPlanController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** List plans. */
  @Get()
  async listPlans(@Param('productId') productId: string, @Request() req: AuthenticatedRequest) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const plans = await this.prisma.productPlan.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return plans.map(serializePlan);
  }

  /** Get plan. */
  @Get(':planId')
  async getPlan(
    @Param('productId') productId: string,
    @Param('planId') planId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, productId },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    return serializePlan(plan);
  }

  /** Create plan. */
  @Post()
  async createPlan(
    @Param('productId') productId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const data = buildPlanData(body);
    if (!data.name) {
      throw new BadRequestException('Nome do plano é obrigatório');
    }

    const created = await this.prisma.productPlan.create({
      data: {
        productId,
        ...data,
        price: data.price ?? 0,
        itemsPerPlan: data.itemsPerPlan ?? 1,
      } as Prisma.ProductPlanUncheckedCreateInput,
    });

    return serializePlan(created);
  }

  /** Update plan. */
  @Put(':planId')
  async updatePlan(
    @Param('productId') productId: string,
    @Param('planId') planId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, productId },
    });
    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    const updated = await this.prisma.productPlan.update({
      where: { id: planId },
      data: buildPlanData(body, plan) as Prisma.ProductPlanUncheckedUpdateInput,
    });

    return serializePlan(updated);
  }

  /** Delete plan. */
  @Delete(':planId')
  async deletePlan(
    @Param('productId') productId: string,
    @Param('planId') planId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, productId },
    });
    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    await this.auditService.log({
      workspaceId: getWorkspaceId(req),
      action: 'DELETE_RECORD',
      resource: 'ProductPlan',
      resourceId: planId,
      details: { deletedBy: 'user', productId },
    });
    return this.prisma.productPlan.delete({ where: { id: planId } });
  }
}

/** Product checkout controller. */
@Controller('products/:productId/checkouts')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductCheckoutController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** List. */
  @Get()
  async list(@Param('productId') productId: string, @Request() req: AuthenticatedRequest) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const checkouts = await this.prisma.productCheckout.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return checkouts.map(serializeCheckout);
  }

  /** Create. */
  @Post()
  async create(
    @Param('productId') productId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const data = buildCheckoutData(body);
    const created = await this.prisma.productCheckout.create({
      data: {
        productId,
        name: safeStr(data.name, 'Novo checkout'),
        active: data.active !== false,
        config: (data.config || {}) as Prisma.InputJsonValue,
      },
    });

    return serializeCheckout(created);
  }

  /** Update. */
  @Put(':checkoutId')
  async update(
    @Param('productId') productId: string,
    @Param('checkoutId') checkoutId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const checkout = await this.prisma.productCheckout.findFirst({
      where: { id: checkoutId, productId },
    });
    if (!checkout) {
      throw new NotFoundException('Checkout não encontrado');
    }

    const updated = await this.prisma.productCheckout.update({
      where: { id: checkoutId },
      data: buildCheckoutData(body, checkout) as Prisma.ProductCheckoutUncheckedUpdateInput,
    });

    return serializeCheckout(updated);
  }

  /** Delete. */
  @Delete(':checkoutId')
  async delete(
    @Param('productId') productId: string,
    @Param('checkoutId') checkoutId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const checkout = await this.prisma.productCheckout.findFirst({
      where: { id: checkoutId, productId },
    });
    if (!checkout) {
      throw new NotFoundException('Checkout não encontrado');
    }

    await this.auditService.log({
      workspaceId: getWorkspaceId(req),
      action: 'DELETE_RECORD',
      resource: 'ProductCheckout',
      resourceId: checkoutId,
      details: { deletedBy: 'user', productId },
    });
    return this.prisma.productCheckout.delete({ where: { id: checkoutId } });
  }
}

/** Product coupon controller. */
@Controller('products/:productId/coupons')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductCouponController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** List. */
  @Get()
  async list(@Param('productId') productId: string, @Request() req: AuthenticatedRequest) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const coupons = await this.prisma.productCoupon.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return coupons.map(serializeCoupon);
  }

  /** Create. */
  @Post()
  async create(
    @Param('productId') productId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    const product = await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const payload = buildCouponData(body);
    const conflict = await findConflictingProductCouponInWorkspace(
      this.prisma,
      getWorkspaceId(req),
      payload.code,
    );
    if (conflict) {
      throw new BadRequestException(
        `O cupom ${payload.code} já está em uso no produto ${conflict.product?.name || conflict.productId}.`,
      );
    }

    const created = await this.prisma.productCoupon.create({
      data: {
        productId,
        ...payload,
      } as Prisma.ProductCouponUncheckedCreateInput,
    });

    await syncWorkspaceCheckoutCouponForProduct(
      this.prisma,
      getWorkspaceId(req),
      product.id,
      created.code,
    );

    return serializeCoupon(created);
  }

  /** Update. */
  @Put(':couponId')
  async update(
    @Param('productId') productId: string,
    @Param('couponId') couponId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const coupon = await this.prisma.productCoupon.findFirst({
      where: { id: couponId, productId },
    });
    if (!coupon) {
      throw new NotFoundException('Cupom não encontrado');
    }

    const payload = buildCouponData({ ...coupon, ...body });
    const conflict = await findConflictingProductCouponInWorkspace(
      this.prisma,
      getWorkspaceId(req),
      payload.code,
      couponId,
    );
    if (conflict) {
      throw new BadRequestException(
        `O cupom ${payload.code} já está em uso no produto ${conflict.product?.name || conflict.productId}.`,
      );
    }

    const updated = await this.prisma.productCoupon.update({
      where: { id: couponId },
      data: payload as Prisma.ProductCouponUncheckedUpdateInput,
    });

    if (coupon.code !== updated.code) {
      await syncWorkspaceCheckoutCouponForProduct(
        this.prisma,
        getWorkspaceId(req),
        productId,
        coupon.code,
      );
    }
    await syncWorkspaceCheckoutCouponForProduct(
      this.prisma,
      getWorkspaceId(req),
      productId,
      updated.code,
    );

    return serializeCoupon(updated);
  }

  /** Validate. */
  @Post('validate')
  async validate(@Param('productId') productId: string, @Body() body: ValidateCouponDto) {
    const coupon = await this.prisma.productCoupon.findUnique({
      where: {
        productId_code: {
          productId,
          code: String(body.code || '').toUpperCase(),
        },
      },
    });

    if (!coupon || !coupon.active) {
      return { valid: false, reason: 'not_found' };
    }
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return { valid: false, reason: 'max_uses' };
    }
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      return { valid: false, reason: 'expired' };
    }

    return { valid: true, coupon: serializeCoupon(coupon) };
  }

  /** Delete. */
  @Delete(':couponId')
  async delete(
    @Param('productId') productId: string,
    @Param('couponId') couponId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const coupon = await this.prisma.productCoupon.findFirst({
      where: { id: couponId, productId },
    });
    if (!coupon) {
      throw new NotFoundException('Cupom não encontrado');
    }

    await this.auditService.log({
      workspaceId: getWorkspaceId(req),
      action: 'DELETE_RECORD',
      resource: 'ProductCoupon',
      resourceId: couponId,
      details: { deletedBy: 'user', productId },
    });
    const deleted = await this.prisma.productCoupon.delete({
      where: { id: couponId },
    });
    await syncWorkspaceCheckoutCouponForProduct(
      this.prisma,
      getWorkspaceId(req),
      productId,
      deleted.code,
    );
    return deleted;
  }
}

/** Product url controller. */
@Controller('products/:productId/urls')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductUrlController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** List. */
  @Get()
  async list(@Param('productId') productId: string, @Request() req: AuthenticatedRequest) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    return this.prisma.productUrl.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Create. */
  @Post()
  async create(
    @Param('productId') productId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    if (!body.description || !body.url) {
      throw new BadRequestException('Descrição e URL são obrigatórias');
    }

    return this.prisma.productUrl.create({
      data: {
        productId,
        description: body.description,
        url: body.url,
        isPrivate: body.isPrivate ?? false,
        active: body.active ?? true,
        aiLearning: body.aiLearning ?? false,
        aiTopics: body.aiTopics,
        aiLearnFreq: body.aiLearnFreq,
        aiLearnStatus: body.aiLearnStatus,
        chatEnabled: body.chatEnabled ?? false,
        chatConfig: body.chatConfig,
      } as Prisma.ProductUrlUncheckedCreateInput,
    });
  }

  /** Update. */
  @Put(':urlId')
  async update(
    @Param('productId') productId: string,
    @Param('urlId') urlId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const url = await this.prisma.productUrl.findFirst({
      where: { id: urlId, productId },
    });
    if (!url) {
      throw new NotFoundException('URL não encontrada');
    }

    return this.prisma.productUrl.update({
      where: { id: urlId },
      data: removeUndefined({
        description: body.description,
        url: body.url,
        isPrivate: body.isPrivate,
        active: body.active,
        aiLearning: body.aiLearning,
        aiTopics: body.aiTopics,
        aiLearnFreq: body.aiLearnFreq,
        aiLearnStatus: body.aiLearnStatus,
        chatEnabled: body.chatEnabled,
        chatConfig: body.chatConfig,
      }) as Prisma.ProductUrlUncheckedUpdateInput,
    });
  }

  /** Delete. */
  @Delete(':urlId')
  async delete(
    @Param('productId') productId: string,
    @Param('urlId') urlId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const url = await this.prisma.productUrl.findFirst({
      where: { id: urlId, productId },
    });
    if (!url) {
      throw new NotFoundException('URL não encontrada');
    }

    await this.auditService.log({
      workspaceId: getWorkspaceId(req),
      action: 'DELETE_RECORD',
      resource: 'ProductUrl',
      resourceId: urlId,
      details: { deletedBy: 'user', productId },
    });
    return this.prisma.productUrl.delete({ where: { id: urlId } });
  }
}

/** Product campaign controller. */
@Controller('products/:productId/campaigns')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductCampaignController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly campaignsService: CampaignsService,
  ) {}

  private buildCampaignFilters(
    productId: string,
    productCampaign: LooseObject,
    body?: LooseObject,
  ) {
    const input = parseObject(body);
    return removeUndefined({
      productId,
      productCampaignId: productCampaign.id,
      productCampaignCode: productCampaign.code,
      pixelId: input.pixelId ?? productCampaign.pixelId ?? null,
      tags: toStringList(input.tags),
      smartTime: input.smartTime === true,
    });
  }

  private async listWorkspaceCampaigns(workspaceId: string) {
    return this.prisma.campaign.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        status: true,
        scheduledAt: true,
        messageTemplate: true,
        filters: true,
        stats: true,
        aiStrategy: true,
        parentId: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 500,
      orderBy: { createdAt: 'desc' },
    });
  }

  private async ensureLinkedCampaign(
    workspaceId: string,
    product: LooseObject,
    productCampaign: LooseObject,
    body?: LooseObject,
  ) {
    const campaigns = await this.listWorkspaceCampaigns(workspaceId);
    const linkedCampaign = findLinkedCampaignForProductCampaign(campaigns, productCampaign);
    const linkedFilters = parseObject(linkedCampaign?.filters);
    const nextFilters = {
      ...linkedFilters,
      ...this.buildCampaignFilters(safeStr(product.id), productCampaign, body),
    } as Prisma.InputJsonValue;
    const nextMessage =
      safeStr(body?.messageTemplate || linkedCampaign?.messageTemplate).trim() ||
      buildDefaultCampaignMessage(product);
    const nextStrategy = safeStr(body?.aiStrategy || linkedCampaign?.aiStrategy, 'BALANCED').trim();

    if (linkedCampaign) {
      return this.prisma.campaign.update({
        where: { id: safeStr(linkedCampaign.id) },
        data: {
          name: safeStr(body?.name || productCampaign.name),
          messageTemplate: nextMessage,
          filters: nextFilters,
          aiStrategy: nextStrategy,
        },
      });
    }

    return this.campaignsService.create(workspaceId, {
      name: safeStr(body?.name || productCampaign.name),
      messageTemplate: nextMessage,
      filters: nextFilters,
      aiStrategy: nextStrategy,
    });
  }

  /** List. */
  @Get()
  async list(@Param('productId') productId: string, @Request() req: AuthenticatedRequest) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const [productCampaigns, workspaceCampaigns] = await Promise.all([
      this.prisma.productCampaign.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.listWorkspaceCampaigns(getWorkspaceId(req)),
    ]);

    return productCampaigns.map((campaign) =>
      serializeProductCampaignRecord(
        campaign,
        findLinkedCampaignForProductCampaign(workspaceCampaigns, campaign),
      ),
    );
  }

  /** Create. */
  @Post()
  async create(
    @Param('productId') productId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    const product = await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    if (!safeStr(body.name).trim()) {
      throw new BadRequestException('Nome da campanha é obrigatório');
    }

    const createdProductCampaign = await this.prisma.productCampaign.create({
      data: {
        productId,
        name: safeStr(body.name).trim(),
        pixelId: body.pixelId ? safeStr(body.pixelId).trim() : null,
      },
    });

    const linkedCampaign = await this.ensureLinkedCampaign(
      getWorkspaceId(req),
      product,
      createdProductCampaign,
      body,
    );

    return serializeProductCampaignRecord(createdProductCampaign, linkedCampaign);
  }

  /** Update. */
  @Put(':campaignId')
  async update(
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    const product = await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const productCampaign = await this.prisma.productCampaign.findFirst({
      where: { id: campaignId, productId },
    });
    if (!productCampaign) {
      throw new NotFoundException('Campanha não encontrada');
    }

    const updatedProductCampaign = await this.prisma.productCampaign.update({
      where: { id: campaignId },
      data: removeUndefined({
        name: body.name ? safeStr(body.name).trim() : undefined,
        pixelId: body.pixelId !== undefined ? safeStr(body.pixelId).trim() || null : undefined,
      }) as Prisma.ProductCampaignUncheckedUpdateInput,
    });

    const linkedCampaign = await this.ensureLinkedCampaign(
      getWorkspaceId(req),
      product,
      updatedProductCampaign,
      body,
    );

    return serializeProductCampaignRecord(updatedProductCampaign, linkedCampaign);
  }

  /** Launch. */
  @Post(':campaignId/launch')
  async launch(
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    const product = await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const productCampaign = await this.prisma.productCampaign.findFirst({
      where: { id: campaignId, productId },
    });
    if (!productCampaign) {
      throw new NotFoundException('Campanha não encontrada');
    }

    const linkedCampaign = await this.ensureLinkedCampaign(
      getWorkspaceId(req),
      product,
      productCampaign,
      body,
    );

    return this.campaignsService.launch(
      getWorkspaceId(req),
      linkedCampaign.id,
      body.smartTime === true,
    );
  }

  /** Pause. */
  @Post(':campaignId/pause')
  async pause(
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const productCampaign = await this.prisma.productCampaign.findFirst({
      where: { id: campaignId, productId },
    });
    if (!productCampaign) {
      throw new NotFoundException('Campanha não encontrada');
    }

    const linkedCampaign = findLinkedCampaignForProductCampaign(
      await this.listWorkspaceCampaigns(getWorkspaceId(req)),
      productCampaign,
    );
    if (!linkedCampaign) {
      throw new NotFoundException('Campanha operacional não encontrada');
    }

    return this.campaignsService.pause(getWorkspaceId(req), safeStr(linkedCampaign.id));
  }

  /** Delete. */
  @Delete(':campaignId')
  async delete(
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const campaign = await this.prisma.productCampaign.findFirst({
      where: { id: campaignId, productId },
    });
    if (!campaign) {
      throw new NotFoundException('Campanha não encontrada');
    }

    const linkedCampaign = findLinkedCampaignForProductCampaign(
      await this.listWorkspaceCampaigns(getWorkspaceId(req)),
      campaign,
    );

    await this.auditService.log({
      workspaceId: getWorkspaceId(req),
      action: 'DELETE_RECORD',
      resource: 'ProductCampaign',
      resourceId: campaignId,
      details: { deletedBy: 'user', productId },
    });

    if (linkedCampaign) {
      await this.prisma.campaign.delete({
        where: { id: safeStr(linkedCampaign.id) },
      });
    }

    return this.prisma.productCampaign.delete({ where: { id: campaignId } });
  }
}

/** Product ai config controller. */
@Controller('products/:productId/ai-config')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductAIConfigController {
  constructor(private readonly prisma: PrismaService) {}

  /** Get. */
  @Get()
  async get(@Param('productId') productId: string, @Request() req: AuthenticatedRequest) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const config = await this.prisma.productAIConfig.findUnique({
      where: { productId },
    });

    return serializeProductAiConfig(config);
  }

  /** Upsert. */
  @Put()
  async upsert(
    @Param('productId') productId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const current = await this.prisma.productAIConfig.findUnique({
      where: { productId },
    });
    const normalized = normalizeProductAiConfigInput(body, current);

    const saved = await this.prisma.productAIConfig.upsert({
      where: { productId },
      update: normalized as Prisma.InputJsonValue as Prisma.ProductAIConfigUncheckedUpdateInput,
      create: { productId, ...normalized } as Prisma.ProductAIConfigUncheckedCreateInput,
    });

    return serializeProductAiConfig(saved);
  }
}

/** Product review controller. */
@Controller('products/:productId/reviews')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductReviewController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** List. */
  @Get()
  async list(@Param('productId') productId: string, @Request() req: AuthenticatedRequest) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const reviews = await this.prisma.productReview.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return reviews.map(serializeReview);
  }

  /** Create. */
  @Post()
  async create(
    @Param('productId') productId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const rating = parseNumber(body.rating) ?? 5;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('A nota da avaliação precisa ficar entre 1 e 5');
    }

    const authorName = normalizeOptionalText(body.authorName ?? body.name);
    if (!authorName) {
      throw new BadRequestException('Nome do autor da avaliação é obrigatório');
    }

    const comment = normalizeOptionalText(body.comment ?? body.text);

    const created = await this.prisma.productReview.create({
      data: {
        productId,
        rating,
        comment,
        authorName,
        verified: (body.verified ?? false) as boolean,
      },
    });

    return serializeReview(created);
  }

  /** Delete. */
  @Delete(':reviewId')
  async delete(
    @Param('productId') productId: string,
    @Param('reviewId') reviewId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const review = await this.prisma.productReview.findFirst({
      where: { id: reviewId, productId },
    });
    if (!review) {
      throw new NotFoundException('Avaliação não encontrada');
    }

    await this.auditService.log({
      workspaceId: getWorkspaceId(req),
      action: 'DELETE_RECORD',
      resource: 'ProductReview',
      resourceId: reviewId,
      details: { deletedBy: 'user', productId },
    });
    return this.prisma.productReview.delete({ where: { id: reviewId } });
  }
}

/** Product commission controller. */
@Controller('products/:productId/commissions')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductCommissionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly partnershipsService: PartnershipsService,
  ) {}

  /** List. */
  @Get()
  async list(@Param('productId') productId: string, @Request() req: AuthenticatedRequest) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    return this.prisma.productCommission.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Create. */
  @Post()
  async create(
    @Param('productId') productId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    const workspaceId = getWorkspaceId(req);
    await ensureWorkspaceProductAccess(this.prisma, productId, workspaceId);

    const payload = buildCommissionPayload(body);
    await ensureNoDuplicateCommission(this.prisma, productId, payload);

    const commission = await this.prisma.productCommission.create({
      data: {
        productId,
        ...payload,
      } as Prisma.ProductCommissionUncheckedCreateInput,
    });

    if (payload.agentEmail && COMMISSION_PARTNER_INVITE_ROLES.has(payload.role)) {
      try {
        await this.partnershipsService.createPartner(workspaceId, {
          partnerName: payload.agentName || payload.agentEmail,
          partnerEmail: payload.agentEmail,
          type: payload.role,
          commissionRate: payload.percentage,
        });
      } catch (error) {
        await this.prisma.productCommission
          .delete({ where: { id: commission.id } })
          .catch(() => undefined);
        throw error;
      }
    }

    return commission;
  }

  /** Update. */
  @Put(':commissionId')
  async update(
    @Param('productId') productId: string,
    @Param('commissionId') commissionId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const commission = await this.prisma.productCommission.findFirst({
      where: { id: commissionId, productId },
    });
    if (!commission) {
      throw new NotFoundException('Comissão não encontrada');
    }

    const payload = buildCommissionPayload(body, commission as LooseObject);
    await ensureNoDuplicateCommission(this.prisma, productId, payload, commissionId);

    return this.prisma.productCommission.update({
      where: { id: commissionId },
      data: payload as Prisma.ProductCommissionUncheckedUpdateInput,
    });
  }

  /** Delete. */
  @Delete(':commissionId')
  async delete(
    @Param('productId') productId: string,
    @Param('commissionId') commissionId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const commission = await this.prisma.productCommission.findFirst({
      where: { id: commissionId, productId },
    });
    if (!commission) {
      throw new NotFoundException('Comissão não encontrada');
    }

    await this.auditService.log({
      workspaceId: getWorkspaceId(req),
      action: 'DELETE_RECORD',
      resource: 'ProductCommission',
      resourceId: commissionId,
      details: { deletedBy: 'user', productId },
    });
    return this.prisma.productCommission.delete({
      where: { id: commissionId },
    });
  }
}

/** Product affiliate controller. */
@Controller('products/:productId/affiliates')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductAffiliateController {
  constructor(private readonly prisma: PrismaService) {}

  /** Get summary. */
  @Get()
  async getSummary(@Param('productId') productId: string, @Request() req: AuthenticatedRequest) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    return buildAffiliateSummary(this.prisma, req, productId);
  }

  /** Update config. */
  @Put()
  async updateConfig(
    @Param('productId') productId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    const currentProduct = await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const commissionPercent = parseNumber(body.commissionPercent);
    assertPercentageRange(commissionPercent, 'A comissão');

    const commissionCookieDays = parseNumber(body.commissionCookieDays);
    if (
      commissionCookieDays !== undefined &&
      (commissionCookieDays < 1 || commissionCookieDays > 3650)
    ) {
      throw new BadRequestException('O cookie precisa ficar entre 1 e 3650 dias');
    }

    const commissionType =
      body.commissionType !== undefined ? safeStr(body.commissionType).trim() : undefined;
    if (
      commissionType !== undefined &&
      !(PRODUCT_COMMISSION_TYPE_VALUES as readonly string[]).includes(commissionType)
    ) {
      throw new BadRequestException('Tipo de comissionamento é inválido');
    }

    const commissionLastClickPercent = parseNumber(body.commissionLastClickPercent);
    const commissionOtherClicksPercent = parseNumber(body.commissionOtherClicksPercent);
    assertPercentageRange(commissionLastClickPercent, 'O percentual do último clique');
    assertPercentageRange(commissionOtherClicksPercent, 'O percentual dos demais cliques');

    const nextCommissionType = commissionType ?? currentProduct.commissionType;
    const shouldTouchProportionalWeights =
      commissionType !== undefined ||
      body.commissionLastClickPercent !== undefined ||
      body.commissionOtherClicksPercent !== undefined;

    if (nextCommissionType === 'proportional' && shouldTouchProportionalWeights) {
      const total =
        (commissionLastClickPercent ?? currentProduct.commissionLastClickPercent ?? 70) +
        (commissionOtherClicksPercent ?? currentProduct.commissionOtherClicksPercent ?? 30);
      if (Math.abs(total - 100) > 0.01) {
        throw new BadRequestException(
          'Na divisão proporcional a soma dos percentuais precisa fechar 100%',
        );
      }
    }

    const productPayload = removeUndefined({
      affiliateEnabled: body.affiliateEnabled,
      affiliateVisible: body.affiliateVisible,
      affiliateAutoApprove: body.affiliateAutoApprove,
      affiliateAccessData: body.affiliateAccessData,
      affiliateAccessAbandoned: body.affiliateAccessAbandoned,
      affiliateFirstInstallment: body.affiliateFirstInstallment,
      commissionType,
      commissionCookieDays,
      commissionPercent,
      commissionLastClickPercent:
        nextCommissionType === 'proportional' && shouldTouchProportionalWeights
          ? (commissionLastClickPercent ?? currentProduct.commissionLastClickPercent ?? 70)
          : commissionType !== undefined
            ? null
            : undefined,
      commissionOtherClicksPercent:
        nextCommissionType === 'proportional' && shouldTouchProportionalWeights
          ? (commissionOtherClicksPercent ?? currentProduct.commissionOtherClicksPercent ?? 30)
          : commissionType !== undefined
            ? null
            : undefined,
      merchandContent:
        body.merchandContent !== undefined
          ? normalizeOptionalText(body.merchandContent)
          : undefined,
      affiliateTerms:
        body.affiliateTerms !== undefined ? normalizeOptionalText(body.affiliateTerms) : undefined,
      category: body.category,
      tags: body.tags,
      imageUrl: body.imageUrl,
    });

    const updatedProduct = await this.prisma.product.update({
      where: { id: productId },
      data: productPayload as Prisma.ProductUncheckedUpdateInput,
    });

    const existingAffiliateProduct = await this.prisma.affiliateProduct.findUnique({
      where: { productId },
    });
    const affiliatePayload = buildAffiliateProductData(updatedProduct);
    const shouldPersistAffiliateProduct =
      Boolean(updatedProduct.affiliateEnabled) ||
      Boolean(updatedProduct.affiliateVisible) ||
      Boolean(existingAffiliateProduct);

    if (shouldPersistAffiliateProduct) {
      await this.prisma.affiliateProduct.upsert({
        where: { productId },
        create: {
          productId,
          ...affiliatePayload,
        },
        update: affiliatePayload,
      });
    }

    return buildAffiliateSummary(this.prisma, req, productId);
  }

  /** Approve request. */
  @Post('requests/:requestId/approve')
  async approveRequest(
    @Param('productId') productId: string,
    @Param('requestId') requestId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const request = await this.prisma.affiliateRequest.findFirst({
      where: {
        id: requestId,
        affiliateProduct: {
          productId,
        },
      },
    });
    if (!request) {
      throw new NotFoundException('Solicitação de afiliado não encontrada');
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.affiliateRequest.update({
          where: { id: requestId },
          data: { status: 'APPROVED' },
        });

        const existingLink = await tx.affiliateLink.findFirst({
          where: {
            affiliateProductId: request.affiliateProductId,
            affiliateWorkspaceId: request.affiliateWorkspaceId,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (existingLink) {
          if (!existingLink.active) {
            await tx.affiliateLink.update({
              where: { id: existingLink.id },
              data: { active: true },
            });
          }
        } else {
          const code = await generateAffiliatePublicCode(tx);
          await tx.affiliateLink.create({
            data: {
              affiliateProductId: request.affiliateProductId,
              affiliateWorkspaceId: request.affiliateWorkspaceId,
              code,
            },
          });
        }
      },
      { isolationLevel: 'ReadCommitted' },
    );

    await recalculateAffiliateProductCounters(this.prisma, request.affiliateProductId);

    return buildAffiliateSummary(this.prisma, req, productId);
  }

  /** Reject request. */
  @Post('requests/:requestId/reject')
  async rejectRequest(
    @Param('productId') productId: string,
    @Param('requestId') requestId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    const request = await this.prisma.affiliateRequest.findFirst({
      where: {
        id: requestId,
        affiliateProduct: {
          productId,
        },
      },
    });
    if (!request) {
      throw new NotFoundException('Solicitação de afiliado não encontrada');
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.affiliateRequest.update({
          where: { id: requestId },
          data: { status: 'REJECTED' },
        });
        await tx.affiliateLink.updateMany({
          where: {
            affiliateProductId: request.affiliateProductId,
            affiliateWorkspaceId: request.affiliateWorkspaceId,
          },
          data: { active: false },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );

    await recalculateAffiliateProductCounters(this.prisma, request.affiliateProductId);

    return buildAffiliateSummary(this.prisma, req, productId);
  }

  /** Update link. */
  @Put('links/:linkId')
  async updateLink(
    @Param('productId') productId: string,
    @Param('linkId') linkId: string,
    @Body() body: LooseObject, // idempotencyKey accepted
    @Request() req: AuthenticatedRequest,
  ) {
    await ensureWorkspaceProductAccess(this.prisma, productId, getWorkspaceId(req));

    if (typeof body.active !== 'boolean') {
      throw new BadRequestException('Informe se o link deve ficar ativo ou não');
    }

    const link = await this.prisma.affiliateLink.findFirst({
      where: {
        id: linkId,
        affiliateProduct: {
          productId,
        },
      },
    });
    if (!link) {
      throw new NotFoundException('Link de afiliado não encontrado');
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.affiliateLink.update({
          where: { id: linkId },
          data: { active: body.active },
        });

        if (body.active) {
          await tx.affiliateRequest.updateMany({
            where: {
              affiliateProductId: link.affiliateProductId,
              affiliateWorkspaceId: link.affiliateWorkspaceId,
            },
            data: { status: 'APPROVED' },
          });
        }
      },
      { isolationLevel: 'ReadCommitted' },
    );

    await recalculateAffiliateProductCounters(this.prisma, link.affiliateProductId);

    return buildAffiliateSummary(this.prisma, req, productId);
  }
}
