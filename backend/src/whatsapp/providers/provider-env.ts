/** Resolved whats app provider type. */
export type ResolvedWhatsAppProvider = 'meta-cloud' | 'whatsapp-api';

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

/** Is waha runtime configured. */
export function isWahaRuntimeConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(String(env.WAHA_API_URL || env.WAHA_BASE_URL || env.WAHA_URL || '').trim());
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
