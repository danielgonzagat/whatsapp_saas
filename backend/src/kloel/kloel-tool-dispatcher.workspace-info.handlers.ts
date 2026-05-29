/**
 * Read-only / workspace-info tool dispatch helpers extracted from
 * KloelToolDispatcherService. These tools are pure delegations to
 * {@link KloelChatToolsService} that do not require canonical receipts,
 * audit transactions, or argument enrichment.
 *
 *   - list_flows
 *   - get_dashboard_summary
 *   - get_product_plans
 *   - get_product_ai_config
 *   - get_product_reviews
 *   - get_product_urls
 *   - validate_coupon
 *   - toggle_theme
 *   - get_settings
 *   - get_analytics
 *   - get_product_details
 *   - list_subscriptions
 *   - update_subscription            (static success message — preserved verbatim)
 *   - get_affiliate_config
 *   - browse_marketplace
 *
 * Behaviour and argument coercion are preserved one-for-one with the
 * previous inline switch cases.
 */

import type { KloelChatToolsService } from './kloel-chat-tools.service';
import type { UnknownRecord } from '../common/types';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

/**
 * Tool names handled by {@link dispatchWorkspaceInfoTool}. Mirrors the
 * case labels that previously lived in the dispatcher switch.
 */
export const WORKSPACE_INFO_TOOL_NAMES = new Set<string>([
  'list_flows',
  'get_dashboard_summary',
  'get_product_plans',
  'get_product_ai_config',
  'get_product_reviews',
  'get_product_urls',
  'validate_coupon',
  'get_settings',
  'get_analytics',
  'get_product_details',
  'list_subscriptions',
  'update_subscription',
  'get_affiliate_config',
  'browse_marketplace',
]);

export function isWorkspaceInfoTool(toolName: string): boolean {
  return WORKSPACE_INFO_TOOL_NAMES.has(toolName);
}

/** Dependencies required by the workspace-info dispatcher. */
export interface WorkspaceInfoToolDeps {
  chatToolsService: KloelChatToolsService;
}

/**
 * Dispatch a workspace-info / read-only tool. Returns `null` when the
 * tool name is not part of this domain so the caller can fall through.
 */
export async function dispatchWorkspaceInfoTool(
  deps: WorkspaceInfoToolDeps,
  workspaceId: string,
  toolName: string,
  args: UnknownRecord,
): Promise<ToolResult | null> {
  const asToolArgs = <T>(value: UnknownRecord): T => value as T;
  const { chatToolsService } = deps;

  switch (toolName) {
    case 'list_flows':
      return await chatToolsService.toolListFlows(workspaceId);
    case 'get_dashboard_summary':
      return await chatToolsService.toolGetDashboardSummary(workspaceId, asToolArgs(args));
    case 'get_product_plans':
      return await chatToolsService.toolGetProductPlans(workspaceId, asToolArgs(args));
    case 'get_product_ai_config':
      return await chatToolsService.toolGetProductAiConfig(workspaceId, asToolArgs(args));
    case 'get_product_reviews':
      return await chatToolsService.toolGetProductReviews(workspaceId, asToolArgs(args));
    case 'get_product_urls':
      return await chatToolsService.toolGetProductUrls(workspaceId, asToolArgs(args));
    case 'validate_coupon':
      return await chatToolsService.toolValidateCoupon(workspaceId, asToolArgs(args));
    case 'get_settings':
      return await chatToolsService.toolGetSettings(workspaceId);
    case 'get_analytics':
      return await chatToolsService.toolGetAnalytics(workspaceId, asToolArgs(args));
    case 'get_product_details':
      return await chatToolsService.toolGetProductDetails(workspaceId, asToolArgs(args));
    case 'list_subscriptions':
      return await chatToolsService.toolListSubscriptions(workspaceId, asToolArgs(args));
    case 'update_subscription':
      return {
        success: true,
        message: args.action === 'cancel' ? 'Assinatura cancelada.' : 'Assinatura pausada.',
      };
    case 'get_affiliate_config':
      return await chatToolsService.toolGetAffiliateConfig(workspaceId);
    case 'browse_marketplace':
      return await chatToolsService.toolBrowseMarketplace(workspaceId, asToolArgs(args));
    default:
      return null;
  }
}
