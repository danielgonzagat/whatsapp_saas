import { safeStr } from '../../common/string';

/** Resolved whats app provider type. */
export type ResolvedWhatsAppProvider = 'meta-cloud' | 'whatsapp-api';

function normalizeProviderToken(value: unknown): string {
  return safeStr(value).trim().toLowerCase();
}

/** Normalize whats app provider. */
export function normalizeWhatsAppProvider(value: unknown): ResolvedWhatsAppProvider | null {
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

/** Resolve default whats app provider. */
export function resolveDefaultWhatsAppProvider(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedWhatsAppProvider {
  const explicit = normalizeWhatsAppProvider(env.WHATSAPP_PROVIDER_DEFAULT);
  if (explicit) {
    return explicit;
  }

  return 'meta-cloud';
}

/** Resolve whats app provider. */
export function resolveWhatsAppProvider(
  value: unknown,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedWhatsAppProvider {
  return normalizeWhatsAppProvider(value) || resolveDefaultWhatsAppProvider(env);
}
