import type { UnknownRecord } from '../common/types';

/**
 * Pure helpers extracted from {@link UnifiedAgentActionsCrmService}'s
 * `actionConnectWhatsApp` and `actionLogEvent` flows. Each function is free of
 * Prisma/DI side effects so the decision logic can be unit-tested in isolation.
 */

/**
 * PT-BR copy returned to the chat surface when the agent invites the user to
 * finish the WhatsApp authorization manually. Kept as a single source of truth
 * so the message stays consistent across success/error paths.
 */
export const WHATSAPP_MANUAL_CONNECT_HINT =
  'Tente novamente ou acesse /whatsapp para conectar manualmente';

/**
 * PT-BR copy returned after a successful Meta OAuth session creation, when the
 * provider did not echo a custom message. Mirrors the fallback that used to
 * live inline inside `actionConnectWhatsApp`.
 */
export const WHATSAPP_META_OAUTH_START_MESSAGE = 'Conexão oficial com a Meta iniciada.';

/**
 * PT-BR copy returned when the workspace is already connected and the agent
 * short-circuits the reconnection request as a deduplication.
 */
export const WHATSAPP_ALREADY_CONNECTED_MESSAGE = 'WhatsApp já está conectado.';

/**
 * PT-BR next-step nudge layered on top of the Meta OAuth start response.
 */
export const WHATSAPP_NEXT_STEP_AUTHORIZE =
  'Conclua a autorização oficial da Meta para ativar o canal.';

/**
 * Connection status flag flipped on the workspace `providerSettings` while the
 * Meta OAuth handshake is in flight.
 */
export const WHATSAPP_CONNECTION_STATUS_CONNECTING = 'connecting';

/**
 * Connection status flag set once the workspace is fully wired to a provider.
 */
export const WHATSAPP_CONNECTION_STATUS_CONNECTED = 'connected';

/**
 * Default WhatsApp provider key issued when the agent autonomously triggers
 * `actionConnectWhatsApp`. Kept as a constant so the value can be reused by
 * downstream tests / call sites without hardcoding the literal.
 */
export const WHATSAPP_DEFAULT_PROVIDER = 'meta-cloud';

/**
 * Prisma error code emitted when an INSERT/UPDATE violates a foreign-key
 * constraint. The CRM action service swallows this specific error when logging
 * an `autopilotEvent` because the contact row may have been pruned between the
 * tool dispatch and the audit write.
 */
export const PRISMA_FOREIGN_KEY_VIOLATION_CODE = 'P2003';

/**
 * True when the current process is running under Jest. Used by `actionLogEvent`
 * to suppress non-fatal Prisma warnings inside the test runner. Accepts an
 * explicit env so the helper stays pure under unit tests.
 */
export function isJestTestEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.JEST_WORKER_ID || env.NODE_ENV === 'test';
}

/**
 * Narrow an unknown thrown value to one carrying the Prisma foreign-key
 * violation code (`P2003`). Mirrors the inline `(err as { code?: string }).code`
 * cast that lived inside `actionLogEvent`.
 */
export function isPrismaForeignKeyError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === PRISMA_FOREIGN_KEY_VIOLATION_CODE;
}

/**
 * Categorize an `actionLogEvent` failure into the three outcomes the service
 * has to handle:
 *
 * - `'silent'` — running inside Jest; suppress the warn entirely.
 * - `'debug'` — Prisma FK violation (contact pruned mid-flight); log at debug.
 * - `'warn'` — anything else; log at warn with the surfaced message.
 */
export function classifyLogEventError(
  error: unknown,
  env: NodeJS.ProcessEnv = process.env,
): 'silent' | 'debug' | 'warn' {
  if (isJestTestEnv(env)) {
    return 'silent';
  }
  if (isPrismaForeignKeyError(error)) {
    return 'debug';
  }
  return 'warn';
}

/**
 * Pure dedupe check used by `actionConnectWhatsApp`: returns true when the
 * workspace `providerSettings` already point at the same provider with a
 * `'connected'` status, so the action can short-circuit instead of
 * re-initiating the Meta OAuth handshake.
 */
export function isWhatsAppAlreadyConnected(
  providerSettings: UnknownRecord | null | undefined,
  provider: string,
): boolean {
  if (!providerSettings) {
    return false;
  }
  return (
    providerSettings.whatsappProvider === provider &&
    providerSettings.connectionStatus === WHATSAPP_CONNECTION_STATUS_CONNECTED
  );
}

/**
 * Build the `providerSettings` JSON patch written in the
 * `actionConnectWhatsApp` transaction. Merges the existing settings (so the
 * workspace keeps unrelated keys like channel routing or AI config) with the
 * provider key, the `connecting` status, and the ISO-8601 initiation
 * timestamp.
 *
 * Accepts the `now` argument so tests can pin the timestamp.
 */
export function buildConnectingProviderSettings(
  current: UnknownRecord | null | undefined,
  provider: string,
  now: Date = new Date(),
) {
  return {
    ...(current ?? {}),
    whatsappProvider: provider,
    connectionStatus: WHATSAPP_CONNECTION_STATUS_CONNECTING,
    connectionInitiatedAt: now.toISOString(),
  };
}

/**
 * Build the success-path response payload returned by `actionConnectWhatsApp`
 * when the provider session creation succeeds. Kept here so the shape stays
 * stable across the legacy/test paths.
 */
export function buildWhatsAppConnectSuccessResponse(input: {
  sessionSuccess: boolean;
  sessionMessage?: string | null | undefined;
  authUrl?: string | null | undefined;
  workspaceId: string;
  provider: string;
}) {
  return {
    success: input.sessionSuccess,
    message: input.sessionMessage || WHATSAPP_META_OAUTH_START_MESSAGE,
    sessionId: input.workspaceId,
    provider: input.provider,
    authUrl: input.authUrl ?? undefined,
    nextStep: WHATSAPP_NEXT_STEP_AUTHORIZE,
  };
}

/**
 * Build the dedupe-path response payload returned by `actionConnectWhatsApp`
 * when the workspace is already connected. Mirrors the inline literal that
 * lived in the service.
 */
export function buildWhatsAppAlreadyConnectedResponse(workspaceId: string, provider: string) {
  return {
    success: true as const,
    message: WHATSAPP_ALREADY_CONNECTED_MESSAGE,
    sessionId: workspaceId,
    provider,
    deduplicated: true as const,
  };
}
