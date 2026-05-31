/**
 * Pure helpers for the conversational onboarding chat page.
 *
 * Extracted from `page.tsx` to keep the page component focused on rendering
 * and React lifecycle wiring. All exports here MUST stay framework-agnostic
 * (no React, no Next.js router/search-params, no DOM mutation).
 */

export interface OnboardingMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export const ROLE_LABELS: Record<string, string> = {
  subscriber: 'cliente assinante',
  producer: 'produtor',
  affiliate: 'afiliado',
};

/**
 * Normalize an onboarding role value coming from `?role=` query params or
 * `localStorage`. Returns `null` when the value is unknown so the caller can
 * fall back to its default flow.
 */
export function normalizeOnboardingRole(role: string | null): string | null {
  if (!role) {
    return null;
  }
  return Object.prototype.hasOwnProperty.call(ROLE_LABELS, role) ? role : null;
}

/**
 * Resolve the human-readable label for an onboarding role, falling back to
 * the raw role string when no translation exists.
 */
export function getOnboardingRoleLabel(role: string): string {
  return ROLE_LABELS[role] || role;
}

/**
 * Build the PT-BR sentence the user "sends" to seed the AI with their role
 * during the auto-start phase.
 */
export function buildRoleSeedMessage(roleLabel: string): string {
  return `Meu perfil inicial no Kloel é: ${roleLabel}.`;
}

/**
 * SSR-safe UUID generator. Prefers `crypto.randomUUID`, falls back to
 * `getRandomValues` for older runtimes, and finally to a timestamp-only
 * pseudo-id when no crypto API is available (test/jsdom edge cases).
 */
export function safeRandomUUID(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = new Uint8Array(8);
    cryptoApi.getRandomValues(bytes);
    return `_${Date.now().toString(36)}_${Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')}`;
  }
  return `_${Date.now().toString(36)}`;
}

/**
 * Factory for fresh `OnboardingMessage` objects. Kept here so the page
 * component never reaches for `Date`/`uuid` inline.
 */
export function createOnboardingMessage(
  role: OnboardingMessage['role'],
  content: string,
): OnboardingMessage {
  return {
    id: safeRandomUUID(),
    role,
    content,
    timestamp: new Date(),
  };
}

/**
 * Build authorization headers for onboarding fetch calls. Always sets
 * `Content-Type: application/json`; appends `Authorization: Bearer …`
 * only when an access token is present.
 */
export function buildOnboardingHeaders(accessToken: string | null | undefined): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (accessToken) {
    (headers as Record<string, string>).Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

/**
 * Parse one decoded SSE chunk and return the last non-empty `content`
 * field observed. Malformed lines are silently ignored to keep the stream
 * resilient to partial frames.
 *
 * Returns `null` when no `content` was found in the chunk so the caller
 * can keep the previously-accumulated message.
 */
export function extractSseContent(chunk: string): string | null {
  let latest: string | null = null;
  const lines = chunk.split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) {
      continue;
    }
    try {
      const data = JSON.parse(line.slice(6)) as { content?: unknown };
      if (typeof data.content === 'string') {
        latest = data.content;
      }
    } catch {
      // Ignore malformed SSE frames — stream remains usable.
    }
  }
  return latest;
}

/**
 * Build the `callbackUrl` for the login redirect surfaced by the public
 * hero. Mirrors the legacy inline encoding so deep-links keep working.
 */
export function buildOnboardingLoginUrl(queryRole: string | null): string {
  const callback = queryRole
    ? `/onboarding-chat?role=${encodeURIComponent(queryRole)}`
    : '/onboarding-chat';
  return `/login?callbackUrl=${encodeURIComponent(callback)}`;
}

/**
 * Format a chat-bubble timestamp in pt-BR `HH:MM` form. Pure wrapper so the
 * page never calls `toLocaleTimeString` inline.
 */
export function formatMessageTimestamp(value: Date): string {
  return value.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * SWR mutate matcher — true for any key under `/onboarding`. Exposed so
 * the page can pass it directly to `mutate(...)` without inline closures.
 */
export function isOnboardingSwrKey(key: unknown): boolean {
  return typeof key === 'string' && key.startsWith('/onboarding');
}
