import type { ToolResult } from './kloel-chat-tools.agent-runtime.helpers';

/**
 * Pure helpers extracted from KloelChatToolsService. All functions in this
 * module are side-effect-free and dependency-free: they only coerce input or
 * synthesize a ToolResult message. Stateful tool delegations stay in the
 * service. (Wave 109 Claude-FF decomposition.)
 */

/**
 * Coerces unknown wallet balance values (bigint | number) into integer cents.
 * Returns 0 for non-numeric/missing values. Exported so peer kloel services
 * (crm/executor/...) consume the same coercion without local copies.
 */
export function centsFromUnknown(value: unknown): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return 0;
}

/**
 * Builds a stable "blocked" ToolResult for chat tools that require a
 * downstream service that is not yet wired (PixelService, ShippingService,
 * CheckoutService, ...). Returns the message in Portuguese to match runtime
 * conventions of the AI chat layer.
 */
export function buildBlockedConfigurationTool(
  toolName: string,
  error: string,
  requiredPath: string,
): ToolResult {
  return {
    success: false,
    error,
    message: `${toolName} exige ${requiredPath} antes de poder declarar configuracao feita.`,
  };
}

/**
 * Resolves the blocking ToolResult for upload_plan_image when no concrete
 * PlanImageService/MediaService is wired. Returns either:
 *  - image_url_required (no imageUrl in args)
 *  - missing identifier (no planName/productName)
 *  - plan_image_service_required (final block when args are valid but the
 *    downstream service is missing).
 * Pure: never touches prisma/services.
 */
export function buildUploadPlanImageBlocker(args: Record<string, unknown>): ToolResult {
  const planName = typeof args.planName === 'string' ? args.planName : '';
  const productName = typeof args.productName === 'string' ? args.productName : '';
  const imageUrl = typeof args.imageUrl === 'string' ? args.imageUrl : '';
  if (!imageUrl) {
    return {
      success: false,
      error: 'image_url_required',
      message:
        'Envie a URL da foto do plano ou faça upload pelo chat. Ex: "foto do plano X url: https://..."',
    };
  }
  if (!planName && !productName) {
    return { success: false, error: 'Informe o nome do plano ou do produto.' };
  }
  return {
    success: false,
    error: 'plan_image_service_required',
    message:
      'upload_plan_image exige PlanImageService ou MediaService.attachPlanImage antes de declarar foto do plano atualizada.',
  };
}

/** ToolResult returned by toolCreateFlow until FlowsService is wired. */
export function buildCreateFlowBlocker(): ToolResult {
  return {
    success: false,
    error: 'flow_service_required',
    message:
      'create_flow exige FlowsService.create ou service equivalente antes de declarar fluxo criado.',
  };
}

/** ToolResult returned by toolSendChannelMessage until a channel service is wired. */
export function buildSendChannelMessageBlocker(): ToolResult {
  return {
    success: false,
    error: 'channel_service_required',
    message:
      'send_channel_message must execute through a real channel service before it can report delivery.',
  };
}

/**
 * Coerces validate_coupon args from the LLM into a strict shape. Strings are
 * trimmed; non-strings become empty.
 */
export function coerceCouponArgs(args: Record<string, unknown>): { productId: string; code: string } {
  const productId = typeof args.productId === 'string' ? args.productId.trim() : '';
  const code = typeof args.code === 'string' ? args.code.trim() : '';
  return { productId, code };
}

/**
 * Coerces get_analytics args from the LLM into a strict shape. Falls back to
 * `metric: 'overview'` when no usable metric was provided. Returns `period`
 * only when it is a non-empty string.
 */
export function coerceAnalyticsArgs(
  args: Record<string, unknown>,
): { metric: string; period?: string } {
  const metric =
    typeof args.metric === 'string' && args.metric.trim() ? args.metric.trim() : 'overview';
  const period =
    typeof args.period === 'string' && args.period.trim() ? args.period.trim() : undefined;
  return period === undefined ? { metric } : { metric, period };
}

/**
 * Coerces configure_warranty args. Returns `null` when no productName is
 * present (caller should emit the "product reference required" block).
 */
export function coerceWarrantyArgs(
  args: Record<string, unknown>,
): { productName: string; warrantyDays: number } | null {
  const productName = typeof args.productName === 'string' ? args.productName : '';
  if (!productName) {
    return null;
  }
  const warrantyDays = typeof args.warrantyDays === 'number' ? args.warrantyDays : 7;
  return { productName, warrantyDays };
}
