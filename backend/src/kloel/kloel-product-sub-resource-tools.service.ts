// Placeholder — concurrent-agent iterations of this service contained
// fields that did not exist in the current Prisma schema (e.g. `quantity`
// on ProductPlanCreateInput, `productId` on CheckoutConfigCreateInput,
// `name` on CheckoutConfig). Until the real schema/migration lands,
// this is a no-op stub so the build stays green and the dispatcher can
// fall back to the `product_sub_resource_tools_not_available` stub
// already wired in `kloel-tool-dispatcher.service.ts`.
//
// Once the migration adds the missing columns, replace this file with
// the real implementation — see PR #379 discussion.
import { Injectable } from '@nestjs/common';

export interface ProductSubResourceToolResult {
  success: false;
  error: 'tool_not_implemented';
}

@Injectable()
export class KloelProductSubResourceToolsService {
  executeTool(
    _toolName: string,
    _workspaceId: string,
    _args: Record<string, unknown>,
  ): Promise<ProductSubResourceToolResult> {
    return Promise.resolve({ success: false, error: 'tool_not_implemented' });
  }
}
