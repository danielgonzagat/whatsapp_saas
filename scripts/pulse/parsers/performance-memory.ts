/**
 * PULSE Parser 60: Performance — Memory Leak Detection (STATIC)
 * Layer 6: Performance Testing
 *
 * STATIC analysis: scans worker and backend code for common memory leak patterns:
 * - Module-level Map/Set that only grows (no delete/clear)
 * - Module-level arrays with push() but no splice/shift/length reset
 * - Event listeners added in loops without cleanup
 *
 * BREAK TYPES:
 *   MEMORY_LEAK_DETECTED (high) — detected pattern indicates unbounded memory growth
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

function readSafe(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

/**
 * Returns the name from a declaration like:
 *   const cache = new Map() → "cache"
 *   const queue = new Set() → "queue"
 *   const items: string[] = [] → "items"
 */
function extractVarName(line: string): string | null {
  const m = line.match(/(?:const|let|var)\s+(\w+)/);
  return m ? m[1] : null;
}

/**
 * Determines if a given line index is at true module scope (not inside a function/class/block).
 *
 * Strategy: track brace depth from the start of the file up to the line.
 * Lines at brace depth 0 are module-level.
 * This handles both 0-indent and 2-space-indent function bodies.
 */
function computeBraceDepths(lines: string[]): number[] {
  const depths: number[] = new Array(lines.length).fill(0);
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    depths[i] = depth;
    const line = lines[i];
    // Count open/close braces, but skip string literals and comments (simplified)
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '{') depth++;
      else if (ch === '}') depth = Math.max(0, depth - 1);
      // Skip string contents (simplified — handles single and double quotes)
      else if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        c++;
        while (c < line.length && line[c] !== quote) {
          if (line[c] === '\\') c++; // escape
          c++;
        }
      }
      // Skip single-line comment remainder
      else if (ch === '/' && line[c + 1] === '/') break;
    }
  }
  return depths;
}

export function checkPerformanceMemory(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const targetFiles = [
    ...walkFiles(config.workerDir, ['.ts']),
    ...walkFiles(config.backendDir, ['.ts']),
  ].filter(f => !/\.(spec|test)\.ts$|__tests__|__mocks__|dist\//.test(f));

  for (const file of targetFiles) {
    const content = readSafe(file);
    if (!content) continue;

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    // Compute brace depth for each line to determine module-level declarations
    const braceDepths = computeBraceDepths(lines);

    // Collect module-level Map/Set and array declarations (brace depth === 0)
    const moduleMapSets: Array<{ name: string; line: number }> = [];
    const moduleArrays: Array<{ name: string; line: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (isCommentLine(raw)) continue;

      // Only consider lines at module scope (brace depth 0)
      if (braceDepths[i] !== 0) continue;

      const trimmed = raw.trim();

      // ── Module-level Map or Set ─────────────────────────────────────────────
      if (/(?:const|let|var)\s+\w+\s*(?:=\s*new\s+(?:Map|Set)\s*\(|:\s*(?:Map|Set)\s*<)/.test(trimmed)) {
        const name = extractVarName(trimmed);
        if (name) moduleMapSets.push({ name, line: i + 1 });
      }

      // ── Module-level array ──────────────────────────────────────────────────
      if (/(?:const|let|var)\s+\w+(?:\s*:\s*\w+(?:<[^>]+>)?\[\])?\s*=\s*\[\s*\]/.test(trimmed)) {
        const name = extractVarName(trimmed);
        if (name) moduleArrays.push({ name, line: i + 1 });
      }
    }

    // For each module-level Map/Set: check if .delete() or .clear() ever appears
    for (const { name, line } of moduleMapSets) {
      const hasDelete = new RegExp(`${name}\\.delete\\s*\\(|${name}\\.clear\\s*\\(`).test(content);
      const hasSet = new RegExp(`${name}\\.set\\s*\\(|${name}\\.add\\s*\\(`).test(content);

      if (hasSet && !hasDelete) {
        breaks.push({
          type: 'MEMORY_LEAK_DETECTED',
          severity: 'high',
          file: relFile,
          line,
          description: `Module-level ${name} (Map/Set) grows without bound — no .delete() or .clear() found`,
          detail:
            `${name} is declared at module level, has .set()/.add() calls, but never .delete() or .clear(). ` +
            'Unbounded module-level collections grow for the lifetime of the process and are never GC\'d.',
        });
      }
    }

    // For each module-level array: check if .push() appears without .splice()/.shift()/length reset
    for (const { name, line } of moduleArrays) {
      const hasPush = new RegExp(`${name}\\.push\\s*\\(`).test(content);
      const hasDrain = new RegExp(
        `${name}\\.splice\\s*\\(|${name}\\.shift\\s*\\(|${name}\\.length\\s*=\\s*0|${name}\\s*=\\s*\\[\\s*\\]`,
      ).test(content);

      if (hasPush && !hasDrain) {
        breaks.push({
          type: 'MEMORY_LEAK_DETECTED',
          severity: 'high',
          file: relFile,
          line,
          description: `Module-level array ${name} grows without bound — push() with no drain/reset`,
          detail:
            `${name} is declared at module level, has .push() calls, but never .splice()/.shift() or length reset. ` +
            'Consider using a circular buffer or capping the array size to prevent heap growth.',
        });
      }
    }

    // ── Event listener added in a loop without cleanup ───────────────────────
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (isCommentLine(raw)) continue;

      const trimmed = raw.trim();
      // Check for .on('event', ...) or .addListener inside a for/while/forEach loop
      if (
        /\.on\s*\(\s*['"]/.test(trimmed) ||
        /\.addListener\s*\(\s*['"]/.test(trimmed)
      ) {
        // Look backwards up to 5 lines for a for/while/forEach
        const context = lines.slice(Math.max(0, i - 5), i).join('\n');
        if (/for\s*\(|while\s*\(|forEach\s*\(|\.map\s*\(/.test(context)) {
          breaks.push({
            type: 'MEMORY_LEAK_DETECTED',
            severity: 'high',
            file: relFile,
            line: i + 1,
            description: `Event listener added inside a loop without corresponding removeListener`,
            detail:
              `${trimmed.slice(0, 100)} — ` +
              'Each iteration registers a new listener. Without removeListener/off, ' +
              'the emitter retains all callbacks and they accumulate.',
          });
        }
      }
    }
  }

  return breaks;
}
