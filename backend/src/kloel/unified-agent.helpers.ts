/**
 * Pure helpers extracted from UnifiedAgentService (Wave 79).
 *
 * Side-effect free — no Prisma, no HTTP, no logger. Suitable for in-process
 * unit testing without dependency injection.
 */

export const UNIFIED_AGENT_PROVIDER_CONFIG_REQUIRED =
  'Primary LLM configuration is required for unified agent generation';

/**
 * Decide whether a given tool name is allowed by the caller's allowlist.
 *
 * `undefined` allowlist means "no restriction" (all tools allowed).
 * Empty array means "no tools allowed".
 */
export function isAllowedTool(toolName: string, allowedTools?: string[]): boolean {
  return !allowedTools || allowedTools.includes(toolName);
}

/**
 * Deterministically serialize an unknown value into a compact prompt string.
 *
 * Used to feed JSON-ish context into LLM prompts so prompt caching produces a
 * stable key regardless of input object key ordering. Object keys are sorted
 * alphabetically; arrays preserve their order; strings are double-quoted and
 * properly escaped.
 */
export function formatPromptValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(formatPromptValue).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${key}:${formatPromptValue(record[key])}`)
      .join(',')}}`;
  }
  if (typeof value === 'string') {
    return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'undefined') {
    return 'undefined';
  }
  return Object.prototype.toString.call(value);
}

/**
 * Detect whether a tool/action result indicates success.
 *
 * Accepts the common success-signal shapes used across KLOEL tool handlers:
 * `{ success: true }`, `{ ok: true }`, or `{ executed: true }`.
 *
 * Non-records (null, primitives, undefined) return `false`.
 */
export function actionSucceeded(result: unknown): boolean {
  return (
    typeof result === 'object' &&
    result !== null &&
    ((result as Record<string, unknown>).success === true ||
      (result as Record<string, unknown>).ok === true ||
      (result as Record<string, unknown>).executed === true)
  );
}
