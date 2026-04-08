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
 * calls getWhatsAppProviderFromEnv(), which reads the SAME env var
 * the backend uses (backend/src/whatsapp/providers/provider-registry.ts:46)
 * and applies the same precedence rules.
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

/**
 * Read WHATSAPP_PROVIDER_DEFAULT from the environment and return the
 * normalized provider name. Defaults to 'meta-cloud'.
 *
 * Mirrors the precedence in
 * backend/src/whatsapp/providers/provider-registry.ts:46-51.
 */
export function getWhatsAppProviderFromEnv(): WhatsAppProvider {
  const envDefault = String(process.env.WHATSAPP_PROVIDER_DEFAULT || '')
    .trim()
    .toLowerCase();
  if (envDefault === 'whatsapp-api' || envDefault === 'waha') {
    return 'whatsapp-api';
  }
  return 'meta-cloud';
}
