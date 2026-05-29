import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { StructuredLogger } from '../logging/structured-logger';
import { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
import { AccountService } from './account.service';
import { CouponService } from './coupon.service';
import { MemoryService } from './memory.service';
import { ReportService } from './report.service';
import { WalletService as KloelWalletService } from './wallet.service';
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
import { SalesService } from '../sales/sales.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { FlowsService } from '../flows/flows.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { WhatsappService } from '../marketing/channels/whatsapp/whatsapp.service';

import type { UnknownRecord } from '../common/types';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

/** Maps capability domainService strings to NestJS service instances via ModuleRef DI. */
@Injectable()
export class KloelDomainServiceResolver {
  private readonly logger = StructuredLogger.from(KloelDomainServiceResolver.name);

  /**
   * Static mapping of domainService name prefix → NestJS class token.
   * Maps the service-name segment from domainService strings to the actual
   * NestJS-injectable class reference used for ModuleRef lookup.
   */
  private static readonly SERVICE_TOKEN_MAP = new Map<string, new (...args: never[]) => unknown>([
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
    ['SalesService', SalesService],
    ['WorkspaceService', WorkspaceService],

    // ── Name-mismatch aliases (class name ≠ domainService prefix) ──
    ['FlowService', FlowsService],
    ['CampaignService', CampaignsService],
    ['WhatsAppService', WhatsappService],
    ['OrderService', CheckoutOrderService],
  ]);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly capRegistryV2: CapabilityRegistryV2Service,
  ) {}

  /**
   * Try to execute a tool via the domain service resolver.
   *
   * @returns ToolResult on successful resolve+call, or null if the capability
   *          is not found OR has no parsable domainService (so the dispatcher
   *          continues with old behavior).
   */
  async tryExecute(
    toolName: string,
    workspaceId: string,
    args: UnknownRecord,
  ): Promise<ToolResult | null> {
    const cap = this.capRegistryV2.get(toolName);
    if (!cap) {
      return null;
    }

    const domainService = cap.domainService;
    // No domainService or placeholder alias — skip, let old dispatcher handle
    if (!domainService || domainService.startsWith('Alias for')) {
      return null;
    }

    // Parse "ServiceName.methodName" — dot is the separator
    const dotIdx = domainService.indexOf('.');
    if (dotIdx === -1) {
      this.logger.warn('domainService sem ponto', { domainService, toolName });
      return null;
    }

    const serviceName = domainService.slice(0, dotIdx);
    const methodName = domainService.slice(dotIdx + 1);

    // Compound references like "MediaService.attach + ProductService.setImage"
    // are skipped — they need manual dispatch logic
    if (methodName.includes('+')) {
      return null;
    }

    const token = KloelDomainServiceResolver.SERVICE_TOKEN_MAP.get(serviceName);
    if (!token) {
      return {
        success: false,
        error: 'unknown_service',
        detail: `Serviço "${serviceName}" não encontrado no registro de tokens DI`,
      };
    }

    let instance: object;
    try {
      instance = this.moduleRef.get(token, { strict: false });
    } catch {
      return {
        success: false,
        error: 'unknown_service',
        detail: `Serviço "${serviceName}" não disponível no contêiner DI`,
      };
    }

    if (!instance) {
      return {
        success: false,
        error: 'unknown_service',
        detail: `Serviço "${serviceName}" retornou undefined`,
      };
    }

    const method = (instance as Record<string, unknown>)[methodName];
    if (typeof method !== 'function') {
      return {
        success: false,
        error: 'method_not_found',
        detail: `Método "${methodName}" não encontrado em "${serviceName}"`,
      };
    }

    try {
      const rawResult = await (method as (...a: unknown[]) => unknown).call(
        instance,
        workspaceId,
        args,
      );
      // Normalize result: if it already has success, return as-is
      if (rawResult && typeof rawResult === 'object' && 'success' in rawResult) {
        return rawResult as ToolResult;
      }
      // Wrap non-standard result
      return { success: true, data: rawResult };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Erro ao chamar ${serviceName}.${methodName}`, {
        error: msg,
        toolName,
      });
      return {
        success: false,
        error: 'service_call_failed',
        detail: msg,
      };
    }
  }
}
