/**
 * Dotted-alias re-entrant tool dispatch helpers extracted from
 * KloelToolDispatcherService. Covers the family of dotted-form capability
 * IDs that re-enter the dispatcher via `executeTool(targetTool, …)` so the
 * existing per-tool delegation keeps firing unchanged, and wrap the result
 * in a canonical material receipt:
 *
 *   - products.create        → create_product             (receipt)
 *   - products.update        → update_product             (receipt)
 *   - products.upload_image  → upload_product_image       (receipt)
 *   - plans.create           → create_plan                (receipt)
 *   - plans.update           → update_plan                (receipt)
 *   - checkouts.create       → create_checkout            (receipt)
 *   - checkouts.update       → update_checkout            (receipt)
 *   - coupons.create         → create_coupon              (receipt)
 *   - coupons.delete         → delete_coupon              (receipt)
 *
 * Two legacy aliases are also routed here. They re-enter the dispatcher
 * the same way but the canonical receipt is NOT wrapped here — the target
 * `sales.*` tool already builds its own receipt downstream:
 *
 *   - generate_pix    → sales.create_pix
 *   - generate_boleto → sales.create_boleto
 *
 * Behaviour is preserved one-for-one with the previous inline switch cases.
 * Re-entry happens via the provided `executeTool` callback so receipts,
 * audit hooks and dispatch logging on the target tool keep firing.
 */

import { buildCanonicalReceipt } from './kloel-tool-dispatcher.receipt.helpers';
import type { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
import type { UnknownRecord } from '../common/types';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

/**
 * Dotted-alias → target-tool map for receipt-wrapped re-entries. The
 * dispatcher emits a canonical receipt under the dotted (alias) id so
 * downstream consumers can observe the public capability surface.
 */
const RECEIPT_WRAPPED_ALIAS_TARGETS: Record<string, string> = {
  'products.create': 'create_product',
  'products.update': 'update_product',
  'products.upload_image': 'upload_product_image',
  'plans.create': 'create_plan',
  'plans.update': 'update_plan',
  'checkouts.create': 'create_checkout',
  'checkouts.update': 'update_checkout',
  'coupons.create': 'create_coupon',
  'coupons.delete': 'delete_coupon',
};

/**
 * Legacy alias → target-tool map for bare re-entries (no receipt wrap
 * here — the target sales.* tool builds its own canonical receipt).
 */
const BARE_ALIAS_TARGETS: Record<string, string> = {
  generate_pix: 'sales.create_pix',
  generate_boleto: 'sales.create_boleto',
};

/**
 * Tool names handled by {@link dispatchDottedAliasTool}. Kept in sync
 * with the dispatcher's switch cases so spec coverage continues to
 * exercise this module.
 */
export const DOTTED_ALIAS_TOOL_NAMES = new Set<string>([
  ...Object.keys(RECEIPT_WRAPPED_ALIAS_TARGETS),
  ...Object.keys(BARE_ALIAS_TARGETS),
]);

export function isDottedAliasTool(toolName: string): boolean {
  return DOTTED_ALIAS_TOOL_NAMES.has(toolName);
}

/** Dependencies required by the dotted-alias dispatcher. */
export interface DottedAliasToolDeps {
  capRegistryV2: CapabilityRegistryV2Service | undefined;
  executeTool: (
    workspaceId: string,
    toolName: string,
    args: UnknownRecord,
    userId?: string,
  ) => Promise<ToolResult>;
  userId?: string | undefined;
}

/**
 * Dispatch a dotted-alias re-entrant tool. Returns `null` when the tool
 * name is not part of the dotted-alias domain so the caller can fall
 * through to the dispatcher's main switch.
 */
export async function dispatchDottedAliasTool(
  deps: DottedAliasToolDeps,
  workspaceId: string,
  toolName: string,
  args: UnknownRecord,
): Promise<ToolResult | null> {
  const { capRegistryV2, executeTool, userId } = deps;

  const receiptTarget = RECEIPT_WRAPPED_ALIAS_TARGETS[toolName];
  if (receiptTarget !== undefined) {
    const startedAt = Date.now();
    const result = await executeTool(workspaceId, receiptTarget, args, userId);
    return buildCanonicalReceipt(
      capRegistryV2,
      toolName,
      workspaceId,
      args,
      result,
      userId,
      startedAt,
    );
  }

  const bareTarget = BARE_ALIAS_TARGETS[toolName];
  if (bareTarget !== undefined) {
    return await executeTool(workspaceId, bareTarget, args, userId);
  }

  return null;
}
