import { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
import { AccountService } from './account.service';
import { CouponService } from './coupon.service';
import { MemoryService } from './memory.service';
import { ReportService } from './report.service';
import { SellerWalletService as KloelWalletService } from './wallet.service';
import { PaymentService } from './payment.service';
import { DepsCoverageService } from './self-awareness/deps-coverage.service';
import { CodeAccessService } from './self-awareness/code-access.service';
import { SelfHealthService } from './self-awareness/self-health.service';
import { SelfGapsService } from './self-awareness/self-gaps.service';
import { AuditService } from '../audit/audit.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { AutopilotService } from '../autopilot/autopilot.service';
import { BillingService } from '../billing/billing.service';
import { CheckoutService } from '../checkout/checkout.service';
import { CheckoutOrderService } from '../checkout/checkout-order.service';
import { CrmService } from '../crm/crm.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { HealthService } from '../health/health.service';
import { MarketplaceService } from '../marketplace/marketplace.service';
import { MediaService } from '../media/media.service';
import { PlanService } from '../plans/plan.service';
import { ProductService } from '../products/product.service';
import { ProductUrlService } from './product-sub-resources/product-url.service';
import { SalesService } from '../sales/sales.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { FlowsService } from '../flows/flows.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { WhatsappService } from '../marketing/channels/whatsapp/whatsapp.service';
import { ChannelMessageDispatchService } from '../marketing/channel-message-dispatch.service';
import { AffiliateService } from '../affiliate/affiliate.service';
// ── services-v2 (Wave 1) — boot-safe capability domain services ──
import { ThemeService } from './services-v2/theme.service';
import { AIConfigService } from './services-v2/ai-config.service';
import { ProductAIConfigService } from './services-v2/product-ai-config.service';
import { NpsService } from './services-v2/nps.service';
import { ChurnService } from './services-v2/churn.service';
import { AbandonmentService } from './services-v2/abandonment.service';
import { RefundService } from './services-v2/refund.service';
import { ReviewService } from './services-v2/review.service';
import { SubscriptionService } from './services-v2/subscription.service';
import { ShippingService } from './services-v2/shipping.service';
import { BrandService } from './services-v2/brand.service';
import { LeadService } from './services-v2/lead.service';
import { DocumentService } from './services-v2/document.service';
import { SessionService } from './services-v2/session.service';
// ── services-v2 (Wave 3) — dep-gated capability domain services ──
import { ChannelService } from './services-v2/channel.service';
import { MessagingService } from './services-v2/messaging.service';
import { AgentJobService } from './services-v2/agent-job.service';
import { SearchService } from './services-v2/search.service';
import { AudioService } from './audio.service';
import { PixelService } from './services-v2/pixel.service';

/** DI token shape used by the resolver token map. */
export type ServiceToken = new (...args: never[]) => unknown;

/**
 * Lazily-built mapping of domainService name prefix → NestJS class token.
 *
 * Built on first use (see {@link getServiceTokenMap}) instead of as an eager
 * module-level initializer. The resolver participates in an import cycle
 * (`product.service.ts → mind/coordination → … → domain-service-resolver →
 * product.service.ts`), so an eager static map can snapshot a cycle-partner
 * binding (e.g. `ProductService`) while it is still `undefined`, leaving the
 * entry as `['ProductService', undefined]`. That silently broke every
 * capability routed through a cyclic service (`unknown_service`). Deferring
 * construction until first lookup guarantees all module bindings are fully
 * assigned. The result is memoized so the map is built at most once.
 */
let serviceTokenMap: Map<string, ServiceToken> | undefined;

/** Build (or return the memoized) service-name → DI-token map. */
export function getServiceTokenMap(): Map<string, ServiceToken> {
  if (serviceTokenMap) {
    return serviceTokenMap;
  }
  const map = new Map<string, ServiceToken>([
    // ── Kloel-local services ──
    ['AccountService', AccountService],
    ['CouponService', CouponService],
    ['MemoryService', MemoryService],
    ['ReportService', ReportService],
    ['WalletService', KloelWalletService],
    ['PaymentService', PaymentService],
    ['DepsCoverageService', DepsCoverageService],
    ['CodeAccessService', CodeAccessService],
    ['SelfHealthService', SelfHealthService],
    ['SelfGapsService', SelfGapsService],
    ['CapabilityRegistry', CapabilityRegistryV2Service],

    // ── Cross-module domain services ──
    ['AffiliateService', AffiliateService],
    ['AnalyticsService', AnalyticsService],
    ['AuditService', AuditService],
    ['AutopilotService', AutopilotService],
    ['BillingService', BillingService],
    ['CheckoutService', CheckoutService],
    ['CrmService', CrmService],
    ['DashboardService', DashboardService],
    ['HealthService', HealthService],
    ['MarketplaceService', MarketplaceService],
    ['MediaService', MediaService],
    ['PlanService', PlanService],
    ['ProductService', ProductService],
    ['ProductUrlService', ProductUrlService],
    ['SalesService', SalesService],
    ['WorkspaceService', WorkspaceService],

    // ── Name-mismatch aliases (class name ≠ domainService prefix) ──
    ['FlowService', FlowsService],
    ['CampaignService', CampaignsService],
    ['WhatsAppService', WhatsappService],
    ['OrderService', CheckoutOrderService],
    // Canonical cross-channel outbound send façade (Wave7 L5).
    ['ChannelMessageDispatch', ChannelMessageDispatchService],

    // ── services-v2 capability wiring (Wave 1 integration; deps boot-safe) ──
    ['ThemeService', ThemeService],
    ['AIConfigService', AIConfigService],
    ['ProductAIConfigService', ProductAIConfigService],
    ['NpsService', NpsService],
    ['ChurnService', ChurnService],
    ['AbandonmentService', AbandonmentService],
    ['RefundService', RefundService],
    ['ReviewService', ReviewService],
    ['SubscriptionService', SubscriptionService],
    ['ShippingService', ShippingService],
    ['BrandService', BrandService],
    ['LeadService', LeadService],
    ['DocumentService', DocumentService],
    ['SessionService', SessionService],
    ['AudioService', AudioService],
    ['PixelService', PixelService],

    // ── services-v2 capability wiring (Wave 3 integration; deps now resolvable) ──
    ['ChannelService', ChannelService],
    ['MessagingService', MessagingService],
    ['AgentJobService', AgentJobService],
    ['SearchService', SearchService],
  ]);
  serviceTokenMap = map;
  return map;
}
