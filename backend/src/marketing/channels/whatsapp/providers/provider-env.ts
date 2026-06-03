import { safeStr } from '../../../../common/string';

/** Resolved WhatsApp provider type: official Meta Cloud API only. */
export type ResolvedWhatsAppProvider = 'meta-cloud';

function normalizeProviderToken(value: unknown): string {
  return safeStr(value).trim().toLowerCase();
}

/** Normalize WhatsApp provider. Legacy browser/API providers are no longer accepted. */
export function normalizeWhatsAppProvider(value: unknown): ResolvedWhatsAppProvider | null {
  const normalized = normalizeProviderToken(value);

  if (normalized === 'meta-cloud' || normalized === 'meta' || normalized === 'meta-official') {
    return 'meta-cloud';
  }

  return null;
}

/** Resolve default WhatsApp provider. */
export function resolveDefaultWhatsAppProvider(
  _env: NodeJS.ProcessEnv = process.env,
): ResolvedWhatsAppProvider {
  return 'meta-cloud';
}

/** Resolve WhatsApp provider. */
export function resolveWhatsAppProvider(
  value: unknown,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedWhatsAppProvider {
  return normalizeWhatsAppProvider(value) || resolveDefaultWhatsAppProvider(env);
}
