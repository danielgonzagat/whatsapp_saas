/**
 * Sales payment-creation tool dispatch helpers extracted from
 * KloelToolDispatcherService. Covers the `sales.create_pix` and
 * `sales.create_boleto` capabilities — both money-path operations that
 * delegate to {@link SalesService} and emit canonical receipts.
 *
 * Behaviour preserved one-for-one from the previous inline switch:
 *   - Required-input validation via {@link missingStringInputs} → returns
 *     `sales_create_{pix|boleto}_inputs_required` with `missingInputs` payload.
 *   - Missing `SalesService` short-circuit → `sales_service_unavailable`.
 *   - try/catch wraps real provider call; on throw the error message is
 *     surfaced unchanged inside a receipt-wrapped failure result.
 *   - Every exit path (validation fail, service missing, success, catch)
 *     flows through {@link buildCanonicalReceipt} so the dispatcher emits a
 *     receipt regardless of outcome.
 *
 * NOTE: this module is money-path critical. Do NOT change error codes, do
 * NOT silently swallow exceptions, do NOT remove the receipt wrapping.
 */

import {
  asString,
  buyerDataFromArgs,
  boletoBuyerDataFromArgs,
  missingStringInputs,
} from './kloel-tool-dispatcher.helpers';
import { buildCanonicalReceipt } from './kloel-tool-dispatcher.receipt.helpers';
import type { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
import type { SalesService } from '../sales/sales.service';
import type { UnknownRecord } from '../common/types';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

/**
 * Tool names handled by {@link dispatchSalesTool}. Mirrors the case labels
 * that previously lived in the dispatcher switch.
 */
export const SALES_TOOL_NAMES = new Set<string>(['sales.create_pix', 'sales.create_boleto']);

export function isSalesTool(toolName: string): boolean {
  return SALES_TOOL_NAMES.has(toolName);
}

/** Dependencies required by the sales create_* dispatcher. */
export interface SalesToolDeps {
  salesService: SalesService | undefined;
  capRegistryV2: CapabilityRegistryV2Service | undefined;
  userId?: string | undefined;
}

const PIX_REQUIRED_INPUTS = ['productId', 'planId', 'customerName', 'customerEmail', 'customerCpf'];

const BOLETO_REQUIRED_INPUTS = [
  'productId',
  'planId',
  'customerName',
  'customerEmail',
  'customerCpf',
  'customerPhone',
  'customerZipCode',
  'customerStreet',
  'customerNumber',
  'customerCity',
  'customerState',
];

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown error';
}

/**
 * Dispatch a sales create_* tool. Returns `null` when the tool name is not
 * part of the sales create_* domain so the caller can fall through.
 */
export async function dispatchSalesTool(
  deps: SalesToolDeps,
  workspaceId: string,
  toolName: string,
  args: UnknownRecord,
): Promise<ToolResult | null> {
  const { salesService, capRegistryV2, userId } = deps;

  const wrap = (capabilityId: string, result: ToolResult, startedAt: number): ToolResult =>
    buildCanonicalReceipt(
      capRegistryV2,
      capabilityId,
      workspaceId,
      args,
      result,
      userId,
      startedAt,
    );

  switch (toolName) {
    case 'sales.create_pix': {
      const startedAt = Date.now();
      const missingInputs = missingStringInputs(args, PIX_REQUIRED_INPUTS);
      if (missingInputs.length > 0) {
        return wrap(
          'sales.create_pix',
          {
            success: false,
            error: 'sales_create_pix_inputs_required',
            missingInputs,
            message: `Dados faltantes para criar PIX real: ${missingInputs.join(', ')}`,
          },
          startedAt,
        );
      }
      if (!salesService) {
        return wrap(
          'sales.create_pix',
          { success: false, error: 'sales_service_unavailable' },
          startedAt,
        );
      }
      try {
        const pixResult = await salesService.createPixOrder(
          workspaceId,
          asString(args.productId).trim(),
          asString(args.planId).trim(),
          buyerDataFromArgs(args),
        );
        return wrap(
          'sales.create_pix',
          {
            success: true,
            capabilityId: 'sales.create_pix',
            saleId: pixResult.saleId,
            orderId: pixResult.saleId,
            paymentId: pixResult.externalPaymentId,
            externalPaymentId: pixResult.externalPaymentId,
            paymentUrl: pixResult.ticketUrl,
            pixCopiaECola: pixResult.pixCopyPaste,
            pixQrCode: pixResult.pixQrCode,
            qrCodeBase64: pixResult.pixQrCodeBase64,
            pixExpiresAt: pixResult.pixExpiresAt,
            message: `PIX gerado: ${pixResult.saleId}`,
          },
          startedAt,
        );
      } catch (pixError: unknown) {
        return wrap(
          'sales.create_pix',
          { success: false, error: errorMessage(pixError) },
          startedAt,
        );
      }
    }

    case 'sales.create_boleto': {
      const startedAt = Date.now();
      const missingInputs = missingStringInputs(args, BOLETO_REQUIRED_INPUTS);
      if (missingInputs.length > 0) {
        return wrap(
          'sales.create_boleto',
          {
            success: false,
            error: 'sales_create_boleto_inputs_required',
            missingInputs,
            message: `Dados faltantes para criar boleto real: ${missingInputs.join(', ')}`,
          },
          startedAt,
        );
      }
      if (!salesService) {
        return wrap(
          'sales.create_boleto',
          { success: false, error: 'sales_service_unavailable' },
          startedAt,
        );
      }
      try {
        const boletoResult = await salesService.createBoletoOrder(
          workspaceId,
          asString(args.productId).trim(),
          asString(args.planId).trim(),
          boletoBuyerDataFromArgs(args),
        );
        return wrap(
          'sales.create_boleto',
          {
            success: true,
            capabilityId: 'sales.create_boleto',
            saleId: boletoResult.saleId,
            orderId: boletoResult.saleId,
            paymentId: boletoResult.externalPaymentId,
            externalPaymentId: boletoResult.externalPaymentId,
            boletoBarcode: boletoResult.boletoBarcode,
            boletoUrl: boletoResult.boletoUrl,
            boletoExpiresAt: boletoResult.boletoExpiresAt,
            message: `Boleto gerado: ${boletoResult.saleId}`,
          },
          startedAt,
        );
      } catch (boletoError: unknown) {
        return wrap(
          'sales.create_boleto',
          { success: false, error: errorMessage(boletoError) },
          startedAt,
        );
      }
    }

    default:
      return null;
  }
}
