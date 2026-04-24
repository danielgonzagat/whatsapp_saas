import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { KloelContextFormatterLimits } from './kloel-context-formatter.types';
import { buildWorkspaceProductSelect } from './kloel-workspace-context-product-select';

const PRODUCT_CONTEXT_LIMIT = 20;

/** Raw data fetched in a single Promise.all for workspace context building. */
export interface WorkspaceContextRawData {
  workspace: {
    providerSettings: unknown;
    customDomain: string | null;
    branding: unknown;
    stripeCustomerId: string | null;
  } | null;
  rawProducts: unknown[];
  rawProductCount: number;
  subscription: {
    status: string;
    plan: string;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    updatedAt: Date;
  } | null;
  invoices: Array<Record<string, unknown>>;
  externalPaymentLinks: Array<Record<string, unknown>>;
  integrations: Array<Record<string, unknown>>;
  affiliateRequests: Array<{
    affiliateProductId: string;
    status: string;
    updatedAt: Date;
    affiliateProduct: Record<string, unknown> | null;
  }>;
  affiliateLinks: Array<{
    affiliateProductId: string;
    code: string | null;
    clicks: number | null;
    sales: number | null;
    revenue: unknown;
    commissionEarned: unknown;
    active: boolean;
    affiliateProduct: Record<string, unknown> | null;
  }>;
  affiliatePartners: Array<Record<string, unknown>>;
  customerSubscriptions: Array<Record<string, unknown>>;
  physicalOrders: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  memories: Array<{
    id: string;
    key: string;
    value: unknown;
    category: string | null;
    type: string | null;
    content: string | null;
    createdAt: Date;
  }>;
  userProfile: { content?: string | null } | null | undefined;
}

/** Fetches all raw data needed to build workspace context in one parallel round-trip. */
@Injectable()
export class KloelWorkspaceContextDataService {
  constructor(private readonly prisma: PrismaService) {}

  async fetchAll(
    workspaceId: string,
    limits: KloelContextFormatterLimits,
    userId?: string,
  ): Promise<WorkspaceContextRawData> {
    const productSelect = buildWorkspaceProductSelect(limits);
    const affiliateProductRelationSelect = {
      productId: true,
      category: true,
      tags: true,
      commissionPct: true,
      commissionType: true,
      cookieDays: true,
      approvalMode: true,
      totalAffiliates: true,
      totalSales: true,
      totalRevenue: true,
      temperature: true,
      thumbnailUrl: true,
      promoMaterials: true,
    } as const;

    const [
      workspace,
      rawProducts,
      rawProductCount,
      subscription,
      invoices,
      externalPaymentLinks,
      integrations,
      affiliateRequests,
      affiliateLinks,
      affiliatePartners,
      customerSubscriptions,
      physicalOrders,
      payments,
      memories,
      userProfile,
    ] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          providerSettings: true,
          customDomain: true,
          branding: true,
          stripeCustomerId: true,
        },
      }),
      this.prisma.product.findMany({
        where: { workspaceId },
        select: productSelect,
        orderBy: [{ active: 'desc' }, { featured: 'desc' }, { updatedAt: 'desc' }],
        take: PRODUCT_CONTEXT_LIMIT,
      }),
      this.prisma.product.count({ where: { workspaceId } }),
      this.prisma.subscription.findUnique({
        where: { workspaceId },
        select: {
          status: true,
          plan: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          updatedAt: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: limits.workspaceInvoiceContextLimit,
        select: { amount: true, status: true, createdAt: true },
      }),
      this.prisma.externalPaymentLink.findMany({
        where: { workspaceId, isActive: true },
        orderBy: [{ totalRevenue: 'desc' }, { updatedAt: 'desc' }],
        take: limits.workspaceExternalLinkContextLimit,
        select: {
          platform: true,
          productName: true,
          price: true,
          paymentUrl: true,
          totalSales: true,
          totalRevenue: true,
          lastSaleAt: true,
        },
      }),
      this.prisma.integration.findMany({
        where: { workspaceId },
        orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
        take: limits.workspaceIntegrationContextLimit,
        select: { type: true, name: true, isActive: true },
      }),
      this.prisma.affiliateRequest.findMany({
        where: { affiliateWorkspaceId: workspaceId },
        orderBy: { updatedAt: 'desc' },
        take: limits.workspaceAffiliateContextLimit,
        select: {
          affiliateProductId: true,
          status: true,
          updatedAt: true,
          affiliateProduct: { select: affiliateProductRelationSelect },
        },
      }),
      this.prisma.affiliateLink.findMany({
        where: { affiliateWorkspaceId: workspaceId },
        orderBy: { createdAt: 'desc' },
        take: limits.workspaceAffiliateContextLimit,
        select: {
          affiliateProductId: true,
          code: true,
          clicks: true,
          sales: true,
          revenue: true,
          commissionEarned: true,
          active: true,
          affiliateProduct: { select: affiliateProductRelationSelect },
        },
      }),
      this.prisma.affiliatePartner.findMany({
        where: { workspaceId },
        orderBy: [{ totalSales: 'desc' }, { updatedAt: 'desc' }],
        take: limits.workspaceAffiliatePartnerContextLimit,
        select: {
          partnerName: true,
          type: true,
          status: true,
          commissionRate: true,
          totalSales: true,
          totalCommission: true,
        },
      }),
      this.prisma.customerSubscription.findMany({
        where: { workspaceId },
        orderBy: { updatedAt: 'desc' },
        take: limits.workspaceCustomerSubscriptionContextLimit,
        select: {
          productId: true,
          planName: true,
          amount: true,
          currency: true,
          interval: true,
          status: true,
          nextBillingAt: true,
        },
      }),
      this.prisma.physicalOrder.findMany({
        where: { workspaceId },
        orderBy: { updatedAt: 'desc' },
        take: limits.workspacePhysicalOrderContextLimit,
        select: {
          productName: true,
          status: true,
          paymentStatus: true,
          shippingMethod: true,
          createdAt: true,
        },
      }),
      this.prisma.payment.findMany({
        where: { workspaceId },
        orderBy: { updatedAt: 'desc' },
        take: limits.workspacePaymentContextLimit,
        select: {
          provider: true,
          method: true,
          status: true,
          amount: true,
          currency: true,
          paidAt: true,
          createdAt: true,
        },
      }),
      typeof this.prisma.kloelMemory?.findMany === 'function'
        ? this.prisma.kloelMemory.findMany({
            where: { workspaceId },
            select: {
              id: true,
              key: true,
              value: true,
              category: true,
              type: true,
              content: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
          })
        : Promise.resolve([]),
      userId
        ? this.prisma.kloelMemory?.findUnique?.({
            where: { workspaceId_key: { workspaceId, key: `user_profile:${userId}` } },
          })
        : Promise.resolve(null),
    ]);

    return {
      workspace,
      rawProducts: rawProducts as unknown[],
      rawProductCount,
      subscription,
      invoices: invoices as Array<Record<string, unknown>>,
      externalPaymentLinks: externalPaymentLinks as Array<Record<string, unknown>>,
      integrations: integrations as Array<Record<string, unknown>>,
      affiliateRequests: affiliateRequests as WorkspaceContextRawData['affiliateRequests'],
      affiliateLinks: affiliateLinks as WorkspaceContextRawData['affiliateLinks'],
      affiliatePartners: affiliatePartners as Array<Record<string, unknown>>,
      customerSubscriptions: customerSubscriptions as Array<Record<string, unknown>>,
      physicalOrders: physicalOrders as Array<Record<string, unknown>>,
      payments: payments as Array<Record<string, unknown>>,
      memories: memories as WorkspaceContextRawData['memories'],
      userProfile: userProfile as { content?: string | null } | null | undefined,
    };
  }
}
