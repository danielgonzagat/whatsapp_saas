import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutPaymentService } from './checkout-payment.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CheckoutPaymentService))
    private readonly paymentService: CheckoutPaymentService,
  ) {}

  // ─── Products ──────────────────────────────────────────────────────────────

  async createProduct(workspaceId: string, data: {
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
  }) {
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
      where: { workspaceId },
      include: { checkoutPlans: { select: { id: true, name: true, slug: true, priceInCents: true, isActive: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProduct(id: string, workspaceId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, workspaceId },
      include: { checkoutPlans: { include: { checkoutConfig: true, orderBumps: true, upsells: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async deleteProduct(id: string, workspaceId: string) {
    await this.prisma.product.deleteMany({ where: { id, workspaceId } });
    return { deleted: true };
  }

  // ─── Plans ─────────────────────────────────────────────────────────────────

  async createPlan(productId: string, data: {
    name: string;
    slug: string;
    priceInCents: number;
    compareAtPrice?: number;
    currency?: string;
    maxInstallments?: number;
    installmentsFee?: boolean;
    quantity?: number;
    freeShipping?: boolean;
    shippingPrice?: number;
    brandName?: string;
  }) {
    const { brandName, ...planData } = data;
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.checkoutProductPlan.create({
        data: { productId, ...planData },
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
    });
  }

  async updatePlan(id: string, data: Prisma.CheckoutProductPlanUpdateInput) {
    return this.prisma.checkoutProductPlan.update({
      where: { id },
      data,
      include: { checkoutConfig: true },
    });
  }

  async deletePlan(id: string) {
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
        orderBumps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!plan || !plan.isActive) throw new NotFoundException('Checkout not found');
    return plan;
  }

  async getCheckoutByCode(code: string) {
    const plan = await this.prisma.checkoutProductPlan.findUnique({
      where: { referenceCode: code },
      include: {
        product: true,
        checkoutConfig: { include: { pixels: true } },
        orderBumps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!plan || !plan.isActive) throw new NotFoundException('Checkout not found');
    return plan;
  }

  // ─── Order Bumps ──────────────────────────────────────────────────────────

  async createBump(planId: string, data: {
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
  }) {
    return this.prisma.orderBump.create({ data: { planId, ...data } });
  }

  async updateBump(id: string, data: Prisma.OrderBumpUpdateInput) {
    return this.prisma.orderBump.update({ where: { id }, data });
  }

  async deleteBump(id: string) {
    await this.prisma.orderBump.delete({ where: { id } });
    return { deleted: true };
  }

  async listBumps(planId: string) {
    return this.prisma.orderBump.findMany({
      where: { planId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // ─── Upsells ──────────────────────────────────────────────────────────────

  async createUpsell(planId: string, data: {
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
  }) {
    const validChargeTypes = ['ONE_CLICK', 'NEW_PAYMENT'];
    if (data.chargeType && !validChargeTypes.includes(data.chargeType)) {
      throw new BadRequestException(`Invalid chargeType: ${data.chargeType}. Must be one of: ${validChargeTypes.join(', ')}`);
    }

    return this.prisma.upsell.create({ data: { planId, ...data } });
  }

  async updateUpsell(id: string, data: Prisma.UpsellUpdateInput) {
    return this.prisma.upsell.update({ where: { id }, data });
  }

  async deleteUpsell(id: string) {
    await this.prisma.upsell.delete({ where: { id } });
    return { deleted: true };
  }

  async listUpsells(planId: string) {
    return this.prisma.upsell.findMany({
      where: { planId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // ─── Coupons ──────────────────────────────────────────────────────────────

  async createCoupon(workspaceId: string, data: {
    code: string;
    discountType: any;
    discountValue: number;
    minOrderValue?: number;
    maxUses?: number;
    maxUsesPerUser?: number;
    startsAt?: Date;
    expiresAt?: Date;
    appliesTo?: any;
  }) {
    const validDiscountTypes = ['PERCENTAGE', 'FIXED'];
    if (data.discountType && !validDiscountTypes.includes(data.discountType)) {
      throw new BadRequestException(`Invalid discountType: ${data.discountType}. Must be one of: ${validDiscountTypes.join(', ')}`);
    }

    return this.prisma.checkoutCoupon.create({
      data: { workspaceId, ...data },
    });
  }

  async updateCoupon(id: string, data: Prisma.CheckoutCouponUpdateInput) {
    return this.prisma.checkoutCoupon.update({ where: { id }, data });
  }

  async deleteCoupon(id: string) {
    await this.prisma.checkoutCoupon.delete({ where: { id } });
    return { deleted: true };
  }

  async listCoupons(workspaceId: string) {
    return this.prisma.checkoutCoupon.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
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
      discountAmount = Math.round(orderValue * coupon.discountValue / 100);
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

  async createPixel(checkoutConfigId: string, data: {
    type: any;
    pixelId: string;
    accessToken?: string;
    trackPageView?: boolean;
    trackInitiateCheckout?: boolean;
    trackAddPaymentInfo?: boolean;
    trackPurchase?: boolean;
  }) {
    const validPixelTypes = ['FACEBOOK', 'GOOGLE_ADS', 'GOOGLE_ANALYTICS', 'TIKTOK', 'KWAI', 'TABOOLA', 'CUSTOM'];
    if (data.type && !validPixelTypes.includes(data.type)) {
      throw new BadRequestException(`Invalid pixel type: ${data.type}. Must be one of: ${validPixelTypes.join(', ')}`);
    }

    return this.prisma.checkoutPixel.create({
      data: { checkoutConfigId, ...data },
    });
  }

  async updatePixel(id: string, data: Prisma.CheckoutPixelUpdateInput) {
    return this.prisma.checkoutPixel.update({ where: { id }, data });
  }

  async deletePixel(id: string) {
    await this.prisma.checkoutPixel.delete({ where: { id } });
    return { deleted: true };
  }

  // ─── Shipping ──────────────────────────────────────────────────────────────

  async calculateShipping(slug: string, cep: string) {
    const plan = await this.prisma.checkoutProductPlan.findUnique({ where: { slug } });
    if (!plan) throw new NotFoundException('Plano nao encontrado');

    if (plan.freeShipping) {
      return { options: [{ name: 'Frete gratis', price: 0, days: '5-10 dias uteis' }] };
    }

    if (plan.shippingPrice) {
      return { options: [{ name: 'Frete padrao', price: plan.shippingPrice, days: '5-10 dias uteis' }] };
    }

    // Future: integrate with Correios/Melhor Envio API
    return { options: [{ name: 'Frete padrao', price: 1990, days: '5-10 dias uteis' }] };
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
        accentColor: null, accentColor2: null, backgroundColor: null,
        cardColor: null, textColor: null, mutedTextColor: null,
        fontBody: null, fontDisplay: null,
        brandName: plan.product.name,
        brandLogo: null, headerMessage: null, headerSubMessage: null,
        productImage: null, productDisplayName: null,
        btnStep1Text: 'Ir para Entrega',
        btnStep2Text: 'Ir para Pagamento',
        btnFinalizeText: 'Finalizar compra',
        enableTimer: false, enableExitIntent: false, enableFloatingBar: false,
        customCSS: null,
      },
    });
  }

  // ─── Orders ───────────────────────────────────────────────────────────────

  async createOrder(data: {
    planId: string;
    workspaceId: string;
    customerName: string;
    customerEmail: string;
    customerCPF?: string;
    customerPhone?: string;
    shippingAddress: any;
    shippingMethod?: string;
    shippingPrice?: number;
    subtotalInCents: number;
    discountInCents?: number;
    bumpTotalInCents?: number;
    totalInCents: number;
    couponCode?: string;
    couponDiscount?: number;
    acceptedBumps?: any;
    paymentMethod: any;
    installments?: number;
    affiliateId?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const orderNumber = `KL-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const order = await this.prisma.checkoutOrder.create({
      data: {
        ...data,
        orderNumber,
      },
      include: {
        plan: { include: { product: true, upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } } },
        payment: true,
      },
    });

    // Increment coupon usage if a coupon was used
    if (data.couponCode && data.workspaceId) {
      await this.prisma.checkoutCoupon.updateMany({
        where: {
          workspaceId: data.workspaceId,
          code: data.couponCode,
        },
        data: { usedCount: { increment: 1 } },
      });
    }

    this.logger.log(`Order ${orderNumber} created for plan ${data.planId}`);

    // Process payment via Asaas
    let paymentData: any = null;
    try {
      paymentData = await this.paymentService.processPayment({
        orderId: order.id,
        workspaceId: data.workspaceId,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerCPF: data.customerCPF,
        customerPhone: data.customerPhone,
        paymentMethod: data.paymentMethod,
        totalInCents: data.totalInCents,
        installments: data.installments,
        cardNumber: (data as any).cardNumber,
        cardExpiryMonth: (data as any).cardExpiryMonth,
        cardExpiryYear: (data as any).cardExpiryYear,
        cardCcv: (data as any).cardCcv,
        cardHolderName: (data as any).cardHolderName,
      });
    } catch (e) {
      this.logger.warn(`Payment processing failed for order ${orderNumber}: ${(e as Error).message}`);
      // Order was created but payment failed — return order with payment error info
    }

    return { ...order, paymentData };
  }

  async getOrder(orderId: string) {
    const order = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      include: {
        plan: { include: { product: true, upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } } },
        payment: true,
        upsellOrders: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async listOrders(workspaceId: string, filters?: { status?: string; page?: number; limit?: number }) {
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

    return { orders, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateOrderStatus(orderId: string, status: any, extra?: Record<string, any>) {
    const validOrderStatuses = ['PENDING', 'PROCESSING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELED', 'REFUNDED', 'CHARGEBACK'];
    if (!validOrderStatuses.includes(status)) {
      throw new BadRequestException(`Invalid order status: ${status}. Must be one of: ${validOrderStatuses.join(', ')}`);
    }

    const data: any = { status };
    const now = new Date();

    if (status === 'PAID') data.paidAt = now;
    if (status === 'SHIPPED') data.shippedAt = now;
    if (status === 'DELIVERED') data.deliveredAt = now;
    if (status === 'CANCELED') data.canceledAt = now;
    if (status === 'REFUNDED') data.refundedAt = now;

    if (extra) Object.assign(data, extra);

    return this.prisma.checkoutOrder.update({
      where: { id: orderId },
      data,
    });
  }

  async getOrderStatus(orderId: string) {
    const order = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        payment: { select: { status: true, pixQrCode: true, pixCopyPaste: true, pixExpiresAt: true, boletoUrl: true, boletoBarcode: true, boletoExpiresAt: true } },
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

    return {
      accepted: true,
      upsellOrder,
      chargeType: upsell.chargeType,
    };
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
