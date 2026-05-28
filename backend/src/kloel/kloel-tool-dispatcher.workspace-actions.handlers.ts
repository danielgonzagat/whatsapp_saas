/**
 * Workspace-action tool dispatch helpers extracted from
 * KloelToolDispatcherService. Covers the write-side delegations to
 * {@link KloelChatToolsService} that wrap their result with a canonical
 * receipt via the dispatcher-provided callback, plus the small handful
 * of light commands that delegate without a receipt (send_channel_message,
 * create_order).
 *
 *   - toggle_autopilot         (receipt)
 *   - set_brand_voice          (receipt, enriches result with tone)
 *   - set_sales_policy         (receipt)
 *   - remember_user_info       (receipt, enriches result with key/value)
 *   - create_flow              (receipt)
 *   - send_channel_message     (no receipt — direct delegation)
 *   - create_broadcast         (receipt)
 *   - configure_ai_persona     (receipt)
 *   - create_order             (no receipt — direct delegation)
 *
 * Receipt wrapping is delegated to the caller via the `applyReceipt`
 * callback so the dispatcher remains the single owner of the
 * CapabilityRegistryV2 binding.
 */

import { asString } from './kloel-tool-dispatcher.helpers';
import type { KloelChatToolsService } from './kloel-chat-tools.service';
import type { UnknownRecord } from '../common/types';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

type ReceiptApplier = (
  capabilityId: string,
  workspaceId: string,
  args: UnknownRecord,
  result: ToolResult,
  userId: string | undefined,
  startedAt: number,
) => ToolResult;

/**
 * Tool names handled by {@link dispatchWorkspaceActionTool}. Mirrors the
 * case labels that previously lived in the dispatcher switch.
 */
export const WORKSPACE_ACTION_TOOL_NAMES = new Set<string>([
  'toggle_autopilot',
  'set_brand_voice',
  'set_sales_policy',
  'remember_user_info',
  'create_flow',
  'send_channel_message',
  'create_broadcast',
  'configure_ai_persona',
  'create_order',
]);

export function isWorkspaceActionTool(toolName: string): boolean {
  return WORKSPACE_ACTION_TOOL_NAMES.has(toolName);
}

/** Dependencies required by the workspace-actions dispatcher. */
export interface WorkspaceActionToolDeps {
  chatToolsService: KloelChatToolsService;
  applyReceipt: ReceiptApplier;
  userId: string | undefined;
}

/**
 * Dispatch a workspace-action tool. Returns `null` when the tool name is
 * not part of this domain so the caller can fall through.
 */
export async function dispatchWorkspaceActionTool(
  deps: WorkspaceActionToolDeps,
  workspaceId: string,
  toolName: string,
  args: UnknownRecord,
): Promise<ToolResult | null> {
  const asToolArgs = <T>(value: UnknownRecord): T => value as T;
  const { chatToolsService, applyReceipt, userId } = deps;

  switch (toolName) {
    case 'toggle_autopilot': {
      const startedAt = Date.now();
      const result = await chatToolsService.toolToggleAutopilot(workspaceId, asToolArgs(args));
      return applyReceipt('toggle_autopilot', workspaceId, args, result, userId, startedAt);
    }
    case 'set_brand_voice': {
      const startedAt = Date.now();
      const result = await chatToolsService.toolSetBrandVoice(workspaceId, asToolArgs(args));
      const resultWithTone = result.success ? { ...result, tone: asString(args.tone) } : result;
      return applyReceipt(
        'set_brand_voice',
        workspaceId,
        args,
        resultWithTone,
        userId,
        startedAt,
      );
    }
    case 'set_sales_policy': {
      const startedAt = Date.now();
      const result = await chatToolsService.toolSetSalesPolicy(
        workspaceId,
        asToolArgs(args),
        userId,
      );
      return applyReceipt('set_sales_policy', workspaceId, args, result, userId, startedAt);
    }
    case 'remember_user_info': {
      const startedAt = Date.now();
      const result = await chatToolsService.toolRememberUserInfo(
        workspaceId,
        asToolArgs(args),
        userId,
      );
      const resultWithMemory = result.success
        ? { ...result, key: asString(args.key), value: asString(args.value) }
        : result;
      return applyReceipt(
        'remember_user_info',
        workspaceId,
        args,
        resultWithMemory,
        userId,
        startedAt,
      );
    }
    case 'create_flow': {
      const startedAt = Date.now();
      const result = await chatToolsService.toolCreateFlow(workspaceId, asToolArgs(args));
      return applyReceipt('create_flow', workspaceId, args, result, userId, startedAt);
    }
    case 'send_channel_message':
      return await chatToolsService.toolSendChannelMessage(workspaceId, asToolArgs(args));
    case 'create_broadcast': {
      const startedAt = Date.now();
      const result = await chatToolsService.toolCreateBroadcast(workspaceId, asToolArgs(args));
      return applyReceipt('create_broadcast', workspaceId, args, result, userId, startedAt);
    }
    case 'configure_ai_persona': {
      const startedAt = Date.now();
      const result = await chatToolsService.toolConfigureAiPersona(workspaceId, asToolArgs(args));
      return applyReceipt(
        'configure_ai_persona',
        workspaceId,
        args,
        result,
        userId,
        startedAt,
      );
    }
    case 'create_order':
      return await chatToolsService.toolCreateOrder(workspaceId, asToolArgs(args));
    default:
      return null;
  }
}
