import type { ConsistencyResult } from './types';

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
        lines.push(`    ${src}: ${JSON.stringify(d.values[src])}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}
