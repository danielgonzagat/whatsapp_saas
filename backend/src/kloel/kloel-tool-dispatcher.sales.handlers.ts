/**
 * Sales payment-creation tool dispatch helpers extracted from
 * KloelToolDispatcherService. Covers the `sales.create_pix`,
 * `sales.create_boleto`, `sales.create_card_link`, `sales.refund` and
 * `sales.cancel_subscription` capabilities — all money-path operations that
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
export const SALES_TOOL_NAMES = new Set<string>([
  'sales.create_pix',
  'sales.create_boleto',
  'sales.create_card_link',
  'sales.refund',
  'sales.cancel_subscription',
]);

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

const CARD_REQUIRED_INPUTS = ['productId', 'planId', 'customerName', 'customerEmail'];

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

const REFUND_REQUIRED_INPUTS = ['saleId'];

const CANCEL_SUBSCRIPTION_REQUIRED_INPUTS = ['subscriptionId'];

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown error';
}

/**
 * Resolve an optional partial-refund amount into safe `bigint` cents.
 *
 * Money is bigint cents — never float. Only a finite, non-negative, integer
 * `amountCents` arg is honoured; anything else (float, negative, NaN, string,
 * absent) yields `undefined` so {@link SalesService.refund} falls back to a
 * full refund of the original sale amount. This never widens or alters an
 * existing amount — it only forwards a validated explicit value.
 */
function resolveRefundAmountCents(value: unknown): bigint | undefined {
  if (typeof value === 'bigint') {
    return value >= 0n ? value : undefined;
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return BigInt(value);
  }
  return undefined;
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

    case 'sales.create_card_link': {
      const startedAt = Date.now();
      const missingInputs = missingStringInputs(args, CARD_REQUIRED_INPUTS);
      if (missingInputs.length > 0) {
        return wrap(
          'sales.create_card_link',
          {
            success: false,
            error: 'sales_create_card_link_inputs_required',
            missingInputs,
            message: `Dados faltantes para gerar link de cartão real: ${missingInputs.join(', ')}`,
          },
          startedAt,
        );
      }
      if (!salesService) {
        return wrap(
          'sales.create_card_link',
          { success: false, error: 'sales_service_unavailable' },
          startedAt,
        );
      }
      try {
        const cardResult = await salesService.createStripeCardLink(
          workspaceId,
          asString(args.productId).trim(),
          asString(args.planId).trim(),
          buyerDataFromArgs(args),
        );
        return wrap(
          'sales.create_card_link',
          {
            success: true,
            capabilityId: 'sales.create_card_link',
            saleId: cardResult.saleId,
            orderId: cardResult.saleId,
            paymentId: cardResult.externalPaymentId,
            externalPaymentId: cardResult.externalPaymentId,
            checkoutSessionId: cardResult.checkoutSessionId,
            checkoutUrl: cardResult.checkoutUrl,
            paymentUrl: cardResult.checkoutUrl,
            message: `Link de cartão gerado: ${cardResult.saleId}`,
          },
          startedAt,
        );
      } catch (cardError: unknown) {
        return wrap(
          'sales.create_card_link',
          { success: false, error: errorMessage(cardError) },
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

    case 'sales.refund': {
      const startedAt = Date.now();
      const missingInputs = missingStringInputs(args, REFUND_REQUIRED_INPUTS);
      if (missingInputs.length > 0) {
        return wrap(
          'sales.refund',
          {
            success: false,
            error: 'sales_refund_inputs_required',
            missingInputs,
            message: `Dados faltantes para estornar a venda: ${missingInputs.join(', ')}`,
          },
          startedAt,
        );
      }
      if (!salesService) {
        return wrap(
          'sales.refund',
          { success: false, error: 'sales_service_unavailable' },
          startedAt,
        );
      }
      try {
        const reason = asString(args.reason).trim() || 'refund solicitado via chat';
        const amountCents = resolveRefundAmountCents(args.amountCents);
        const refundResult = await salesService.refund(workspaceId, asString(args.saleId).trim(), {
          reason,
          ...(amountCents !== undefined ? { amountCents } : {}),
        });
        return wrap(
          'sales.refund',
          {
            success: true,
            capabilityId: 'sales.refund',
            saleId: asString(args.saleId).trim(),
            orderId: asString(args.saleId).trim(),
            refundId: refundResult.refundId,
            status: refundResult.status,
            message: `Estorno ${refundResult.status}: ${refundResult.refundId}`,
          },
          startedAt,
        );
      } catch (refundError: unknown) {
        return wrap(
          'sales.refund',
          { success: false, error: errorMessage(refundError) },
          startedAt,
        );
      }
    }

    case 'sales.cancel_subscription': {
      const startedAt = Date.now();
      const missingInputs = missingStringInputs(args, CANCEL_SUBSCRIPTION_REQUIRED_INPUTS);
      if (missingInputs.length > 0) {
        return wrap(
          'sales.cancel_subscription',
          {
            success: false,
            error: 'sales_cancel_subscription_inputs_required',
            missingInputs,
            message: `Dados faltantes para cancelar a assinatura: ${missingInputs.join(', ')}`,
          },
          startedAt,
        );
      }
      if (!salesService) {
        return wrap(
          'sales.cancel_subscription',
          { success: false, error: 'sales_service_unavailable' },
          startedAt,
        );
      }
      try {
        const cancelResult = await salesService.cancelSubscription(workspaceId, {
          subscriptionId: asString(args.subscriptionId).trim(),
        });
        return wrap(
          'sales.cancel_subscription',
          {
            success: true,
            capabilityId: 'sales.cancel_subscription',
            subscriptionId: cancelResult.subscriptionId,
            status: cancelResult.status,
            message: `Assinatura cancelada: ${cancelResult.subscriptionId}`,
          },
          startedAt,
        );
      } catch (cancelError: unknown) {
        return wrap(
          'sales.cancel_subscription',
          { success: false, error: errorMessage(cancelError) },
          startedAt,
        );
      }
    }

    default:
      return null;
  }
}
