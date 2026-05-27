/** Connection state surfaced by WhatsAppApiProvider responses. */
export type WhatsAppSessionState =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'DEGRADED'
  | 'CONNECTION_INCOMPLETE'
  | null;

/**
 * Returns true when the supplied environment variable name has a non-empty trimmed value.
 * Used to derive the boolean diagnostics flags surfaced by WhatsAppApiProvider.
 */
export function hasEnv(name: string): boolean {
  return Boolean(String(process.env[name] || '').trim());
}

/**
 * Returns true when at least one of the supplied environment variables has a non-empty value.
 * Used for fallbacks where multiple env names map to the same logical capability
 * (e.g. META_VERIFY_TOKEN vs META_WEBHOOK_VERIFY_TOKEN).
 */
export function hasAnyEnv(names: readonly string[]): boolean {
  return names.some((name) => hasEnv(name));
}

/**
 * Maps Meta phone number details into the canonical session-state enum used across the platform.
 * Centralizes the connected → CONNECTED, CONNECTION_INCOMPLETE → CONNECTION_INCOMPLETE,
 * DEGRADED → DEGRADED, otherwise → DISCONNECTED transition.
 */
export function deriveSessionStateFromDetails(details: {
  connected?: boolean;
  status?: string;
}): WhatsAppSessionState {
  if (details.connected) {
    return 'CONNECTED';
  }
  if (details.status === 'CONNECTION_INCOMPLETE') {
    return 'CONNECTION_INCOMPLETE';
  }
  if (details.status === 'DEGRADED') {
    return 'DEGRADED';
  }
  return 'DISCONNECTED';
}

/**
 * Returns the human-readable QR-code message keyed off the connection state.
 * Mirrors the previous inline ternary in WhatsAppApiProvider.getQrCode without changing the
 * public message contract consumed by the frontend.
 */
export function deriveQrCodeMessage(details: {
  connected?: boolean;
  authUrl?: string | null;
}): string {
  if (details.connected) {
    return 'meta_cloud_connected';
  }
  if (details.authUrl) {
    return 'meta_cloud_use_embedded_signup';
  }
  return 'meta_cloud_has_no_qr';
}
