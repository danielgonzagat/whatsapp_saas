/**
 * Business-config / workspace settings tool dispatch helpers extracted from
 * KloelToolDispatcherService. Covers the `update_affiliate_config`,
 * `list_affiliates`, `update_fiscal_data`, `upload_document`,
 * `get_social_channels`, `connect_channel`, `update_workspace_settings`,
 * `list_leads`, `get_lead_details`, `save_business_info`,
 * `set_business_hours`, `update_billing_info`, and `get_billing_status`
 * capabilities, all of which delegate to
 * {@link KloelBusinessConfigToolsService}.
 *
 * Behaviour and argument coercion are preserved one-for-one from the
 * previous inline switch cases.
 */

import type { KloelBusinessConfigToolsService } from './kloel-business-config-tools.service';
import type { UnknownRecord } from '../common/types';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

/**
 * Tool names handled by {@link dispatchBizConfigTool}. Mirrors the case
 * labels that previously lived in the dispatcher switch.
 */
export const BIZ_CONFIG_TOOL_NAMES = new Set<string>([
  'update_affiliate_config',
  'list_affiliates',
  'update_fiscal_data',
  'upload_document',
  'get_social_channels',
  'connect_channel',
  'update_workspace_settings',
  'list_leads',
  'get_lead_details',
  'save_business_info',
  'set_business_hours',
  'update_billing_info',
  'get_billing_status',
]);

export function isBizConfigTool(toolName: string): boolean {
  return BIZ_CONFIG_TOOL_NAMES.has(toolName);
}

/** Dependencies required by the biz-config dispatcher. */
export interface BizConfigToolDeps {
  bizConfigToolsService: KloelBusinessConfigToolsService;
}

/**
 * Dispatch a business-config / workspace settings tool. Returns `null`
 * when the tool name is not part of this domain so the caller can fall
 * through to the dispatcher's main switch.
 */
export async function dispatchBizConfigTool(
  deps: BizConfigToolDeps,
  workspaceId: string,
  toolName: string,
  args: UnknownRecord,
): Promise<ToolResult | null> {
  const asToolArgs = <T>(value: UnknownRecord): T => value as T;
  const { bizConfigToolsService } = deps;

  switch (toolName) {
    case 'update_affiliate_config':
      return await bizConfigToolsService.toolUpdateAffiliateConfig(
        workspaceId,
        asToolArgs(args),
      );
    case 'list_affiliates':
      return await bizConfigToolsService.toolListAffiliates(workspaceId);
    case 'update_fiscal_data':
      return await bizConfigToolsService.toolSaveBusinessInfo(
        workspaceId,
        asToolArgs(args),
      );
    case 'upload_document':
      if (!bizConfigToolsService?.toolUploadDocument) {
        return { success: false, error: 'document_service_unavailable' };
      }
      return await bizConfigToolsService.toolUploadDocument(workspaceId, asToolArgs(args));
    case 'get_social_channels':
      return await bizConfigToolsService.toolGetSocialChannels(workspaceId);
    case 'connect_channel':
      return await bizConfigToolsService.toolConnectChannel(workspaceId, asToolArgs(args));
    case 'update_workspace_settings':
      return await bizConfigToolsService.toolSaveBusinessInfo(
        workspaceId,
        asToolArgs(args),
      );
    case 'list_leads':
      return await bizConfigToolsService.toolListLeads(workspaceId, asToolArgs(args));
    case 'get_lead_details':
      return await bizConfigToolsService.toolGetLeadDetails(workspaceId, asToolArgs(args));
    case 'save_business_info':
      return await bizConfigToolsService.toolSaveBusinessInfo(
        workspaceId,
        asToolArgs(args),
      );
    case 'set_business_hours':
      return await bizConfigToolsService.toolSetBusinessHours(
        workspaceId,
        asToolArgs(args),
      );
    case 'update_billing_info':
      return await bizConfigToolsService.toolUpdateBillingInfo(
        workspaceId,
        asToolArgs(args),
      );
    case 'get_billing_status':
      return await bizConfigToolsService.toolGetBillingStatus(workspaceId);
    default:
      return null;
  }
}
