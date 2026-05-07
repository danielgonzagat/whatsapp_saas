import type { ConsistencyResult } from './types';

/**
 * Deterministically serialise an arbitrary value for human-readable display.
 *
 * Unlike `JSON.stringify`, this walks the value structurally and sorts object
 * keys so the rendered representation is stable regardless of property
 * insertion order. Cycles are collapsed to `"[Circular]"`. The result is for
 * display only — not a key-derivation function.
 */
function formatValueForDisplay(value: unknown, seen: WeakSet<object> = new WeakSet()): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  const valueType = typeof value;
  if (valueType === 'string') {
    const escaped = (value as string).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  if (valueType === 'number' || valueType === 'boolean' || valueType === 'bigint') {
    return String(value);
  }
  if (valueType !== 'object') return String(value);

  const obj = value as object;
  if (seen.has(obj)) return '"[Circular]"';
  seen.add(obj);

  if (Array.isArray(obj)) {
    return `[${obj.map((entry) => formatValueForDisplay(entry, seen)).join(',')}]`;
  }
  const entries = Object.entries(obj as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const body = entries
    .map(([key, entryValue]) => `"${key}":${formatValueForDisplay(entryValue, seen)}`)
    .join(',');
  return `{${body}}`;
}

/** Format a ConsistencyResult for human-readable console output. */
export function formatConsistencyResult(result: ConsistencyResult): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('=== PULSE Cross-Artifact Consistency Check ===');

  if (result.missingArtifacts.length > 0) {
    lines.push('');
    lines.push(`Missing artifacts (${result.missingArtifacts.length}):`);
    for (const a of result.missingArtifacts) {
      lines.push(`  - ${a}`);
    }
  }

  if (result.pass) {
    lines.push('');
    lines.push('PASS: All loaded artifacts are consistent.');
  } else {
    lines.push('');
    lines.push(`FAIL: ${result.divergences.length} divergence(s) found:`);
    for (const d of result.divergences) {
      lines.push('');
      lines.push(`  Field: ${d.field}`);
      for (const src of d.sources) {
        lines.push(`    ${src}: ${formatValueForDisplay(d.values[src])}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}
