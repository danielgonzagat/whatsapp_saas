/**
 * Self-awareness (TIER-0 meta-cognitive) tool dispatch helpers extracted from
 * KloelToolDispatcherService. Covers the `self.*` capability surface plus the
 * `list_capabilities` legacy alias, including audit-log replay, capability
 * explanation, dispatcher gaps diff, infrastructure health snapshot, and the
 * canonical capability list (live registry first, hardcoded fallback last).
 *
 * Each case is a thin delegation to {@link AuditService},
 * {@link SelfGapsService}, {@link SelfHealthService}, and
 * {@link CapabilityRegistryV2Service}. Behaviour and argument coercion are
 * preserved one-for-one from the previous inline switch.
 */

import type { AuditService } from '../audit/audit.service';
import type { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
import type { SelfGapsService } from './self-awareness/self-gaps.service';
import type { SelfHealthService } from './self-awareness/self-health.service';
import type { UnknownRecord } from '../common/types';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

/**
 * Tool names handled by {@link dispatchSelfTool}. Mirrors the case labels
 * that previously lived in the dispatcher switch.
 */
export const SELF_TOOL_NAMES = new Set<string>([
  'self.audit_log',
  'self.explain',
  'self.gaps',
  'self.health',
  'self.capabilities',
  'list_capabilities',
]);

export function isSelfTool(toolName: string): boolean {
  return SELF_TOOL_NAMES.has(toolName);
}

/** Dependencies required by the self-awareness dispatcher. */
export interface SelfToolDeps {
  auditService: AuditService;
  selfGaps: SelfGapsService | undefined;
  selfHealth: SelfHealthService | undefined;
  capRegistryV2: CapabilityRegistryV2Service | undefined;
}

const FALLBACK_CAPABILITIES: string[] = [
  'create_product',
  'update_product',
  'list_products',
  'delete_product',
  'create_plan',
  'update_plan',
  'get_product_plans',
  'create_checkout',
  'update_checkout',
  'list_checkouts',
  'create_coupon',
  'update_coupon',
  'delete_coupon',
  'list_coupons',
  'validate_coupon',
  'generate_pix',
  'generate_boleto',
  'create_payment_link',
  'list_orders',
  'get_order_details',
  'get_sales_summary',
  'get_abandonments',
  'list_leads',
  'get_lead_details',
  'get_wallet_balance',
  'get_wallet_statement',
  'request_withdrawal',
  'request_anticipation',
  'get_dashboard_summary',
  'get_analytics',
  'toggle_theme',
  'get_settings',
  'update_personal_data',
  'update_fiscal_data',
  'upload_document',
  'configure_shipping',
  'configure_warranty',
  'configure_pixel',
  'configure_social_proof',
  'configure_exit_intent',
  'configure_order_bump',
  'configure_after_pay',
  'list_affiliates',
  'get_affiliate_config',
  'update_affiliate_config',
  'browse_marketplace',
  'get_product_reviews',
  'get_product_urls',
  'list_subscriptions',
  'update_subscription',
  'search_agent_memory',
  'search_agent_sessions',
  'search_web',
  'search_codebase',
  'read_source_file',
  'connect_whatsapp',
  'get_whatsapp_status',
  'send_whatsapp_message',
  'send_channel_message',
  'create_broadcast',
  'create_campaign',
  'create_flow',
  'list_flows',
  'toggle_autopilot',
  'configure_ai_persona',
  'update_billing_info',
  'get_billing_status',
  'change_plan',
  'remember_user_info',
  'get_product_details',
  'self.inspect',
  'self.health',
];

/**
 * Dispatch a self-awareness tool. Returns `null` when the tool name is not
 * part of the self.* domain so the caller can fall through.
 */
export async function dispatchSelfTool(
  deps: SelfToolDeps,
  workspaceId: string,
  toolName: string,
  args: UnknownRecord,
): Promise<ToolResult | null> {
  const { auditService, selfGaps, selfHealth, capRegistryV2 } = deps;

  switch (toolName) {
    case 'self.audit_log': {
      const limit =
        typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 100) : 20;
      const entries = await auditService.recentForWorkspace(workspaceId, limit);
      return {
        success: true,
        capabilityId: 'self.audit_log',
        outputs: {
          entries: entries.map((e) => ({
            id: e.id,
            actor: e.agent?.name ?? e.agentId ?? 'system',
            capability: e.action,
            success: true,
            timestamp: e.createdAt.toISOString(),
            evidenceUrl: undefined,
          })),
        },
        message: `Últimas ${entries.length} ações executadas`,
      };
    }

    case 'self.explain': {
      const capabilityId = typeof args.capabilityId === 'string' ? args.capabilityId : '';
      const receiptId = typeof args.lastReceiptId === 'string' ? args.lastReceiptId : undefined;

      if (receiptId) {
        const entry = await auditService.findById(workspaceId, receiptId);
        if (!entry) {
          return { success: false, error: 'receipt_not_found' };
        }
        return {
          success: true,
          capabilityId: 'self.explain',
          outputs: {
            id: entry.id,
            action: entry.action,
            resource: entry.resource,
            inputs: (entry.details ?? {}) as Record<string, unknown>,
            timestamp: entry.createdAt.toISOString(),
            agent: entry.agent?.name ?? entry.agentId ?? 'system',
          },
          message: `Detalhes da ação ${entry.action}`,
        };
      }

      if (!capabilityId) {
        return { success: false, error: 'capabilityId_or_lastReceiptId_required' };
      }

      const cap = capRegistryV2?.get(capabilityId);
      if (!cap) {
        return { success: false, error: 'capability_not_found' };
      }
      return {
        success: true,
        capabilityId: 'self.explain',
        outputs: {
          id: cap.id,
          title: cap.title,
          description: cap.description,
          tier: cap.tier,
          category: cap.category,
          requiresConfirmation: cap.requiresConfirmation,
          inputSchema: cap.inputSchema,
          surface: cap.surface,
        },
        message: cap.description,
      };
    }

    case 'self.gaps': {
      if (!selfGaps) {
        return { success: false, error: 'self_gaps_service_unavailable' };
      }
      const result = selfGaps.diffRegistryVsDispatcher();
      return {
        success: true,
        capabilityId: 'self.gaps',
        outputs: {
          unwiredCount: result.unwired.length,
          unwired: result.unwired.map((c) => ({
            id: c.id,
            title: c.title,
            tier: c.tier,
          })),
        },
        message: `${result.unwired.length} capacidades declaradas mas sem dispatcher case`,
      };
    }

    case 'self.health': {
      if (!selfHealth) {
        return { success: false, error: 'self_health_service_unavailable' };
      }
      const snapshot = await selfHealth.snapshot(workspaceId);
      return {
        success: true,
        capabilityId: 'self.health',
        outputs: snapshot,
      };
    }

    case 'self.capabilities':
    case 'list_capabilities': {
      const registryCapabilities = capRegistryV2?.list() ?? [];
      if (registryCapabilities.length > 0) {
        const capabilities = registryCapabilities.map((cap) => ({
          id: cap.id,
          title: cap.title,
          category: cap.category,
          tier: cap.tier,
          requiresConfirmation: cap.requiresConfirmation,
          requiredPermissions: cap.requiredPermissions,
          surface: cap.surface,
          maturity: cap.maturity ?? 'registry',
        }));

        return {
          success: true,
          capabilityId: 'self.capabilities',
          capabilities: capabilities.map((cap) => cap.id),
          outputs: {
            total: capabilities.length,
            capabilities,
          },
          message: `${capabilities.length} capacidades carregadas do registry vivo`,
        };
      }

      return {
        success: true,
        capabilityId: 'self.capabilities',
        capabilities: [...FALLBACK_CAPABILITIES],
      };
    }

    default:
      return null;
  }
}
