/**
 * PULSE Parser 59: Performance — Query Profiler (STATIC)
 * Layer 6: Performance Testing
 *
 * STATIC analysis: scans backend service files for unbounded or potentially
 * slow Prisma queries that lack select/include/take constraints.
 *
 * BREAK TYPES:
 *   SLOW_QUERY (medium)      — findMany without select or include (returns all columns)
 *   UNBOUNDED_RESULT (medium) — findMany without take/skip (no pagination, may return all rows)
 */

import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

function readSafe(file: string): string {
  try {
    return readTextFile(file, 'utf8');
  } catch {
    return '';
  }
}

function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

/** Check performance query profiler. */
export function checkPerformanceQueryProfiler(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const serviceFiles = walkFiles(config.backendDir, ['.ts']).filter(
    (f) => /\.service\.ts$/.test(f) && !/\.(spec|test)\.ts$|__tests__|__mocks__|dist\//.test(f),
  );

  for (const file of serviceFiles) {
    const content = readSafe(file);
    if (!content) {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isCommentLine(line)) {
        continue;
      }

      // Detect .findMany( call
      if (!/\.findMany\s*\(/.test(line)) {
        continue;
      }

      // Collect the findMany call block — scan forward up to 20 lines for the closing )
      const blockLines = lines.slice(i, Math.min(i + 20, lines.length));
      const block = blockLines.join('\n');

      // ── SLOW_QUERY: findMany without select or include ──────────────────────
      // If neither `select:` nor `include:` appear in the call block, all columns returned
      const hasSelect = /\bselect\s*:/.test(block);
      const hasInclude = /\binclude\s*:/.test(block);

      if (!hasSelect && !hasInclude) {
        // Crude check: is the argument non-empty (i.e., there's a where/orderBy)?
        // Empty findMany({}) with no args is also flagged since we can't know column count
        breaks.push({
          type: 'SLOW_QUERY',
          severity: 'medium',
          file: relFile,
          line: i + 1,
          description: `findMany without select or include — returns all columns from DB`,
          detail:
            `${line.trim().slice(0, 100)} — ` +
            'Add a select: { ... } block to fetch only required fields, reducing payload size.',
        });
      }

      // ── UNBOUNDED_RESULT: findMany without take ────────────────────────────
      // Check if `take:` appears in the call block
      const hasTake = /\btake\s*:/.test(block);
      const hasFirst = /\.findFirst\s*\(/.test(block); // already limited by design

      if (!hasTake && !hasFirst) {
        breaks.push({
          type: 'UNBOUNDED_RESULT',
          severity: 'medium',
          file: relFile,
          line: i + 1,
          description: `findMany without take — may return all rows and cause OOM or slow response`,
          detail:
            `${line.trim().slice(0, 100)} — ` +
            'Add take: <N> (e.g., 100) and skip for pagination to cap result size.',
        });
      }
    }
  }

  return breaks;
}
