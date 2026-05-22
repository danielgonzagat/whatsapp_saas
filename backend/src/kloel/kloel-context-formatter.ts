import { KloelContextBaseFormatter } from './kloel-context-base-formatter';
import type { KloelContextFormatterLimits } from './kloel-context-formatter.types';
import { KloelProductContextFormatter } from './kloel-product-context-formatter';
import { KloelWorkspaceCommerceContextFormatter } from './kloel-workspace-commerce-context-formatter';
import { KloelWorkspaceCoreContextFormatter } from './kloel-workspace-core-context-formatter';

export type { KloelContextFormatterLimits } from './kloel-context-formatter.types';

export class KloelContextFormatter extends KloelContextBaseFormatter {
  private product: KloelProductContextFormatter;
  private workspaceCore: KloelWorkspaceCoreContextFormatter;
  private workspaceCommerce: KloelWorkspaceCommerceContextFormatter;

  constructor(limits: KloelContextFormatterLimits) {
    super(limits);
    this.product = new KloelProductContextFormatter(this, limits);
    this.workspaceCore = new KloelWorkspaceCoreContextFormatter(this, limits);
    this.workspaceCommerce = new KloelWorkspaceCommerceContextFormatter(this, limits);
  }

  buildProductPlanContext(plans: unknown): string | null {
    return this.product.buildProductPlanContext(plans);
  }

  buildProductUrlContext(urls: unknown): string | null {
    return this.product.buildProductUrlContext(urls);
  }

  buildProductReviewContext(reviews: unknown): string | null {
    return this.product.buildProductReviewContext(reviews);
  }

  buildProductCheckoutContext(checkouts: unknown): string | null {
    return this.product.buildProductCheckoutContext(checkouts);
  }

  buildProductCouponContext(coupons: unknown, currency?: unknown): string | null {
    return this.product.buildProductCouponContext(coupons, currency);
  }

  buildProductCampaignContext(campaigns: unknown): string | null {
    return this.product.buildProductCampaignContext(campaigns);
  }

  buildProductCommissionContext(commissions: unknown): string | null {
    return this.product.buildProductCommissionContext(commissions);
  }

  buildProductMarketingContext(aiConfig: unknown): string | null {
    return this.product.buildProductMarketingContext(aiConfig);
  }

  buildWorkspaceProductContext(product: Record<string, unknown>, index: number): string {
    return this.product.buildWorkspaceProductContext(product, index);
  }

  buildWorkspaceBusinessHoursContext(businessHours: unknown): string | null {
    return this.workspaceCore.buildWorkspaceBusinessHoursContext(businessHours);
  }

  buildWorkspaceIntegrationContext(integrations: unknown): string | null {
    return this.workspaceCore.buildWorkspaceIntegrationContext(integrations);
  }

  buildWorkspaceBillingContext(params: {
    subscription?: unknown;
    invoices?: unknown;
    providerSettings?: Record<string, unknown> | null;
    stripeCustomerId?: string | null;
  }): string | null {
    return this.workspaceCore.buildWorkspaceBillingContext(params);
  }

  buildWorkspaceExternalPaymentLinkContext(links: unknown): string | null {
    return this.workspaceCore.buildWorkspaceExternalPaymentLinkContext(links);
  }

  buildAgentProfileContext(agent: unknown): string | null {
    return this.workspaceCore.buildAgentProfileContext(agent);
  }

  buildWorkspaceAffiliateContext(entries: unknown): string | null {
    return this.workspaceCommerce.buildWorkspaceAffiliateContext(entries);
  }

  buildWorkspaceAffiliatePartnerContext(partners: unknown): string | null {
    return this.workspaceCommerce.buildWorkspaceAffiliatePartnerContext(partners);
  }

  buildWorkspaceCustomerSubscriptionContext(subscriptions: unknown): string | null {
    return this.workspaceCommerce.buildWorkspaceCustomerSubscriptionContext(subscriptions);
  }

  buildWorkspacePhysicalOrderContext(orders: unknown): string | null {
    return this.workspaceCommerce.buildWorkspacePhysicalOrderContext(orders);
  }

  buildWorkspacePaymentContext(payments: unknown): string | null {
    return this.workspaceCommerce.buildWorkspacePaymentContext(payments);
  }
}
