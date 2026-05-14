/**
 * UTP-ABI-009 — Stub re-exports of {@link ./kloel.prompts}.
 *
 * All persona, guardrail, and few-shot prose previously defined here has been
 * retired. Every export now resolves to the canonical cognitive-fallback
 * constant.  Existing call sites continue to compile while the runtime
 * behaviour is supplied by the ABI-sourced prompt path (ABI-005..008).
 */

import { CANONICAL_FALLBACK_SYSTEM_PROMPT } from './kloel.prompts';

export const KLOEL_PERSONA_CORE = CANONICAL_FALLBACK_SYSTEM_PROMPT;

export const KLOEL_USER_MEMORY_RULES = CANONICAL_FALLBACK_SYSTEM_PROMPT;

export const KLOEL_REALITY_GUARDRAILS = CANONICAL_FALLBACK_SYSTEM_PROMPT;

export const KLOEL_RESPONSE_ENGINE_FEW_SHOT = CANONICAL_FALLBACK_SYSTEM_PROMPT;

export const TONE_DESCRIPTIONS: Record<string, string> = {};

type ObjectionEntry = {
  id?: string;
  label?: string;
  response?: string;
  enabled?: boolean;
};

export function isObjectionEntry(value: unknown): value is ObjectionEntry {
  void value;
  return false;
}

export function trimmedOrDefault(_value: unknown, _fallback: string): string {
  return CANONICAL_FALLBACK_SYSTEM_PROMPT;
}

export function formatJsonSection(_label: string, _value: unknown): string {
  return CANONICAL_FALLBACK_SYSTEM_PROMPT;
}

export function formatObjectionsSection(_objections: unknown): string {
  return CANONICAL_FALLBACK_SYSTEM_PROMPT;
}

export function formatToneSection(_tone: unknown): string {
  return CANONICAL_FALLBACK_SYSTEM_PROMPT;
}

export function formatNumericSection(_label: string, _value: unknown): string {
  return CANONICAL_FALLBACK_SYSTEM_PROMPT;
}
