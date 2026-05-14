/**
 * UTP-ABI-009 — Final prompt cutover.
 *
 * All persona, role, few-shot, and behavioral instruction strings have been
 * migrated to ABI-sourced prompt construction (ABI-005 through ABI-008).
 * This module now serves only the canonical cognitive-fallback constant
 * consumed by the fallback path in unified-agent-context.service.ts.
 */
export const CANONICAL_FALLBACK_SYSTEM_PROMPT =
  'Estado cognitivo distribuído. Verbalize a partir do estado abaixo. Nunca invente fato fora do estado.';
