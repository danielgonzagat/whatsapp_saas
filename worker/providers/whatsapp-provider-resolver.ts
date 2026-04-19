/**
 * Worker WhatsApp provider resolver — ADR 0001 §D7.
 *
 * Before P2-4 the worker hardcoded "meta-cloud" in 6 different files,
 * ignoring whatever WHATSAPP_PROVIDER_DEFAULT the backend was using.
 * That created a split-brain: a workspace configured for WAHA in the
 * backend (via WHATSAPP_PROVIDER_DEFAULT=whatsapp-api) would still
 * receive autopilot/campaign/flow messages from the worker via Meta
 * Cloud, breaking provider consistency.
 *
 * After P2-4 every worker code path that needs the provider name
 * resolves it through this module, reusing the SAME normalization
 * and precedence rules that the backend applies.
 *
 * **Known gap**: this helper unifies *routing* (the resolved provider
 * name) but not *transport*. The worker currently has no WahaProvider
 * implementation at worker/providers/whatsapp-api-provider.ts; only
 * the Meta Cloud client exists. So even with WHATSAPP_PROVIDER_DEFAULT=whatsapp-api,
 * the worker will still try to send via Meta Cloud and fail. The
 * follow-up to add a worker-side WahaProvider is tracked in the
 * Big Tech hardening plan's deferred section.
 */

export type WhatsAppProvider = 'meta-cloud' | 'whatsapp-api';

function normalizeProviderToken(value: unknown): string {
  return (
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : ''
  )
    .trim()
    .toLowerCase();
}

export function normalizeWhatsAppProvider(value: unknown): WhatsAppProvider | null {
  const normalized = normalizeProviderToken(value);

  if (!normalized) {
    return null;
  }

  if (
    normalized === 'whatsapp-api' ||
    normalized === 'waha' ||
    normalized === 'whatsapp-web-agent'
  ) {
    return 'whatsapp-api';
  }

  if (normalized === 'meta-cloud' || normalized === 'meta') {
    return 'meta-cloud';
  }

  return null;
}

/**
 * Read WHATSAPP_PROVIDER_DEFAULT from the environment and return the
 * normalized provider name. Defaults to 'meta-cloud'.
 *
 * Mirrors the precedence in
 * backend/src/whatsapp/providers/provider-registry.ts:46-51.
 */
export function getWhatsAppProviderFromEnv(): WhatsAppProvider {
  return normalizeWhatsAppProvider(process.env.WHATSAPP_PROVIDER_DEFAULT) || 'meta-cloud';
}

/**
 * Resolve the effective worker provider with the same precedence the backend
 * uses for workspace-specific overrides: explicit workspace token first,
 * environment default second.
 */
export function resolveWhatsAppProvider(value: unknown): WhatsAppProvider {
  return normalizeWhatsAppProvider(value) || getWhatsAppProviderFromEnv();
}
