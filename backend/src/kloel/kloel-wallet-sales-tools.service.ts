// Placeholder — concurrent-agent iterations of this service referenced
// `KloelSale.leadName` (the schema uses `leadPhone` + `productName` and
// links to a Lead via `leadId`). Until the migration adds those columns
// — if it ever does — this is a no-op stub. The dispatcher falls back
// to the `wallet_sales_tools_not_available` reply already wired in
// `kloel-tool-dispatcher.service.ts`.
import { Injectable } from '@nestjs/common';

export interface WalletSalesToolResult {
  [key: string]: unknown;
  success: boolean;
  message?: string;
  error?: string;
}

@Injectable()
export class KloelWalletSalesToolsService {
  executeTool(
    _toolName: string,
    _workspaceId: string,
    _args: Record<string, unknown>,
  ): Promise<WalletSalesToolResult> {
    return Promise.resolve({ success: false, error: 'tool_not_implemented' });
  }
}
