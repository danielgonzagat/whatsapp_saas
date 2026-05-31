/**
 * Wallet + sales-tool dispatch helpers extracted from
 * KloelToolDispatcherService. Covers the financial/operational surface
 * delegated to {@link KloelWalletSalesToolsService}: wallet balance and
 * statement, orders/sales summaries, abandonments, NPS/churn, refunds
 * (mapped to `list_orders` with status=refunded), and the two transfer
 * intents (withdrawal + anticipation).
 *
 * Behaviour and argument coercion are preserved one-for-one from the
 * previous inline switch.
 */

import type { KloelWalletSalesToolsService } from './kloel-wallet-sales-tools.service';
import type { UnknownRecord } from '../common/types';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

const asToolArgs = <T>(value: UnknownRecord): T => value as T;

/**
 * Tool names handled by {@link dispatchWalletSalesTool}. Mirrors the case
 * labels that previously lived in the dispatcher switch.
 */
export const WALLET_SALES_TOOL_NAMES = new Set<string>([
  'get_wallet_balance',
  'get_wallet_statement',
  'list_orders',
  'get_order_details',
  'get_sales_summary',
  'get_abandonments',
  'request_withdrawal',
  'get_nps',
  'get_churn',
  'list_refunds',
  'request_anticipation',
]);

export function isWalletSalesTool(toolName: string): boolean {
  return WALLET_SALES_TOOL_NAMES.has(toolName);
}

/** Dependencies required by the wallet-sales dispatcher. */
export interface WalletSalesToolDeps {
  walletSalesTools: KloelWalletSalesToolsService | undefined;
}

/**
 * Dispatch a wallet/sales tool. Returns `null` when the tool name is not
 * part of the wallet-sales domain so the caller can fall through.
 */
export async function dispatchWalletSalesTool(
  deps: WalletSalesToolDeps,
  workspaceId: string,
  toolName: string,
  args: UnknownRecord,
): Promise<ToolResult | null> {
  const { walletSalesTools } = deps;

  switch (toolName) {
    case 'get_wallet_balance':
    case 'get_wallet_statement':
    case 'list_orders':
    case 'get_order_details':
    case 'get_sales_summary':
    case 'get_abandonments':
    case 'request_withdrawal':
    case 'get_nps':
    case 'get_churn':
    case 'request_anticipation':
      if (walletSalesTools) {
        return await walletSalesTools.executeTool(toolName, workspaceId, asToolArgs(args));
      }
      return { success: false, error: 'wallet_sales_tools_not_available' };
    case 'list_refunds':
      if (walletSalesTools) {
        return await walletSalesTools.executeTool(
          'list_orders',
          workspaceId,
          asToolArgs({ status: 'refunded' }),
        );
      }
      return { success: false, error: 'wallet_sales_tools_not_available' };
    default:
      return null;
  }
}
