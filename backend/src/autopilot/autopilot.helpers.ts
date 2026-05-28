/**
 * @cluster whatsapp_saas/backend/autopilot
 * Pure helpers extracted from {@link AutopilotService}.
 *
 * These helpers are deliberately Prisma/DI free — they accept plain record
 * shapes so they can be unit-tested in isolation, kept under a single
 * responsibility, and reused without dragging in NestJS DI.
 *
 * Behavior preserved 1:1 with the original inline implementation. Every
 * extraction here was a direct cut/paste of a pure block — no business-logic
 * tweaks, no key renames.
 */

/** Coerce an unknown value into a plain record (object) or empty record. */
export function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/** Returns `true` when the workspace's providerSettings.billingSuspended === true. */
export function isBillingSuspended(settings: Record<string, unknown>): boolean {
  return (settings?.billingSuspended ?? false) === true;
}

/**
 * Extracts the WhatsApp API session status from providerSettings. Returns
 * `'connected'` only when the nested flag is exactly that string.
 */
export function getWhatsAppApiStatus(settings: Record<string, unknown>): string | undefined {
  const session = readRecord(settings?.whatsappApiSession);
  return typeof session.status === 'string' ? session.status : undefined;
}

/** True when the WhatsApp API session is currently `connected`. */
export function isWhatsAppConnected(settings: Record<string, unknown>): boolean {
  return getWhatsAppApiStatus(settings) === 'connected';
}

/**
 * Build the `autonomy` block patch for {@link AutopilotService.toggleAutopilot}.
 * Pure: caller is responsible for supplying the timestamp so tests can pin it.
 */
export function buildAutonomyPatch(
  prev: Record<string, unknown>,
  enabled: boolean,
  nowIso: string,
): Record<string, unknown> {
  return {
    ...prev,
    mode: enabled ? 'LIVE' : 'OFF',
    reactiveEnabled: enabled,
    proactiveEnabled: false,
    reason: enabled ? 'manual_toggle_on' : 'manual_toggle_off',
    lastTransitionAt: nowIso,
  };
}

/** Build the merged `autopilot` config block for toggleAutopilot. */
export function buildAutopilotEnabledPatch(
  prev: Record<string, unknown>,
  enabled: boolean,
): Record<string, unknown> {
  return { ...prev, enabled };
}

/**
 * Apply an optional patch payload onto the previous autopilot config.
 * `undefined` values mean "do not touch"; explicit `null` clears the field.
 */
export function applyAutopilotConfigPatch(
  prev: Record<string, unknown>,
  payload: {
    conversionFlowId?: string | null;
    currencyDefault?: string;
    recoveryTemplateName?: string | null;
  },
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...prev };
  if (payload.conversionFlowId !== undefined) {
    next.conversionFlowId = payload.conversionFlowId;
  }
  if (payload.currencyDefault) {
    next.currencyDefault = payload.currencyDefault;
  }
  if (payload.recoveryTemplateName !== undefined) {
    next.recoveryTemplateName = payload.recoveryTemplateName;
  }
  return next;
}

/**
 * Decide whether autopilot is currently "enabled" from providerSettings.
 * Mirrors {@link AutopilotService.getStatus}: any LIVE/BACKLOG/FULL autonomy
 * mode OR a legacy `autopilot.enabled === true` flag.
 */
export function computeStatusEnabled(settings: Record<string, unknown>): boolean {
  const rawAutonomyMode = readRecord(settings?.autonomy).mode;
  const autonomyMode = (typeof rawAutonomyMode === 'string' ? rawAutonomyMode : '').toUpperCase();
  const legacyAutopilotEnabled = !!readRecord(settings?.autopilot).enabled;
  return (
    autonomyMode === 'LIVE' ||
    autonomyMode === 'BACKLOG' ||
    autonomyMode === 'FULL' ||
    legacyAutopilotEnabled
  );
}

/**
 * Resolve the configured post-purchase flowId from providerSettings.autopilot.
 * Returns the raw value unchanged so callers can apply their own truthy/string
 * checks (mirrors the original inline `readRecord(settings.autopilot).postPurchaseFlowId`).
 */
export function getPostPurchaseFlowId(settings: Record<string, unknown>): unknown {
  return readRecord(settings?.autopilot).postPurchaseFlowId;
}

/**
 * Best-effort log label for a flow identifier. Mirrors the original
 * `typeof flowId === 'string' ? flowId : 'unknown'` pattern.
 */
export function coerceFlowIdLabel(value: unknown): string {
  return typeof value === 'string' ? value : 'unknown';
}

/**
 * Compose the default thank-you message dispatched when no post-purchase
 * flow is configured. Pure: only depends on the (optional) product name.
 */
export function buildPostPurchaseMessage(productName?: string): string {
  return productName
    ? `Obrigado pela sua compra de *${productName}*. Seu acesso e os próximos passos seguem pelo canal cadastrado.`
    : `Obrigado pela sua compra. Seu acesso e os próximos passos seguem pelo canal cadastrado.`;
}
