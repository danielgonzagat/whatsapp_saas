/**
 * Auditability-without-code layer — the thesis apex.
 *
 * The point is not just "edit atomically"; it is that a NON-TECHNICAL
 * operator can audit an edit WITHOUT reading code. Every mutating op carries
 * a founder-facing block so trust is granted at the smallest honest point.
 *
 * Hard honesty rule (this is what kills fachada): a code-edit tool can prove
 * STRUCTURE (grammar/balance didn't regress) and SCOPE (which exact bytes,
 * which single file). It CANNOT prove product behavior — only running the
 * product can. So zeroCodeTrust is CEILINGED here and the ceiling reason is
 * stated. The tool never claims "behavior proven". Claiming it would be the
 * exact fake-completion the operator's own rules forbid.
 */

export type PromiseClass =
  | 'structurally-validated' // TS/JS/JSON grammar verified non-regressed
  | 'balance-validated' // non-TS: delimiter/string balance non-regressed
  | 'unvalidated-text'; // prose/unknown: no structural guarantee

export interface FounderBlock {
  /** Plain-language, no jargon. */
  whatChanged: string;
  whatPreserved: string;
  howToValidate: string;
  /** What this tool did NOT and CANNOT prove (anti-fachada honesty). */
  notProven: string;
  /** Single-file scope statement: everything else is provably untouched. */
  nonTouched: string;
  promiseClass: PromiseClass;
  /**
   * 0–100 per the operator's own scale (100 = validate by product alone;
   * 50 = must look at a (now atomic) diff; lower = must read errors/code).
   * A pure structural tool edit is CEILINGED — see `trustCeilingReason`.
   */
  zeroCodeTrust: number;
  trustCeilingReason: string;
}

function classify(language: string, before: number, after: number): PromiseClass {
  if (after > before) return 'unvalidated-text'; // regressed (caller refuses anyway)
  if (language === 'ts' || language === 'json') return 'structurally-validated';
  if (language === 'structural') return 'balance-validated';
  return 'unvalidated-text';
}

/**
 * Build the founder block from data every mutation already has. No I/O, no
 * model call — deterministic, cheap, always present.
 */
export function buildFounderBlock(args: {
  file: string;
  operator: string;
  language: string;
  syntaxBefore: number;
  syntaxAfter: number;
  changedChars: number;
  expansionFactor: number;
}): FounderBlock {
  const promiseClass = classify(args.language, args.syntaxBefore, args.syntaxAfter);

  // Honest trust scoring. The tool gives SCOPE proof (exact bytes, one file,
  // shown as an atomic char-diff) + STRUCTURE proof (no grammar regression).
  // That removes "read the whole file" but NOT "see the change" → ~50 on the
  // operator's scale, +10 when grammar (not just balance) is verified. It
  // can never reach the 75/100 tiers from here — those require the product
  // behavior to be exercised, which is outside any edit tool.
  let zeroCodeTrust = 50;
  if (promiseClass === 'structurally-validated') zeroCodeTrust = 60;
  else if (promiseClass === 'balance-validated') zeroCodeTrust = 50;
  else zeroCodeTrust = 30;

  const trustCeilingReason =
    'ceiling < 75: an edit tool proves structure + exact scope, not product ' +
    'behavior. Reaching 75 (validate by explanation) or 100 (validate by the ' +
    'product) requires running the changed flow — do that in the app, not here.';

  return {
    whatChanged:
      `Operation \`${args.operator}\` changed ~${args.changedChars} character(s) in ` +
      `\`${args.file}\` (sub-line atomic edit, expansion ${args.expansionFactor}× — it did ` +
      `not rewrite surrounding code).`,
    whatPreserved:
      `Everything outside the highlighted [-removed-]{+added+} span in that one file ` +
      `is byte-identical. No other file was touched by this operation.`,
    howToValidate:
      `Read the atomicDiff above — it shows EXACTLY the changed characters, nothing ` +
      `else. Then exercise the affected behavior in the running product to confirm intent.`,
    notProven:
      `Runtime/product behavior is NOT proven by this tool. Structural validity ≠ ` +
      `correct behavior. Prove behavior by running the flow in the app.`,
    nonTouched:
      `Single-file, single-span: auth, payments, database, protected files, and every ` +
      `other source file are provably untouched by this operation.`,
    promiseClass,
    zeroCodeTrust,
    trustCeilingReason,
  };
}
