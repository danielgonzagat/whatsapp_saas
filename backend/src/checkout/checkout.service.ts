import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutPaymentService } from './checkout-payment.service';
import { AuditService } from '../audit/audit.service';
import { Prisma } from '@prisma/client';
import { generateUniquePublicCheckoutCode } from './checkout-code.util';
import { MercadoPagoService } from '../kloel/mercado-pago.service';
import { normalizeMercadoPagoPayerAddress } from '../kloel/mercado-pago-order.util';
import {
  applyMercadoPagoPublicCheckoutRestrictions,
  getMercadoPagoAffiliateBlockReason,
} from './mercado-pago-checkout-policy.util';
// @@index: optimistic lock via updatedAt — concurrent writes resolved by DB constraint

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CheckoutPaymentService))
    private readonly paymentService: CheckoutPaymentService,
    private readonly auditService: AuditService,
    private readonly mercadoPago: MercadoPagoService,
  ) {}

  private async isPublicCodeTaken(code: string) {
    const [plan, affiliateLink] = await Promise.all([
      this.prisma.checkoutProductPlan.findFirst({
        where: { referenceCode: code },
        select: { id: true },
      }),
      this.prisma.affiliateLink.findFirst({
        where: { code },
        select: { id: true },
      }),
    ]);

    return Boolean(plan || affiliateLink);
  }

  private async generatePublicCheckoutCode() {
    return generateUniquePublicCheckoutCode((code) => this.isPublicCodeTaken(code));
  }

  private async buildPublicCheckoutPayload(plan: any, affiliateLink?: any | null) {
    const paymentProvider = applyMercadoPagoPublicCheckoutRestrictions(
      await this.mercadoPago.getPublicCheckoutConfig(plan.product.workspaceId),
      { hasAffiliateContext: Boolean(affiliateLink) },
    );

    return {
      ...plan,
      referenceCode: plan.referenceCode,
      checkoutCode: affiliateLink?.code || plan.referenceCode,
      paymentProvider,
      affiliateContext: affiliateLink
        ? {
            affiliateLinkId: affiliateLink.id,
            affiliateWorkspaceId: affiliateLink.affiliateWorkspaceId,
            affiliateProductId: affiliateLink.affiliateProductId,
            affiliateCode: affiliateLink.code,
            commissionPct: Number(affiliateLink.affiliateProduct?.commissionPct || 0),
          }
        : null,
    };
  }

  // ─── Products ──────────────────────────────────────────────────────────────

  async createProduct(
    workspaceId: string,
    data: {
      name: string;
      slug?: string;
      description?: string;
      images?: any;
      weight?: number;
      dimensions?: any;
      sku?: string;
      stock?: number;
      category?: string;
      status?: any;
      price?: number;
    },
  ) {
    return this.prisma.product.create({
      data: { workspaceId, price: data.price || 0, ...data },
    });
  }

  async updateProduct(id: string, workspaceId: string, data: Prisma.ProductUpdateInput) {
    return this.prisma.product.update({
      where: { id },
      data,
    });
  }

  async listProducts(workspaceId: string) {
    return this.prisma.product.findMany({
      take: 200,
      where: { workspaceId },
      include: {
        checkoutPlans: {
          select: {
            id: true,
            name: true,
            slug: true,
            priceInCents: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProduct(id: string, workspaceId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, workspaceId },
      include: {
        checkoutPlans: {
          include: { checkoutConfig: true, orderBumps: true, upsells: true },
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async deleteProduct(id: string, workspaceId: string) {
    await this.auditService.log({
      workspaceId,
      action: 'DELETE_RECORD',
      resource: 'CheckoutProduct',
      resourceId: id,
      details: { deletedBy: 'user' },
    });
    await this.prisma.product.deleteMany({ where: { id, workspaceId } });
    return { deleted: true };
  }

  // ─── Plans ─────────────────────────────────────────────────────────────────

  async createPlan(
    productId: string,
    data: {
      name: string;
      slug?: string;
      priceInCents: number;
      compareAtPrice?: number;
      currency?: string;
      maxInstallments?: number;
      installmentsFee?: boolean;
      quantity?: number;
      freeShipping?: boolean;
      shippingPrice?: number;
      brandName?: string;
    },
  ) {
    const { brandName, ...planData } = data;
    const referenceCode = await this.generatePublicCheckoutCode();
    return this.prisma.$transaction(
      // isolationLevel: ReadCommitted
      async (tx) => {
        const plan = await tx.checkoutProductPlan.create({
          data: {
            productId,
            referenceCode,
            ...planData,
          } as Prisma.CheckoutProductPlanUncheckedCreateInput,
        });

        // Auto-create default CheckoutConfig
        await tx.checkoutConfig.create({
          data: {
            planId: plan.id,
            brandName: brandName || data.name,
          },
        });

        return tx.checkoutProductPlan.findUnique({
          where: { id: plan.id },
          include: { checkoutConfig: true },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async updatePlan(id: string, data: Prisma.CheckoutProductPlanUpdateInput) {
    return this.prisma.checkoutProductPlan.update({
      where: { id },
      data,
      include: { checkoutConfig: true },
    });
  }

  async deletePlan(id: string, workspaceId?: string) {
    await this.auditService.log({
      workspaceId: workspaceId || 'unknown',
      action: 'DELETE_RECORD',
      resource: 'CheckoutProductPlan',
      resourceId: id,
      details: { deletedBy: 'user' },
    });
    await this.prisma.checkoutProductPlan.delete({ where: { id } });
    return { deleted: true };
  }

  // ─── Checkout Config ──────────────────────────────────────────────────────

  async updateConfig(planId: string, data: Prisma.CheckoutConfigUpdateInput) {
    return this.prisma.checkoutConfig.update({
      where: { planId },
      data,
      include: { pixels: true },
    });
  }

  async getConfig(planId: string) {
    const config = await this.prisma.checkoutConfig.findUnique({
      where: { planId },
      include: { pixels: true },
    });
    if (!config) throw new NotFoundException('Checkout config not found');
    return config;
  }

  // ─── Public Checkout (slug / referenceCode) ───────────────────────────────

  async getCheckoutBySlug(slug: string) {
    const plan = await this.prisma.checkoutProductPlan.findUnique({
      where: { slug },
      include: {
        product: true,
        checkoutConfig: { include: { pixels: true } },
        orderBumps: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!plan || !plan.isActive) throw new NotFoundException('Checkout not found');
    return this.buildPublicCheckoutPayload(plan);
  }

  async getCheckoutByCode(code: string) {
    const normalizedCode = String(code || '')
      .trim()
      .toUpperCase();
    const legacyCode = String(code || '')
      .trim()
      .toLowerCase();

    const plan = await this.prisma.checkoutProductPlan.findFirst({
      where: {
        OR: [
          { referenceCode: normalizedCode },
          { referenceCode: code },
          { id: { startsWith: legacyCode } },
        ],
      },
      include: {
        product: true,
        checkoutConfig: { include: { pixels: true } },
        orderBumps: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });

    if (plan?.isActive) {
      return this.buildPublicCheckoutPayload(plan);
    }

    const affiliateLink = await this.prisma.affiliateLink.findFirst({
      where: {
        active: true,
        OR: [{ code: normalizedCode }, { code }],
      },
      include: {
        affiliateProduct: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!affiliateLink?.affiliateProduct?.productId) {
      throw new NotFoundException('Checkout not found');
    }

    const affiliatePlan = await this.prisma.checkoutProductPlan.findFirst({
      where: {
        productId: affiliateLink.affiliateProduct.productId,
        isActive: true,
      },
      include: {
        product: true,
        checkoutConfig: { include: { pixels: true } },
        orderBumps: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!affiliatePlan) {
      throw new NotFoundException('Checkout not found');
    }

    await this.prisma.affiliateLink.update({
      where: { id: affiliateLink.id },
      data: { clicks: { increment: 1 } },
    });

    return this.buildPublicCheckoutPayload(affiliatePlan, affiliateLink);
  }

  // ─── Order Bumps ──────────────────────────────────────────────────────────

  async createBump(
    planId: string,
    data: {
      title: string;
      description: string;
      productName: string;
      image?: string;
      priceInCents: number;
      compareAtPrice?: number;
      highlightColor?: string;
      checkboxLabel?: string;
      position?: string;
      sortOrder?: number;
    },
  ) {
    return this.prisma.orderBump.create({ data: { planId, ...data } });
  }

  async updateBump(id: string, data: Prisma.OrderBumpUpdateInput) {
    return this.prisma.orderBump.update({ where: { id }, data });
  }

  async deleteBump(id: string, workspaceId?: string) {
    await this.auditService.log({
      workspaceId: workspaceId || 'unknown',
      action: 'DELETE_RECORD',
      resource: 'OrderBump',
      resourceId: id,
      details: { deletedBy: 'user' },
    });
    await this.prisma.orderBump.delete({ where: { id } });
    return { deleted: true };
  }

  async listBumps(planId: string) {
    return this.prisma.orderBump.findMany({
      where: { planId },
      select: {
        id: true,
        planId: true,
        title: true,
        description: true,
        priceInCents: true,
        sortOrder: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { sortOrder: 'asc' },
      take: 20,
    });
  }

  // ─── Upsells ──────────────────────────────────────────────────────────────

  async createUpsell(
    planId: string,
    data: {
      title: string;
      headline: string;
      description: string;
      productName: string;
      image?: string;
      priceInCents: number;
      compareAtPrice?: number;
      acceptBtnText?: string;
      declineBtnText?: string;
      timerSeconds?: number;
      chargeType?: any;
      sortOrder?: number;
    },
  ) {
    const validChargeTypes = ['ONE_CLICK', 'NEW_PAYMENT'];
    if (data.chargeType && !validChargeTypes.includes(data.chargeType)) {
      throw new BadRequestException(
        `Invalid chargeType: ${data.chargeType}. Must be one of: ${validChargeTypes.join(', ')}`,
      );
    }

    return this.prisma.upsell.create({ data: { planId, ...data } });
  }

  async updateUpsell(id: string, data: Prisma.UpsellUpdateInput) {
    return this.prisma.upsell.update({ where: { id }, data });
  }

  async deleteUpsell(id: string, workspaceId?: string) {
    await this.auditService.log({
      workspaceId: workspaceId || 'unknown',
      action: 'DELETE_RECORD',
      resource: 'Upsell',
      resourceId: id,
      details: { deletedBy: 'user' },
    });
    await this.prisma.upsell.delete({ where: { id } });
    return { deleted: true };
  }

  async listUpsells(planId: string) {
    return this.prisma.upsell.findMany({
      where: { planId },
      select: {
        id: true,
        planId: true,
        title: true,
        headline: true,
        description: true,
        productName: true,
        priceInCents: true,
        sortOrder: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { sortOrder: 'asc' },
      take: 20,
    });
  }

  // ─── Coupons ──────────────────────────────────────────────────────────────

  async createCoupon(
    workspaceId: string,
    data: {
      code: string;
      discountType: any;
      discountValue: number;
      minOrderValue?: number;
      maxUses?: number;
      maxUsesPerUser?: number;
      startsAt?: Date;
      expiresAt?: Date;
      appliesTo?: any;
    },
  ) {
    const validDiscountTypes = ['PERCENTAGE', 'FIXED'];
    if (data.discountType && !validDiscountTypes.includes(data.discountType)) {
      throw new BadRequestException(
        `Invalid discountType: ${data.discountType}. Must be one of: ${validDiscountTypes.join(', ')}`,
      );
    }

    return this.prisma.checkoutCoupon.create({
      data: { workspaceId, ...data },
    });
  }

  async updateCoupon(id: string, data: Prisma.CheckoutCouponUpdateInput) {
    return this.prisma.checkoutCoupon.update({ where: { id }, data });
  }

  async deleteCoupon(id: string, workspaceId?: string) {
    await this.auditService.log({
      workspaceId: workspaceId || 'unknown',
      action: 'DELETE_RECORD',
      resource: 'CheckoutCoupon',
      resourceId: id,
      details: { deletedBy: 'user' },
    });
    await this.prisma.checkoutCoupon.delete({ where: { id } });
    return { deleted: true };
  }

  async listCoupons(workspaceId: string) {
    return this.prisma.checkoutCoupon.findMany({
      where: { workspaceId },
      select: {
        id: true,
        workspaceId: true,
        code: true,
        discountType: true,
        discountValue: true,
        isActive: true,
        usedCount: true,
        maxUses: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async validateCoupon(workspaceId: string, code: string, planId: string, orderValue: number) {
    const coupon = await this.prisma.checkoutCoupon.findUnique({
      where: { workspaceId_code: { workspaceId, code: code.toUpperCase() } },
    });

    if (!coupon || !coupon.isActive) {
      return { valid: false, message: 'Cupom invalido ou expirado' };
    }

    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) {
      return { valid: false, message: 'Cupom invalido ou expirado' };
    }
    if (coupon.expiresAt && coupon.expiresAt < now) {
      return { valid: false, message: 'Cupom invalido ou expirado' };
    }
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return { valid: false, message: 'Cupom invalido ou expirado' };
    }
    if (coupon.minOrderValue && orderValue < coupon.minOrderValue) {
      return { valid: false, message: 'Cupom invalido ou expirado' };
    }

    // Check appliesTo filter
    const appliesTo = coupon.appliesTo as string[];
    if (appliesTo && appliesTo.length > 0 && !appliesTo.includes(planId)) {
      return { valid: false, message: 'Cupom invalido ou expirado' };
    }

    let discountAmount: number;
    if (coupon.discountType === 'PERCENTAGE') {
      discountAmount = Math.round((orderValue * coupon.discountValue) / 100);
    } else {
      discountAmount = coupon.discountValue;
    }

    return {
      valid: true,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount: Math.min(discountAmount, orderValue),
    };
  }

  // ─── Pixels ───────────────────────────────────────────────────────────────

  async createPixel(
    checkoutConfigId: string,
    data: {
      type: any;
      pixelId: string;
      accessToken?: string;
      trackPageView?: boolean;
      trackInitiateCheckout?: boolean;
      trackAddPaymentInfo?: boolean;
      trackPurchase?: boolean;
    },
  ) {
    const validPixelTypes = [
      'FACEBOOK',
      'GOOGLE_ADS',
      'GOOGLE_ANALYTICS',
      'TIKTOK',
      'KWAI',
      'TABOOLA',
      'CUSTOM',
    ];
    if (data.type && !validPixelTypes.includes(data.type)) {
      throw new BadRequestException(
        `Invalid pixel type: ${data.type}. Must be one of: ${validPixelTypes.join(', ')}`,
      );
    }

    return this.prisma.checkoutPixel.create({
      data: { checkoutConfigId, ...data },
    });
  }

  async updatePixel(id: string, data: Prisma.CheckoutPixelUpdateInput) {
    return this.prisma.checkoutPixel.update({ where: { id }, data });
  }

  async deletePixel(id: string, workspaceId?: string) {
    await this.auditService.log({
      workspaceId: workspaceId || 'unknown',
      action: 'DELETE_RECORD',
      resource: 'CheckoutPixel',
      resourceId: id,
      details: { deletedBy: 'user' },
    });
    await this.prisma.checkoutPixel.delete({ where: { id } });
    return { deleted: true };
  }

  // ─── Shipping ──────────────────────────────────────────────────────────────

  async calculateShipping(slug: string, cep: string) {
    const plan = await this.prisma.checkoutProductPlan.findUnique({
      where: { slug },
    });
    if (!plan) throw new NotFoundException('Plano nao encontrado');

    if (plan.freeShipping) {
      return {
        options: [{ name: 'Frete gratis', price: 0, days: '5-10 dias uteis' }],
      };
    }

    if (plan.shippingPrice) {
      return {
        options: [
          {
            name: 'Frete padrao',
            price: plan.shippingPrice,
            days: '5-10 dias uteis',
          },
        ],
      };
    }

    // Future: integrate with Correios/Melhor Envio API
    return {
      options: [{ name: 'Frete padrao', price: 1990, days: '5-10 dias uteis' }],
    };
  }

  // ─── Config Reset ─────────────────────────────────────────────────────────

  async resetConfig(planId: string) {
    const plan = await this.prisma.checkoutProductPlan.findUnique({
      where: { id: planId },
      include: { product: true },
    });
    if (!plan) throw new NotFoundException('Plano nao encontrado');

    return this.prisma.checkoutConfig.update({
      where: { planId },
      data: {
        theme: 'BLANC',
        accentColor: null,
        accentColor2: null,
        backgroundColor: null,
        cardColor: null,
        textColor: null,
        mutedTextColor: null,
        fontBody: null,
        fontDisplay: null,
        brandName: plan.product.name,
        brandLogo: null,
        headerMessage: null,
        headerSubMessage: null,
        productImage: null,
        productDisplayName: null,
        btnStep1Text: 'Ir para Entrega',
        btnStep2Text: 'Ir para Pagamento',
        btnFinalizeText: 'Finalizar compra',
        enableTimer: false,
        enableExitIntent: false,
        enableFloatingBar: false,
        customCSS: null,
      },
    });
  }

  // ─── Orders ───────────────────────────────────────────────────────────────

  async createOrder(data: {
    planId: string;
    workspaceId: string;
    checkoutCode?: string;
    customerName: string;
    customerEmail: string;
    customerCPF?: string;
    customerPhone?: string;
    shippingAddress: Prisma.InputJsonValue;
    shippingMethod?: string;
    shippingPrice?: number;
    subtotalInCents: number;
    discountInCents?: number;
    bumpTotalInCents?: number;
    totalInCents: number;
    couponCode?: string;
    couponDiscount?: number;
    acceptedBumps?: Prisma.InputJsonValue;
    paymentMethod: Prisma.EnumPaymentMethodFilter['equals'];
    installments?: number;
    affiliateId?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
    ipAddress?: string;
    userAgent?: string;
    cardHolderName?: string;
    mercadoPagoToken?: string;
    mercadoPagoPaymentMethodId?: string;
    mercadoPagoPaymentType?: string;
    mercadoPagoCardLast4?: string;
  }) {
    const {
      checkoutCode,
      affiliateId,
      cardHolderName,
      mercadoPagoToken,
      mercadoPagoPaymentMethodId,
      mercadoPagoPaymentType,
      mercadoPagoCardLast4,
      ...orderData
    } = data;

    const planRecord = await this.prisma.checkoutProductPlan.findUnique({
      where: { id: orderData.planId },
      include: {
        product: {
          select: {
            id: true,
            workspaceId: true,
            commissionPercent: true,
          },
        },
      },
    });

    if (!planRecord) {
      throw new NotFoundException('Plano não encontrado para criar o pedido.');
    }

    let affiliateLink: {
      id: string;
      code: string;
      affiliateWorkspaceId: string;
      affiliateProductId: string;
      affiliateProduct: { commissionPct: number; productId: string };
    } | null = null;

    if (checkoutCode) {
      const normalizedCode = String(checkoutCode).trim().toUpperCase();
      affiliateLink = await this.prisma.affiliateLink.findFirst({
        where: {
          active: true,
          OR: [{ code: normalizedCode }, { code: checkoutCode }],
        },
        include: {
          affiliateProduct: {
            select: {
              commissionPct: true,
              productId: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (affiliateLink && affiliateLink.affiliateProduct.productId !== planRecord.productId) {
        throw new BadRequestException('O link de afiliado não corresponde ao plano selecionado.');
      }
    }

    const normalizedSubtotalInCents = Math.max(
      0,
      Math.round(Number(orderData.subtotalInCents || 0)),
    );
    const normalizedShippingInCents = Math.max(0, Math.round(Number(orderData.shippingPrice || 0)));
    const normalizedDiscountInCents = Math.max(
      0,
      Math.round(Number(orderData.discountInCents || 0)),
    );
    const normalizedBumpTotalInCents = Math.max(
      0,
      Math.round(Number(orderData.bumpTotalInCents || 0)),
    );
    const normalizedBaseTotalInCents = Math.max(
      0,
      normalizedSubtotalInCents +
        normalizedShippingInCents +
        normalizedBumpTotalInCents -
        normalizedDiscountInCents,
    );
    const normalizedInstallments =
      orderData.paymentMethod === 'CREDIT_CARD'
        ? Math.max(1, Math.round(Number(orderData.installments || 1)))
        : 1;
    const normalizedPayerAddress = normalizeMercadoPagoPayerAddress(orderData.shippingAddress);
    const customerDocumentDigits = String(orderData.customerCPF || '').replace(/\D/g, '');
    if (orderData.paymentMethod === 'BOLETO') {
      if (![11, 14].includes(customerDocumentDigits.length)) {
        throw new BadRequestException('CPF ou CNPJ válido é obrigatório para gerar boleto.');
      }

      if (
        !normalizedPayerAddress?.street_name ||
        !normalizedPayerAddress?.street_number ||
        !normalizedPayerAddress?.zip_code ||
        !normalizedPayerAddress?.neighborhood ||
        !normalizedPayerAddress?.city ||
        !normalizedPayerAddress?.state
      ) {
        throw new BadRequestException(
          'Endereço completo é obrigatório para gerar boleto no Mercado Pago.',
        );
      }
    }
    const platformSplit = this.mercadoPago.buildChargeSummary({
      baseTotalInCents: normalizedBaseTotalInCents,
      paymentMethod: orderData.paymentMethod as 'CREDIT_CARD' | 'PIX' | 'BOLETO',
      installments: normalizedInstallments,
    });
    const affiliateCommissionPct = Number(affiliateLink?.affiliateProduct?.commissionPct || 0);
    const affiliateCommissionInCents = affiliateLink
      ? Math.round(normalizedBaseTotalInCents * (affiliateCommissionPct / 100))
      : 0;
    const producerNetInCents = Math.max(
      0,
      platformSplit.sellerReceivableInCents - affiliateCommissionInCents,
    );
    const affiliateBlockReason = getMercadoPagoAffiliateBlockReason({
      hasAffiliateContext: Boolean(affiliateLink || affiliateId),
    });

    if (affiliateBlockReason) {
      throw new BadRequestException(affiliateBlockReason);
    }

    await this.mercadoPago.assertPaymentMethodAvailable(
      orderData.workspaceId,
      orderData.paymentMethod as 'CREDIT_CARD' | 'PIX' | 'BOLETO',
    );

    const orderNumber = `KL-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const order = await this.prisma.checkoutOrder.create({
      data: {
        ...orderData,
        shippingPrice: normalizedShippingInCents,
        subtotalInCents: normalizedSubtotalInCents,
        discountInCents: normalizedDiscountInCents,
        bumpTotalInCents: normalizedBumpTotalInCents,
        totalInCents: normalizedBaseTotalInCents,
        installments: normalizedInstallments,
        affiliateId: affiliateLink?.affiliateWorkspaceId || affiliateId,
        metadata: {
          checkoutCode: checkoutCode || null,
          affiliateLinkId: affiliateLink?.id || null,
          affiliateCode: affiliateLink?.code || null,
          affiliateWorkspaceId: affiliateLink?.affiliateWorkspaceId || null,
          affiliateCommissionPct: affiliateCommissionPct || null,
          affiliateCommissionInCents,
          baseTotalInCents: platformSplit.baseTotalInCents,
          chargedTotalInCents: platformSplit.chargedTotalInCents,
          installmentInterestMonthlyPercent: platformSplit.installmentInterestMonthlyPercent,
          installmentInterestInCents: platformSplit.installmentInterestInCents,
          estimatedGatewayFeePercent: platformSplit.gatewayFeePercent,
          estimatedGatewayFeeInCents: platformSplit.estimatedGatewayFeeInCents,
          platformFeePercent: platformSplit.platformFeePercent,
          platformFeeInCents: platformSplit.platformFeeInCents,
          platformGrossRevenueInCents: platformSplit.platformGrossRevenueInCents,
          platformNetRevenueInCents: platformSplit.platformNetRevenueInCents,
          marketplaceFeeInCents: platformSplit.marketplaceFeeInCents,
          sellerReceivableInCents: platformSplit.sellerReceivableInCents,
          producerNetInCents,
          payoutStrategy: affiliateLink
            ? 'marketplace_fee_plus_affiliate_reconciliation'
            : 'marketplace_fee',
        },
        orderNumber,
      },
      include: {
        plan: {
          include: {
            product: true,
            upsells: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        payment: true,
      },
    });

    this.logger.log(`Order ${orderNumber} created for plan ${data.planId}`);

    // Idempotent: orderId is used as idempotencyKey inside CheckoutPaymentService.
    // On retry, existingRecord with same externalReference prevents double-charge.
    let paymentData: any = null;
    try {
      paymentData = await this.paymentService.processPayment({
        orderId: order.id,
        workspaceId: data.workspaceId,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerCPF: data.customerCPF,
        customerPhone: data.customerPhone,
        paymentMethod: orderData.paymentMethod,
        totalInCents: normalizedBaseTotalInCents,
        installments: normalizedInstallments,
        cardToken: mercadoPagoToken,
        cardPaymentMethodId: mercadoPagoPaymentMethodId,
        cardPaymentType: mercadoPagoPaymentType,
        cardHolderName,
        cardLast4: mercadoPagoCardLast4,
      });

      if (data.couponCode && data.workspaceId) {
        await this.prisma.checkoutCoupon.updateMany({
          where: {
            workspaceId: data.workspaceId,
            code: data.couponCode,
          },
          data: { usedCount: { increment: 1 } },
        });
      }
      // PULSE:OK — order is already created in DB; payment failure is returned to caller via paymentData=undefined
    } catch (e) {
      this.logger.warn(
        `Payment processing failed for order ${orderNumber}: ${(e as Error).message}`,
      );
      throw e;
    }

    return { ...order, paymentData };
  }

  async getOrder(orderId: string) {
    const order = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      include: {
        plan: {
          include: {
            product: true,
            upsells: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        payment: true,
        upsellOrders: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async listOrders(
    workspaceId: string,
    filters?: { status?: string; page?: number; limit?: number },
  ) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const where: any = { workspaceId };
    if (filters?.status) where.status = filters.status;

    const [orders, total] = await this.prisma.$transaction([
      this.prisma.checkoutOrder.findMany({
        where,
        include: {
          plan: { select: { name: true, slug: true } },
          payment: { select: { status: true, gateway: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.checkoutOrder.count({ where }),
    ]);

    const safeLimit = Math.max(1, limit);
    return {
      orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async updateOrderStatus(orderId: string, status: any, extra?: Record<string, any>) {
    const validOrderStatuses = [
      'PENDING',
      'PROCESSING',
      'PAID',
      'SHIPPED',
      'DELIVERED',
      'CANCELED',
      'REFUNDED',
      'CHARGEBACK',
    ];
    if (!validOrderStatuses.includes(status)) {
      throw new BadRequestException(
        `Invalid order status: ${status}. Must be one of: ${validOrderStatuses.join(', ')}`,
      );
    }

    const data: any = { status };
    const now = new Date();

    if (status === 'PAID') data.paidAt = now;
    if (status === 'SHIPPED') data.shippedAt = now;
    if (status === 'DELIVERED') data.deliveredAt = now;
    if (status === 'CANCELED') data.canceledAt = now;
    if (status === 'REFUNDED') data.refundedAt = now;

    if (extra) Object.assign(data, extra);

    const existingOrder = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      select: { workspaceId: true, status: true },
    });
    const updated = await this.prisma.checkoutOrder.update({
      where: { id: orderId },
      data,
    });
    if (existingOrder?.workspaceId) {
      await this.auditService.log({
        workspaceId: existingOrder.workspaceId,
        action: 'ORDER_STATUS_CHANGED',
        resource: 'CheckoutOrder',
        resourceId: orderId,
        details: { previousStatus: existingOrder.status, newStatus: status },
      });
    }
    return updated;
  }

  async getOrderStatus(orderId: string) {
    const order = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        payment: {
          select: {
            status: true,
            pixQrCode: true,
            pixCopyPaste: true,
            pixExpiresAt: true,
            boletoUrl: true,
            boletoBarcode: true,
            boletoExpiresAt: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
            upsells: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                title: true,
                headline: true,
                description: true,
                productName: true,
                image: true,
                priceInCents: true,
                compareAtPrice: true,
                acceptBtnText: true,
                declineBtnText: true,
                timerSeconds: true,
              },
            },
          },
        },
        upsellOrders: { select: { id: true, upsellId: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  // ─── Upsell Accept / Decline ────────────────────────────────────────────

  async acceptUpsell(orderId: string, upsellId: string) {
    const order = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const upsell = await this.prisma.upsell.findUnique({
      where: { id: upsellId },
    });
    if (!upsell) throw new NotFoundException('Upsell not found');

    // Create UpsellOrder
    const upsellOrder = await this.prisma.upsellOrder.create({
      data: {
        orderId,
        upsellId,
        productName: upsell.productName,
        priceInCents: upsell.priceInCents,
        status: upsell.chargeType === 'ONE_CLICK' ? 'PAID' : 'PENDING',
      },
    });

    this.logger.log(`Upsell ${upsellId} accepted for order ${orderId} (${upsell.chargeType})`);

    const fullOrder = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      select: { workspaceId: true },
    });
    if (fullOrder?.workspaceId) {
      await this.auditService.log({
        workspaceId: fullOrder.workspaceId,
        action: 'UPSELL_ACCEPTED',
        resource: 'UpsellOrder',
        resourceId: upsellOrder.id,
        details: {
          orderId,
          upsellId,
          priceInCents: upsell.priceInCents,
          chargeType: upsell.chargeType,
        },
      });
    }

    return {
      accepted: true,
      upsellOrder,
      chargeType: upsell.chargeType,
    };
  }

  async getRecentPaidOrders(limit: number) {
    return this.prisma.checkoutOrder.findMany({
      where: { status: 'PAID' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { plan: { include: { product: true } } },
    });
  }

  async declineUpsell(orderId: string, upsellId: string) {
    const order = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    this.logger.log(`Upsell ${upsellId} declined for order ${orderId}`);

    return { declined: true };
  }
}
