/**
 * LLM-ergonomic error message builder — ported from CodeStruct's editCode error
 * design. Key principles validated by the SWE-Bench ablation (§4.4.1):
 *
 *  1. DO NOT REPEAT THIS COMMAND — explicit anti-retry guard against LLM loops
 *  2. Proactive context: auto-run readCode and show available selectors inline
 *  3. Actionable next-step: tell the agent exactly what to do instead
 *  4. Scored alternatives: show fuzzy-matched candidates with confidence scores
 *
 * Every error follows a tri-segment layout the model reliably parses:
 *   ❌ what went wrong
 *   ⚠️ what NOT to do (anti-retry)
 *   ✅ what TO do instead
 */

import type { FuzzyCandidate } from './fuzzy-match.js';

export interface SelectorErrorContext {
  /** The user-provided selector that failed. */
  selector: string;
  /** The file where resolution was attempted. */
  file: string;
  /** All available symbol selectors in the file (from outline). */
  available: string[];
  /** Fuzzy candidates that passed the minimum score threshold. */
  fuzzyCandidates?: FuzzyCandidate[];
  /** Whether a scoped selector was used (e.g. Class.method). */
  scoped?: boolean;
  /** The language/grammar context. */
  language?: string;
}

export interface EditErrorContext {
  /** The failed operation. */
  operation: string;
  /** The target selector that failed to resolve. */
  selector: string;
  /** The file where the edit was attempted. */
  file: string;
  /** Available selectors (auto-populated from outline). */
  available: string[];
  /** Fuzzy candidates. */
  fuzzyCandidates?: FuzzyCandidate[];
  /** Whether there were any parse errors in the file. */
  hasSyntaxErrors?: boolean;
}

// ──────────────────────── builders ──────────────────────────

/** Build a selector-not-found message. */
export function selectorNotFound(ctx: SelectorErrorContext): string {
  const { selector, file, available, fuzzyCandidates, scoped, language } = ctx;
  const langNote = language ? ` (${language})` : '';

  const lines: string[] = [];

  // ❌ What went wrong
  lines.push(`❌ Selector "${selector}" not found in ${file}${langNote}`);
  lines.push('');

  // ⚠️ Anti-retry guard (CodeStruct's most-cited UX feature)
  lines.push('⚠️  DO NOT REPEAT THIS SAME COMMAND — it will fail again!');
  lines.push('');

  // File structure (auto-run readCode equivalent)
  if (available.length > 0) {
    lines.push(`File structure (from code_outline):`);
    lines.push(`Signatures in ${file} (${available.length} symbols):`);
    for (const s of available.slice(0, 20)) {
      lines.push(`  • ${s}`);
    }
    if (available.length > 20) {
      lines.push(`  … and ${available.length - 20} more`);
    }
    lines.push('');
  } else {
    lines.push(`File structure: no named symbols found in ${file}${langNote}.`);
    lines.push(`Run code_outline on ${file} to see its structure.`);
    lines.push('');
  }

  // Fuzzy candidates (scored alternatives)
  if (fuzzyCandidates && fuzzyCandidates.length > 0) {
    lines.push('Did you mean one of these?');
    for (const c of fuzzyCandidates.slice(0, 5)) {
      lines.push(`  • ${c.selector} (score: ${c.score}, matched by: ${c.tier})`);
    }
    lines.push('');
  }

  // Scoping hint
  if (scoped !== undefined && !scoped && available.some((s) => s.includes('.'))) {
    lines.push('💡 This file has scoped symbols (e.g. ClassName.methodName).');
    lines.push('   Try using a scoped selector like "ClassName.${selector}".');
    lines.push('');
  }

  // ✅ Actionable next step
  lines.push('✅ TO FIX: Use one of the selectors listed above.');
  if (fuzzyCandidates && fuzzyCandidates.length > 0) {
    lines.push(`   Best match: "${fuzzyCandidates[0].selector}" (score: ${fuzzyCandidates[0].score})`);
  }
  lines.push('   Run code_outline on the file first to see all available selectors.');

  return lines.join('\n');
}

/** Build an ambiguous-selector message. */
export function ambiguousSelector(
  selector: string,
  file: string,
  matches: Array<{ selector: string; startLine: number; kind?: string }>,
  language?: string,
): string {
  const langNote = language ? ` (${language})` : '';
  const lines: string[] = [];

  lines.push(`❌ Ambiguous selector "${selector}" in ${file}${langNote}`);
  lines.push('');
  lines.push(`⚠️  DO NOT REPEAT THIS SAME COMMAND — it will fail again!`);
  lines.push('');

  lines.push(`${matches.length} matches found:`);
  for (const m of matches) {
    lines.push(`  • ${m.selector} @ line ${m.startLine}${m.kind ? ` (${m.kind})` : ''}`);
  }
  lines.push('');

  lines.push('✅ TO FIX: Use a more specific scoped selector. For example:');
  if (matches.length >= 1 && matches[0].selector.includes('.')) {
    lines.push(`   Use the full scoped selector: "${matches[0].selector}"`);
  }
  lines.push('   Run code_outline on the file to see the full scoped names.');
  lines.push('   If you need to disambiguate between overloads, use the line number.');

  return lines.join('\n');
}

/** Build an edit-failed message with inline diagnostic context. */
export function editFailed(ctx: EditErrorContext): string {
  const { operation, selector, file, available, fuzzyCandidates, hasSyntaxErrors } = ctx;
  const lines: string[] = [];

  lines.push(`❌ Failed to ${operation} "${selector}" in ${file}`);
  lines.push('');

  if (hasSyntaxErrors) {
    lines.push('⚠️  The file has pre-existing syntax errors. Fix them before editing.');
    lines.push('    A parse error means symbols cannot be resolved reliably.');
    lines.push('');
  }

  lines.push('⚠️  DO NOT REPEAT THIS SAME COMMAND — it will fail again!');
  lines.push('');

  if (available.length > 0) {
    lines.push(`Available symbols in ${file} (${available.length} total):`);
    for (const s of available.slice(0, 15)) {
      lines.push(`  • ${s}`);
    }
    if (available.length > 15) lines.push(`  … and ${available.length - 15} more`);
    lines.push('');
  }

  if (fuzzyCandidates && fuzzyCandidates.length > 0) {
    lines.push('Did you mean?');
    for (const c of fuzzyCandidates.slice(0, 5)) {
      lines.push(`  • ${c.selector} (score: ${c.score}, ${c.tier})`);
    }
    lines.push('');
  }

  lines.push('✅ TO FIX:');
  if (fuzzyCandidates && fuzzyCandidates.length > 0) {
    lines.push(`   1. Use the closest match: "${fuzzyCandidates[0].selector}"`);
  }
  lines.push('   2. Run code_outline on the file to verify symbol names');
  lines.push('   3. Use the exact selector from the outline output');

  return lines.join('\n');
}

/**
 * Format available symbols compactly — CodeStruct's signature format
 * re-implemented here: one line per symbol with kind and line number.
 */
export function formatAvailableCompact(symbols: Array<{ selector: string; kind: string; startLine: number }>): string {
  if (symbols.length === 0) return '(none)';
  return symbols
    .map((s) => `L${s.startLine}: ${s.selector} (${s.kind})`)
    .join('\n');
}
