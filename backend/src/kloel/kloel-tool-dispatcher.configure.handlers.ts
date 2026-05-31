/**
 * Configuration tool dispatch helpers extracted from
 * KloelToolDispatcherService. Covers the `configure_*` family of capabilities
 * that wrap a {@link KloelChatToolsService} call inside a canonical receipt:
 *
 *   - configure_pixel
 *   - configure_shipping
 *   - configure_social_proof
 *   - configure_order_bump
 *   - configure_warranty
 *   - configure_exit_intent
 *   - configure_after_pay
 *
 * Each case is a thin delegation to the matching `toolConfigure*` method on
 * {@link KloelChatToolsService}, wrapped via {@link buildCanonicalReceipt} so
 * that the live CapabilityRegistryV2 emits a material receipt. Behaviour and
 * argument coercion are preserved one-for-one from the previous inline switch.
 */

import { buildCanonicalReceipt } from './kloel-tool-dispatcher.receipt.helpers';
import type { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
import type { KloelChatToolsService } from './kloel-chat-tools.service';
import type { UnknownRecord } from '../common/types';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

/**
 * Tool names handled by {@link dispatchConfigureTool}. Kept in sync with the
 * dispatcher's switch cases so spec coverage on the dispatcher continues to
 * exercise this module.
 */
export const CONFIGURE_TOOL_NAMES = new Set<string>([
  'configure_pixel',
  'configure_shipping',
  'configure_social_proof',
  'configure_order_bump',
  'configure_warranty',
  'configure_exit_intent',
  'configure_after_pay',
]);

export function isConfigureTool(toolName: string): boolean {
  return CONFIGURE_TOOL_NAMES.has(toolName);
}

/**
 * Dispatch a `configure_*` tool. Returns `null` when the tool name is not
 * recognised so the caller can fall through to the next dispatcher branch.
 *
 * Behaviour is preserved one-for-one with the previous inline switch cases,
 * including the surrounding `withCanonicalReceipt` wrapping which is now
 * routed through {@link buildCanonicalReceipt} with the same arguments the
 * dispatcher previously supplied (capabilityId, workspaceId, args, result,
 * userId, startedAt).
 */
export async function dispatchConfigureTool(
  chatToolsService: KloelChatToolsService,
  capRegistryV2: CapabilityRegistryV2Service | undefined,
  workspaceId: string,
  toolName: string,
  args: UnknownRecord,
  userId: string | undefined,
): Promise<ToolResult | null> {
  const asToolArgs = <T>(value: UnknownRecord): T => value as T;

  switch (toolName) {
    case 'configure_pixel': {
      const startedAt = Date.now();
      const result = await chatToolsService.toolConfigurePixel(workspaceId, asToolArgs(args));
      return buildCanonicalReceipt(
        capRegistryV2,
        'configure_pixel',
        workspaceId,
        args,
        result,
        userId,
        startedAt,
      );
    }
    case 'configure_shipping': {
      const startedAt = Date.now();
      const result = await chatToolsService.toolConfigureShipping(workspaceId, asToolArgs(args));
      return buildCanonicalReceipt(
        capRegistryV2,
        'configure_shipping',
        workspaceId,
        args,
        result,
        userId,
        startedAt,
      );
    }
    case 'configure_social_proof': {
      const startedAt = Date.now();
      const result = await chatToolsService.toolConfigureSocialProof(workspaceId, asToolArgs(args));
      return buildCanonicalReceipt(
        capRegistryV2,
        'configure_social_proof',
        workspaceId,
        args,
        result,
        userId,
        startedAt,
      );
    }
    case 'configure_order_bump': {
      const startedAt = Date.now();
      const result = await chatToolsService.toolConfigureOrderBump(workspaceId, asToolArgs(args));
      return buildCanonicalReceipt(
        capRegistryV2,
        'configure_order_bump',
        workspaceId,
        args,
        result,
        userId,
        startedAt,
      );
    }
    case 'configure_warranty': {
      const startedAt = Date.now();
      const result = await chatToolsService.toolConfigureWarranty(workspaceId, asToolArgs(args));
      return buildCanonicalReceipt(
        capRegistryV2,
        'configure_warranty',
        workspaceId,
        args,
        result,
        userId,
        startedAt,
      );
    }
    case 'configure_exit_intent': {
      const startedAt = Date.now();
      const result = await chatToolsService.toolConfigureExitIntent(workspaceId, asToolArgs(args));
      return buildCanonicalReceipt(
        capRegistryV2,
        'configure_exit_intent',
        workspaceId,
        args,
        result,
        userId,
        startedAt,
      );
    }
    case 'configure_after_pay': {
      const startedAt = Date.now();
      const result = await chatToolsService.toolConfigureAfterPay(workspaceId, asToolArgs(args));
      return buildCanonicalReceipt(
        capRegistryV2,
        'configure_after_pay',
        workspaceId,
        args,
        result,
        userId,
        startedAt,
      );
    }
    default:
      return null;
  }
}
