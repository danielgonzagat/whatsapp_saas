/**
 * Intent Router pure parser primitives.
 *
 * Small extractor utilities and the IntentPattern shape used by the pattern
 * catalogue. Kept separate from the (large) pattern table so each piece can be
 * imported in isolation by tests or other call sites.
 *
 * All exports are pure (no DI, no I/O, no Nest decorators).
 */

export interface IntentPattern {
  regex: RegExp;
  capabilityId: string;
  extract: (match: RegExpMatchArray) => Record<string, unknown>;
}

/**
 * Parse the first decimal amount (R$ prefix optional) out of a string.
 *
 * Returns `undefined` when no amount is found or the captured group fails to
 * parse — callers should always treat the return as optional.
 */
export function parseAmount(text: string): number | undefined {
  const raw = text.match(/r?\$?\s*(\d+(?:[.,]\d+)?)/i)?.[1]?.replace(',', '.');
  if (!raw) {
    return undefined;
  }
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Returns `true` when the matched text expresses a deactivation/removal verb. */
export function isDeactivation(text: string): boolean {
  return /desativ[ae]|remov[ae]|tir[ae]/i.test(text);
}

/** Heuristic check for the "credit card payment" carve-out used by classify(). */
export function isCardPaymentMention(text: string): boolean {
  return (
    /\b(?:cart[aã]o|card|cr[eé]dito)\b/i.test(text) &&
    /(?:pagamento|payment|cobran[cç]a|link)/i.test(text)
  );
}
