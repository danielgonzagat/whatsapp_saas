/**
 * UTP-ABI-009 — Final prompt cutover.
 *
 * All persona, role, few-shot, and behavioral instruction strings have been
 * migrated to ABI-sourced prompt construction (ABI-005 through ABI-008).
 * This module now serves only the canonical cognitive-fallback constant
 * consumed by the fallback path in unified-agent-context.service.ts.
 */
export const CANONICAL_FALLBACK_SYSTEM_PROMPT =
  'cognitive_state_boundary=distributed; verbalization_source=state_payload; fact_boundary=state_payload';
