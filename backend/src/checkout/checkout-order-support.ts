import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeCheckoutOrderQuantity } from './checkout-order-pricing.util';

const D_RE = /\D/g;

type CheckoutLineItem = {
  id: string;
  title: string;
  description?: string;
  pictureUrl?: string;
  categoryId?: string;
  quantity: number;
  unitPriceInCents: number;
  warranty?: boolean;
};

const DIGITAL_GOODS_KEYWORDS: readonly string[] = [
  'digital',
  'ebook',
  'curso',
  'infoprod',
  'software',
  'app',
  'assinatura',
  'mentoria',
  'consultoria',
];

function fingerprintIncludesDigitalGoodsKeyword(fingerprint: string): boolean {
  for (const keyword of DIGITAL_GOODS_KEYWORDS) {
    if (fingerprint.includes(keyword)) {
      return true;
    }
  }
  return false;
}

function resolveCheckoutItemCategory(input?: {
  productCategory?: string | null;
  productFormat?: string | null;
}) {
  const category = String(input?.productCategory || '')
    .trim()
    .toLowerCase();
  const format = String(input?.productFormat || '')
    .trim()
    .toLowerCase();
  const fingerprint = `${category} ${format}`;

  if (format === 'digital' || fingerprintIncludesDigitalGoodsKeyword(fingerprint)) {
    return 'digital_goods';
  }

  return 'goods';
}

/** Checkout order support. */
export class CheckoutOrderSupport {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  /** Normalize phone digits. */
  normalizePhoneDigits(value?: string | null) {
    return String(value || '').replace(D_RE, '');
  }

  /** Normalize email. */
  normalizeEmail(value?: string | null) {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    return normalized || undefined;
  }

  /** Resolve product image. */
  resolveProductImage(product?: { imageUrl?: string | null; images?: unknown } | null) {
    if (!product) {
      return undefined;
    }
    if (product.imageUrl) {
      return product.imageUrl;
    }
    if (Array.isArray(product.images)) {
      const firstImage = product.images.find((entry) => typeof entry === 'string' && entry.trim());
      if (typeof firstImage === 'string') {
        return firstImage;
      }
    }
    return undefined;
  }

  /** Parse accepted bump ids. */
  parseAcceptedBumpIds(acceptedBumps?: Prisma.InputJsonValue) {
    if (!Array.isArray(acceptedBumps)) {
      return [];
    }
    return acceptedBumps
      .map((value) => String(value || '').trim())
      .filter((value) => Boolean(value));
  }

  /** Build checkout line items. */
  buildCheckoutLineItems(
    planRecord: {
      id: string;
      name: string;
      priceInCents: number;
      quantity: number;
      product: {
        name: string;
        description?: string | null;
        imageUrl?: string | null;
        images?: unknown;
        category?: string | null;
        format?: string | null;
      };
      orderBumps?: Array<{
        id: string;
        title: string;
        description: string;
        productName: string;
        image?: string | null;
        priceInCents: number;
      }>;
    },
    acceptedBumpIds: string[],
    orderQuantity: number,
  ): CheckoutLineItem[] {
    const categoryId = resolveCheckoutItemCategory({
      productCategory: planRecord.product?.category,
      productFormat: planRecord.product?.format,
    });

    const items: CheckoutLineItem[] = [
      {
        id: planRecord.id,
        title: planRecord.name || planRecord.product?.name || 'Produto',
        description: planRecord.product?.description || planRecord.name,
        pictureUrl: this.resolveProductImage(planRecord.product),
        categoryId,
        quantity: normalizeCheckoutOrderQuantity(orderQuantity),
        unitPriceInCents: Math.max(0, Math.round(Number(planRecord.priceInCents || 0))),
        warranty: false,
      },
    ];

    for (const bump of planRecord.orderBumps || []) {
      if (!acceptedBumpIds.includes(bump.id)) {
        continue;
      }
      items.push({
        id: bump.id,
        title: bump.productName || bump.title,
        description: bump.description || bump.title,
        pictureUrl: bump.image || undefined,
        categoryId,
        quantity: 1,
        unitPriceInCents: Math.max(0, Math.round(Number(bump.priceInCents || 0))),
        warranty: false,
      });
    }

    return items;
  }

  /** Resolve customer registration date. */
  async resolveCustomerRegistrationDate(input: {
    workspaceId: string;
    customerEmail: string;
    customerPhone?: string;
  }) {
    const normalizedEmail = this.normalizeEmail(input.customerEmail);
    const normalizedPhone = this.normalizePhoneDigits(input.customerPhone);
    const phoneCandidates = [normalizedPhone, String(input.customerPhone || '').trim()].filter(
      (value, index, array): value is string => Boolean(value) && array.indexOf(value) === index,
    );

    const contactOr: Prisma.ContactWhereInput[] = [];
    if (normalizedEmail) {
      contactOr.push({
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      });
    }
    for (const phone of phoneCandidates) {
      contactOr.push({ phone });
    }

    if (contactOr.length > 0) {
      const contact = await this.prisma.contact.findFirst({
        where: {
          workspaceId: input.workspaceId,
          OR: contactOr,
        },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      });

      if (contact?.createdAt) {
        return contact.createdAt.toISOString();
      }
    }

    const orderOr: Prisma.CheckoutOrderWhereInput[] = [];
    if (normalizedEmail) {
      orderOr.push({
        customerEmail: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      });
    }
    for (const phone of phoneCandidates) {
      orderOr.push({ customerPhone: phone });
    }

    if (orderOr.length > 0) {
      const previousOrder = await this.prisma.checkoutOrder.findFirst({
        where: {
          workspaceId: input.workspaceId,
          OR: orderOr,
        },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      });

      if (previousOrder?.createdAt) {
        return previousOrder.createdAt.toISOString();
      }
    }

    return new Date().toISOString();
  }

  /** Ensure checkout contact record. */
  async ensureCheckoutContactRecord(input: {
    workspaceId: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    shippingAddress?: Record<string, unknown>;
  }) {
    const phone = this.normalizePhoneDigits(input.customerPhone);
    if (!phone) {
      return {
        synced: false,
        skipped: true,
        reason: 'missing_phone',
      } as const;
    }

    const email = this.normalizeEmail(input.customerEmail);
    const city =
      typeof input.shippingAddress?.city === 'string' ? input.shippingAddress.city.trim() : '';
    const state =
      typeof input.shippingAddress?.state === 'string' ? input.shippingAddress.state.trim() : '';
    const customFields = {
      checkoutOrigin: 'stripe',
      ...(city ? { city } : {}),
      ...(state ? { state } : {}),
    };

    try {
      await this.prisma.contact.upsert({
        where: {
          workspaceId_phone: {
            workspaceId: input.workspaceId,
            phone,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          phone,
          name: input.customerName,
          email,
          customFields,
        },
        update: {
          name: input.customerName || undefined,
          email,
          customFields,
        },
      });
      return {
        synced: true,
        skipped: false,
      } as const;
    } catch (error: unknown) {
      const message = String((error as Error)?.message || error);
      this.logger.warn(`Checkout contact sync failed for ${input.workspaceId}: ${message}`);
      Sentry.captureException(error, {
        tags: { type: 'checkout_contact_sync', component: 'checkout_order_support' },
        extra: { workspaceId: input.workspaceId, email, phone },
        level: 'warning',
      });
      return {
        synced: false,
        skipped: false,
        reason: 'contact_upsert_failed',
        errorMessage: message,
      } as const;
    }
  }

  /** Resolve marketplace fee percent for a given payment method and base total. */
  async resolveMarketplaceFeePercent(
    paymentMethod: 'CREDIT_CARD' | 'PIX' | 'BOLETO',
    baseTotalInCents: number,
    defaultFeePercent: number,
  ): Promise<number> {
    const now = new Date();
    const volumeInCents = BigInt(Math.max(0, Math.round(baseTotalInCents)));
    const feeRows = await this.prisma.marketplaceFee.findMany({
      where: {
        method: { in: [paymentMethod, '*'] },
        activeFrom: { lte: now },
        volumeFloorInCents: { lte: volumeInCents },
        AND: [
          { OR: [{ activeTo: null }, { activeTo: { gt: now } }] },
          {
            OR: [{ volumeCeilingInCents: null }, { volumeCeilingInCents: { gte: volumeInCents } }],
          },
        ],
      },
      orderBy: [{ activeFrom: 'desc' }, { volumeFloorInCents: 'desc' }],
      take: 10,
    });
    const selectedFee =
      feeRows.find((row) => row.method === paymentMethod) ||
      feeRows.find((row) => row.method === '*') ||
      null;
    return selectedFee ? selectedFee.feeBps / 100 : defaultFeePercent;
  }

  /** Load and validate an affiliate link for the given checkoutCode and planId. */
  async resolveAffiliateLink(
    checkoutCode: string,
    planProductId: string,
  ): Promise<{
    id: string;
    code: string;
    affiliateWorkspaceId: string;
    affiliateProductId: string;
    affiliateProduct: { commissionPct: number; productId: string };
  } | null> {
    const normalizedCode = String(checkoutCode).trim().toUpperCase();
    const link = await this.prisma.affiliateLink.findFirst({
      where: { active: true, OR: [{ code: normalizedCode }, { code: checkoutCode }] },
      include: { affiliateProduct: { select: { commissionPct: true, productId: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (link && link.affiliateProduct.productId !== planProductId) {
      throw new BadRequestException('O link de afiliado não corresponde ao plano selecionado.');
    }
    return link;
  }

  /** Load plan record required for order creation, throwing on missing/workspace mismatch. */
  async resolvePlanForOrder(planId: string, workspaceId: string) {
    const planRecord = await this.prisma.checkoutProductPlan.findUnique({
      where: { id: planId },
      include: {
        product: {
          select: {
            id: true,
            workspaceId: true,
            commissionPercent: true,
            name: true,
            description: true,
            imageUrl: true,
            images: true,
            category: true,
            format: true,
          },
        },
        orderBumps: {
          where: { isActive: true },
          select: {
            id: true,
            title: true,
            description: true,
            productName: true,
            image: true,
            priceInCents: true,
          },
        },
        checkoutConfig: true,
      },
    });
    if (!planRecord) {
      throw new NotFoundException('Plano não encontrado para criar o pedido.');
    }
    if (planRecord.product?.workspaceId !== workspaceId) {
      throw new BadRequestException('O plano informado não pertence ao workspace informado.');
    }
    return planRecord;
  }
}
