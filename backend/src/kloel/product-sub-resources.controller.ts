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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { normalizeStorageUrlForRequest } from '../common/storage/public-storage-url.util';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

type LooseObject = Record<string, any>;

function getWorkspaceId(req: any): string {
  return req.user?.workspaceId || req.workspaceId;
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

function parseObject(value: any): LooseObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value;
}

function parseNumber(value: any) {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function slugifyPlan(name: string, id: string) {
  const base = String(name || 'plano')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return `${base || 'plano'}-${id.slice(0, 8)}`;
}

function removeUndefined<T extends LooseObject>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
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
    if (entry !== undefined) next[key] = entry;
  }

  return next;
}

function buildPackagingConfig(body: LooseObject, current: LooseObject) {
  const next = { ...current };
  const dimensions =
    body.dimensions && typeof body.dimensions === 'object'
      ? removeUndefined({
          width: parseNumber(body.dimensions.width),
          height: parseNumber(body.dimensions.height),
          length: parseNumber(body.dimensions.length),
        })
      : undefined;

  const patches: LooseObject = {
    packageType: body.packageType,
    dimensions,
    weight: parseNumber(body.weight),
  };

  for (const [key, entry] of Object.entries(patches)) {
    if (entry !== undefined) next[key] = entry;
  }

  return next;
}

function buildShippingConfig(body: LooseObject, current: LooseObject) {
  const next = { ...current };
  const requestedFreightType =
    typeof body.freightType === 'string'
      ? body.freightType
      : typeof body.shippingCost === 'string'
        ? body.shippingCost
        : undefined;

  let freightType = requestedFreightType;
  if (body.freeShipping === true) freightType = 'free';
  if (body.freeShipping === false && freightType === undefined) {
    freightType = current.freightType === 'free' ? 'calculated' : current.freightType;
  }

  const fixedFreight =
    parseNumber(body.fixedFreight) ?? parseNumber(body.shippingPrice);
  const shippingCostNumber =
    fixedFreight ?? parseNumber(body.shippingCost);

  const patches: LooseObject = {
    shipper: body.shipper ?? body.whoShips,
    shipFrom: body.shipFrom,
    dispatchTime: body.dispatchTime,
    carriers: Array.isArray(body.carriers) ? body.carriers : undefined,
    freightType,
    fixedFreight: shippingCostNumber,
    tracking: body.tracking,
    regionPrazos:
      body.regionPrazos && typeof body.regionPrazos === 'object'
        ? body.regionPrazos
        : undefined,
    faqAnswers:
      body.faqAnswers && typeof body.faqAnswers === 'object'
        ? body.faqAnswers
        : undefined,
  };

  for (const [key, entry] of Object.entries(patches)) {
    if (entry !== undefined) next[key] = entry;
  }

  return next;
}

function buildPlanData(body: LooseObject, current?: LooseObject) {
  const currentExtra = parseObject(current?.checkoutImages);
  const currentPackaging = parseObject(current?.packagingConfig);
  const currentShipping = parseObject(current?.shippingConfig);

  const price =
    parseNumber(body.price) ??
    (parseNumber(body.priceInCents) !== undefined
      ? Number(parseNumber(body.priceInCents)! / 100)
      : undefined);
  const itemsPerPlan =
    parseNumber(body.itemsPerPlan) ??
    parseNumber(body.quantity) ??
    parseNumber(body.items);
  const active = body.active ?? body.isActive ?? body.available;
  const visibleToAffiliates =
    body.visibleToAffiliates ??
    (body.hideAffiliates !== undefined ? !body.hideAffiliates : undefined);
  const maxNoInterest =
    parseNumber(body.maxNoInterest) ??
    parseNumber(body.interestFreeInstallments);
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

function serializePlan(plan: LooseObject) {
  const extra = parseObject(plan.checkoutImages);
  const packaging = parseObject(plan.packagingConfig);
  const shipping = parseObject(plan.shippingConfig);
  const freightType =
    typeof shipping.freightType === 'string' ? shipping.freightType : '';

  return {
    ...plan,
    slug: slugifyPlan(plan.name, plan.id),
    referenceCode: plan.id.slice(0, 8).toUpperCase(),
    priceInCents: Math.round(Number(plan.price || 0) * 100),
    quantity: plan.itemsPerPlan,
    items: plan.itemsPerPlan,
    isActive: plan.active,
    available: plan.active,
    hideAffiliates: !plan.visibleToAffiliates,
    interestFreeInstallments: plan.maxNoInterest,
    subscriptionPeriod: plan.recurringInterval,
    freeShipping:
      freightType.toLowerCase() === 'free' || shipping.freeShipping === true,
    shippingPrice:
      shipping.fixedFreight ?? shipping.shippingValue ?? null,
    packageType: packaging.packageType || '',
    dimensions: packaging.dimensions || {},
    weight: packaging.weight ?? '',
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
    imageUrl: extra.imageUrl || null,
    redirectUrl: extra.redirectUrl || '',
    freeSample: extra.freeSample ?? false,
    requireEmail: extra.requireEmail ?? true,
    requireEmailConfirm: extra.requireEmailConfirm ?? false,
    requireAddress: extra.requireAddress ?? false,
    limitSales: extra.limitSales ?? false,
    salesLimit: extra.salesLimit ?? '',
    limitPerApproved: extra.limitPerApproved ?? false,
    approvedLimit: extra.approvedLimit ?? '',
    minStock: extra.minStock ?? false,
    stockMin: extra.stockMin ?? '',
    notifyBoleto: extra.notifyBoleto ?? true,
    limitedBilling: extra.limitedBilling ?? false,
    affiliateRecurring: extra.affiliateRecurring ?? true,
    boletoInstallment: extra.boletoInstallment ?? false,
    boletoInstallments: extra.boletoInstallments ?? '',
    boletoInterest: extra.boletoInterest ?? false,
    paymentMethods: extra.paymentMethods || {
      credit: true,
      boleto: true,
      pix: true,
    },
  };
}

function buildCheckoutData(body: LooseObject, current?: LooseObject) {
  const currentConfig = parseObject(current?.config);
  const configInput =
    body.config && typeof body.config === 'object' ? body.config : {};
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
  const rawType =
    typeof body.discountType === 'string' ? body.discountType.toUpperCase() : '';
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
    code: String(body.code).trim().toUpperCase(),
    discountType,
    discountValue,
    maxUses: parseNumber(body.maxUses),
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    active: body.active,
  });
}

function serializeCoupon(coupon: LooseObject) {
  return {
    ...coupon,
    discountPercent:
      coupon.discountType === 'PERCENT' ? coupon.discountValue : 0,
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

function serializeAffiliateProductForResponse(req: any, product: any) {
  if (!product) return product;

  return {
    ...product,
    thumbnailUrl:
      normalizeStorageUrlForRequest(product.thumbnailUrl, req) || null,
  };
}

@Controller('products/:productId/plans')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductPlanController {
  constructor(private readonly prisma: PrismaService, private readonly auditService: AuditService) {}

  @Get()
  async listPlans(@Param('productId') productId: string, @Request() req: any) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const plans = await this.prisma.productPlan.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });

    return plans.map(serializePlan);
  }

  @Get(':planId')
  async getPlan(
    @Param('productId') productId: string,
    @Param('planId') planId: string,
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, productId },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    return serializePlan(plan);
  }

  @Post()
  async createPlan(
    @Param('productId') productId: string,
    @Body() body: LooseObject,
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

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
      } as any,
    });

    return serializePlan(created);
  }

  @Put(':planId')
  async updatePlan(
    @Param('productId') productId: string,
    @Param('planId') planId: string,
    @Body() body: LooseObject,
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, productId },
    });
    if (!plan) throw new NotFoundException('Plano não encontrado');

    const updated = await this.prisma.productPlan.update({
      where: { id: planId },
      data: buildPlanData(body, plan) as any,
    });

    return serializePlan(updated);
  }

  @Delete(':planId')
  async deletePlan(
    @Param('productId') productId: string,
    @Param('planId') planId: string,
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, productId },
    });
    if (!plan) throw new NotFoundException('Plano não encontrado');

    await this.auditService.log({ workspaceId: getWorkspaceId(req), action: 'DELETE_RECORD', resource: 'ProductPlan', resourceId: planId, details: { deletedBy: 'user', productId } });
    return this.prisma.productPlan.delete({ where: { id: planId } });
  }
}

@Controller('products/:productId/checkouts')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductCheckoutController {
  constructor(private readonly prisma: PrismaService, private readonly auditService: AuditService) {}

  @Get()
  async list(@Param('productId') productId: string, @Request() req: any) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const checkouts = await this.prisma.productCheckout.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });

    return checkouts.map(serializeCheckout);
  }

  @Post()
  async create(
    @Param('productId') productId: string,
    @Body() body: LooseObject,
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const data = buildCheckoutData(body);
    const created = await this.prisma.productCheckout.create({
      data: {
        productId,
        name: data.name || 'Novo checkout',
        active: data.active ?? true,
        config: data.config || {},
      } as any,
    });

    return serializeCheckout(created);
  }

  @Put(':checkoutId')
  async update(
    @Param('productId') productId: string,
    @Param('checkoutId') checkoutId: string,
    @Body() body: LooseObject,
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const checkout = await this.prisma.productCheckout.findFirst({
      where: { id: checkoutId, productId },
    });
    if (!checkout) throw new NotFoundException('Checkout não encontrado');

    const updated = await this.prisma.productCheckout.update({
      where: { id: checkoutId },
      data: buildCheckoutData(body, checkout) as any,
    });

    return serializeCheckout(updated);
  }

  @Delete(':checkoutId')
  async delete(
    @Param('productId') productId: string,
    @Param('checkoutId') checkoutId: string,
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const checkout = await this.prisma.productCheckout.findFirst({
      where: { id: checkoutId, productId },
    });
    if (!checkout) throw new NotFoundException('Checkout não encontrado');

    await this.auditService.log({ workspaceId: getWorkspaceId(req), action: 'DELETE_RECORD', resource: 'ProductCheckout', resourceId: checkoutId, details: { deletedBy: 'user', productId } });
    return this.prisma.productCheckout.delete({ where: { id: checkoutId } });
  }
}

@Controller('products/:productId/coupons')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductCouponController {
  constructor(private readonly prisma: PrismaService, private readonly auditService: AuditService) {}

  @Get()
  async list(@Param('productId') productId: string, @Request() req: any) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const coupons = await this.prisma.productCoupon.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });

    return coupons.map(serializeCoupon);
  }

  @Post()
  async create(
    @Param('productId') productId: string,
    @Body() body: LooseObject,
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const created = await this.prisma.productCoupon.create({
      data: {
        productId,
        ...buildCouponData(body),
      } as any,
    });

    return serializeCoupon(created);
  }

  @Put(':couponId')
  async update(
    @Param('productId') productId: string,
    @Param('couponId') couponId: string,
    @Body() body: LooseObject,
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const coupon = await this.prisma.productCoupon.findFirst({
      where: { id: couponId, productId },
    });
    if (!coupon) throw new NotFoundException('Cupom não encontrado');

    const updated = await this.prisma.productCoupon.update({
      where: { id: couponId },
      data: buildCouponData({ ...coupon, ...body }) as any,
    });

    return serializeCoupon(updated);
  }

  @Post('validate')
  async validate(
    @Param('productId') productId: string,
    @Body() body: { code: string },
  ) {
    const coupon = await this.prisma.productCoupon.findUnique({
      where: {
        productId_code: { productId, code: String(body.code || '').toUpperCase() },
      },
    });

    if (!coupon || !coupon.active) return { valid: false, reason: 'not_found' };
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses)
      return { valid: false, reason: 'max_uses' };
    if (coupon.expiresAt && coupon.expiresAt < new Date())
      return { valid: false, reason: 'expired' };

    return { valid: true, coupon: serializeCoupon(coupon) };
  }

  @Delete(':couponId')
  async delete(
    @Param('productId') productId: string,
    @Param('couponId') couponId: string,
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const coupon = await this.prisma.productCoupon.findFirst({
      where: { id: couponId, productId },
    });
    if (!coupon) throw new NotFoundException('Cupom não encontrado');

    await this.auditService.log({ workspaceId: getWorkspaceId(req), action: 'DELETE_RECORD', resource: 'ProductCoupon', resourceId: couponId, details: { deletedBy: 'user', productId } });
    return this.prisma.productCoupon.delete({ where: { id: couponId } });
  }
}

@Controller('products/:productId/urls')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductUrlController {
  constructor(private readonly prisma: PrismaService, private readonly auditService: AuditService) {}

  @Get()
  async list(@Param('productId') productId: string, @Request() req: any) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    return this.prisma.productUrl.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(
    @Param('productId') productId: string,
    @Body() body: LooseObject,
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

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
      } as any,
    });
  }

  @Put(':urlId')
  async update(
    @Param('productId') productId: string,
    @Param('urlId') urlId: string,
    @Body() body: LooseObject,
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const url = await this.prisma.productUrl.findFirst({
      where: { id: urlId, productId },
    });
    if (!url) throw new NotFoundException('URL não encontrada');

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
      }) as any,
    });
  }

  @Delete(':urlId')
  async delete(
    @Param('productId') productId: string,
    @Param('urlId') urlId: string,
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const url = await this.prisma.productUrl.findFirst({
      where: { id: urlId, productId },
    });
    if (!url) throw new NotFoundException('URL não encontrada');

    await this.auditService.log({ workspaceId: getWorkspaceId(req), action: 'DELETE_RECORD', resource: 'ProductUrl', resourceId: urlId, details: { deletedBy: 'user', productId } });
    return this.prisma.productUrl.delete({ where: { id: urlId } });
  }
}

@Controller('products/:productId/campaigns')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductCampaignController {
  constructor(private readonly prisma: PrismaService, private readonly auditService: AuditService) {}

  @Get()
  async list(@Param('productId') productId: string, @Request() req: any) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    return this.prisma.productCampaign.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(
    @Param('productId') productId: string,
    @Body() body: { name: string; pixelId?: string },
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    if (!body.name) {
      throw new BadRequestException('Nome da campanha é obrigatório');
    }

    return this.prisma.productCampaign.create({
      data: { productId, name: body.name, pixelId: body.pixelId || null },
    });
  }

  @Delete(':campaignId')
  async delete(
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const campaign = await this.prisma.productCampaign.findFirst({
      where: { id: campaignId, productId },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');

    await this.auditService.log({ workspaceId: getWorkspaceId(req), action: 'DELETE_RECORD', resource: 'ProductCampaign', resourceId: campaignId, details: { deletedBy: 'user', productId } });
    return this.prisma.productCampaign.delete({ where: { id: campaignId } });
  }
}

@Controller('products/:productId/ai-config')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductAIConfigController {
  constructor(private readonly prisma: PrismaService, private readonly auditService: AuditService) {}

  @Get()
  async get(@Param('productId') productId: string, @Request() req: any) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    return this.prisma.productAIConfig.findUnique({
      where: { productId },
    });
  }

  @Put()
  async upsert(
    @Param('productId') productId: string,
    @Body() body: LooseObject,
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    return this.prisma.productAIConfig.upsert({
      where: { productId },
      update: body,
      create: { productId, ...body },
    });
  }
}

@Controller('products/:productId/reviews')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductReviewController {
  constructor(private readonly prisma: PrismaService, private readonly auditService: AuditService) {}

  @Get()
  async list(@Param('productId') productId: string, @Request() req: any) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const reviews = await this.prisma.productReview.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });

    return reviews.map(serializeReview);
  }

  @Post()
  async create(
    @Param('productId') productId: string,
    @Body() body: LooseObject,
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const created = await this.prisma.productReview.create({
      data: {
        productId,
        rating: parseNumber(body.rating) ?? 5,
        comment: body.comment ?? body.text ?? null,
        authorName: body.authorName ?? body.name ?? null,
        verified: body.verified ?? false,
      } as any,
    });

    return serializeReview(created);
  }

  @Delete(':reviewId')
  async delete(
    @Param('productId') productId: string,
    @Param('reviewId') reviewId: string,
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const review = await this.prisma.productReview.findFirst({
      where: { id: reviewId, productId },
    });
    if (!review) throw new NotFoundException('Avaliação não encontrada');

    await this.auditService.log({ workspaceId: getWorkspaceId(req), action: 'DELETE_RECORD', resource: 'ProductReview', resourceId: reviewId, details: { deletedBy: 'user', productId } });
    return this.prisma.productReview.delete({ where: { id: reviewId } });
  }
}

@Controller('products/:productId/commissions')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductCommissionController {
  constructor(private readonly prisma: PrismaService, private readonly auditService: AuditService) {}

  @Get()
  async list(@Param('productId') productId: string, @Request() req: any) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    return this.prisma.productCommission.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(
    @Param('productId') productId: string,
    @Body() body: LooseObject,
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    if (!body.role) {
      throw new BadRequestException('Role da comissão é obrigatório');
    }

    return this.prisma.productCommission.create({
      data: {
        productId,
        role: body.role,
        percentage: parseNumber(body.percentage) ?? 0,
        agentName: body.agentName ?? null,
        agentEmail: body.agentEmail ?? null,
      } as any,
    });
  }

  @Put(':commissionId')
  async update(
    @Param('productId') productId: string,
    @Param('commissionId') commissionId: string,
    @Body() body: LooseObject,
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const commission = await this.prisma.productCommission.findFirst({
      where: { id: commissionId, productId },
    });
    if (!commission) throw new NotFoundException('Comissão não encontrada');

    return this.prisma.productCommission.update({
      where: { id: commissionId },
      data: removeUndefined({
        role: body.role,
        percentage: parseNumber(body.percentage),
        agentName: body.agentName,
        agentEmail: body.agentEmail,
      }) as any,
    });
  }

  @Delete(':commissionId')
  async delete(
    @Param('productId') productId: string,
    @Param('commissionId') commissionId: string,
    @Request() req: any,
  ) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const commission = await this.prisma.productCommission.findFirst({
      where: { id: commissionId, productId },
    });
    if (!commission) throw new NotFoundException('Comissão não encontrada');

    await this.auditService.log({ workspaceId: getWorkspaceId(req), action: 'DELETE_RECORD', resource: 'ProductCommission', resourceId: commissionId, details: { deletedBy: 'user', productId } });
    return this.prisma.productCommission.delete({
      where: { id: commissionId },
    });
  }
}

@Controller('products/:productId/affiliates')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ProductAffiliateController {
  constructor(private readonly prisma: PrismaService, private readonly auditService: AuditService) {}

  @Get()
  async getSummary(@Param('productId') productId: string, @Request() req: any) {
    await ensureWorkspaceProductAccess(
      this.prisma,
      productId,
      getWorkspaceId(req),
    );

    const affiliateProduct = await this.prisma.affiliateProduct.findUnique({
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
          approvedRequests: 0,
          activeLinks: 0,
          clicks: 0,
          sales: 0,
          revenue: 0,
          commission: 0,
        },
      };
    }

    const approvedRequests = affiliateProduct.requests.filter(
      (request) => request.status === 'APPROVED',
    ).length;
    const activeLinks = affiliateProduct.links.filter((link) => link.active).length;
    const clicks = affiliateProduct.links.reduce(
      (sum, link) => sum + link.clicks,
      0,
    );
    const sales = affiliateProduct.links.reduce((sum, link) => sum + link.sales, 0);
    const revenue = affiliateProduct.links.reduce(
      (sum, link) => sum + link.revenue,
      0,
    );
    const commission = affiliateProduct.links.reduce(
      (sum, link) => sum + link.commissionEarned,
      0,
    );

    return {
      affiliateProduct: serializeAffiliateProductForResponse(req, affiliateProduct),
      requests: affiliateProduct.requests,
      links: affiliateProduct.links,
      stats: {
        requests: affiliateProduct.requests.length,
        approvedRequests,
        activeLinks,
        clicks,
        sales,
        revenue,
        commission,
      },
    };
  }
}
