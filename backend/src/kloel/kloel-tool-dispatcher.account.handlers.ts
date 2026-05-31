/**
 * Account-domain tool dispatch helpers extracted from
 * KloelToolDispatcherService. Covers the small `account.*` dotted-alias
 * family plus the `update_personal_data` direct delegation and the
 * `sales.list` alias that maps to `list_orders` on the wallet/sales
 * sub-service:
 *
 *   - update_personal_data     → AccountService.updatePersonalData
 *   - account.update_personal  → re-enters executeTool('update_personal_data')
 *   - account.update_fiscal    → re-enters executeTool('update_fiscal_data')
 *   - account.upload_document  → re-enters executeTool('upload_document')
 *   - sales.list               → walletSalesTools.executeTool('list_orders', ...)
 *
 * Behaviour is preserved one-for-one with the previous inline switch cases.
 * The re-entrant aliases call back into the parent dispatcher via the
 * provided `executeTool` callback so the existing observability and
 * canonical-receipt wrapping on the target tool keep firing unchanged.
 */

import type { AccountService } from './account.service';
import type { KloelWalletSalesToolsService } from './kloel-wallet-sales-tools.service';
import type { UnknownRecord } from '../common/types';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

/**
 * Tool names handled by {@link dispatchAccountTool}. Mirrors the case
 * labels that previously lived in the dispatcher switch.
 */
export const ACCOUNT_TOOL_NAMES = new Set<string>([
  'update_personal_data',
  'account.update_personal',
  'account.update_fiscal',
  'account.upload_document',
  'sales.list',
]);

export function isAccountTool(toolName: string): boolean {
  return ACCOUNT_TOOL_NAMES.has(toolName);
}

/** Dependencies required by the account dispatcher. */
export interface AccountToolDeps {
  accountService: AccountService | undefined;
  walletSalesTools: KloelWalletSalesToolsService | undefined;
  executeTool: (
    workspaceId: string,
    toolName: string,
    args: UnknownRecord,
    userId?: string,
  ) => Promise<ToolResult>;
  userId?: string | undefined;
}

/**
 * Dispatch an account-domain tool. Returns `null` when the tool name is
 * not part of the account / sales.list domain so the caller can fall
 * through to the dispatcher's main switch.
 */
export async function dispatchAccountTool(
  deps: AccountToolDeps,
  workspaceId: string,
  toolName: string,
  args: UnknownRecord,
): Promise<ToolResult | null> {
  const asToolArgs = <T>(value: UnknownRecord): T => value as T;
  const { accountService, walletSalesTools, executeTool, userId } = deps;

  switch (toolName) {
    case 'update_personal_data':
      if (!accountService) {
        return { success: false, error: 'account_service_unavailable' };
      }
      return await accountService.updatePersonalData(workspaceId, asToolArgs(args));
    case 'account.update_personal':
      return executeTool(workspaceId, 'update_personal_data', args, userId);
    case 'account.update_fiscal':
      return executeTool(workspaceId, 'update_fiscal_data', args, userId);
    case 'account.upload_document':
      return executeTool(workspaceId, 'upload_document', args, userId);
    case 'sales.list':
      if (walletSalesTools) {
        return await walletSalesTools.executeTool('list_orders', workspaceId, asToolArgs(args));
      }
      return { success: false, error: 'wallet_sales_tools_not_available' };
    default:
      return null;
  }
}
