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

import * as path from 'path';
import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

interface PerformanceMemoryDiagnosticInput {
  file: string;
  line: number;
  summary: string;
  detail: string;
  predicates: string[];
}

function diagnosticToken(value: string): string {
  let token = '';
  for (const char of value) {
    const lower = char.toLowerCase();
    const isAlphaNumeric = (lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9');
    token += isAlphaNumeric ? lower : '-';
  }
  return token.split('-').filter(Boolean).join('-');
}

function buildPerformanceMemoryBreak(input: PerformanceMemoryDiagnosticInput): Break {
  const signal: PulseSignalEvidence = {
    source: `syntax-evidence:performance-memory;predicates=${input.predicates.join(',')}`,
    detector: 'performance-memory',
    truthMode: 'confirmed_static',
    summary: input.summary,
    detail: input.detail,
    location: {
      file: input.file,
      line: input.line,
    },
  };
  const signalGraph = buildPulseSignalGraph([signal]);
  const predicateGraph = buildPredicateGraph(signalGraph);
  const diagnostic = synthesizeDiagnostic(
    signalGraph,
    predicateGraph,
    calculateDynamicRisk({ predicateGraph }),
  );
  const predicateToken = input.predicates.map(diagnosticToken).filter(Boolean).join('+');

  return {
    type: `diagnostic:performance-memory:${predicateToken || diagnostic.id}`,
    severity: 'high',
    file: input.file,
    line: input.line,
    description: diagnostic.title,
    detail: `${diagnostic.summary}; evidence=${diagnostic.evidenceIds.join(',')}; ${input.detail}`,
    source: `${signal.source};detector=${signal.detector};truthMode=${signal.truthMode}`,
    surface: 'performance-memory',
  };
}

function appendDiagnostic(breaks: Break[], input: PerformanceMemoryDiagnosticInput): void {
  breaks.push(buildPerformanceMemoryBreak(input));
}

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
      if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth = Math.max(0, depth - 1);
      }
      // Skip string contents (simplified — handles single and double quotes)
      else if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        c++;
        while (c < line.length && line[c] !== quote) {
          if (line[c] === '\\') {
            c++;
          } // escape
          c++;
        }
      }
      // Skip single-line comment remainder
      else if (ch === '/' && line[c + 1] === '/') {
        break;
      }
    }
  }
  return depths;
}

/** Check performance memory. */
export function checkPerformanceMemory(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const targetFiles = [
    ...walkFiles(config.workerDir, ['.ts']),
    ...walkFiles(config.backendDir, ['.ts']),
  ].filter((f) => !/\.(spec|test)\.ts$|__tests__|__mocks__|dist\//.test(f));

  for (const file of targetFiles) {
    const content = readSafe(file);
    if (!content) {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    // Compute brace depth for each line to determine module-level declarations
    const braceDepths = computeBraceDepths(lines);

    // Collect module-level Map/Set and array declarations (brace depth === 0)
    const moduleMapSets: Array<{ name: string; line: number }> = [];
    const moduleArrays: Array<{ name: string; line: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (isCommentLine(raw)) {
        continue;
      }

      // Only consider lines at module scope (brace depth 0)
      if (braceDepths[i] !== 0) {
        continue;
      }

      const trimmed = raw.trim();

      // ── Module-level Map or Set ─────────────────────────────────────────────
      if (
        /(?:const|let|var)\s+\w+\s*(?:=\s*new\s+(?:Map|Set)\s*\(|:\s*(?:Map|Set)\s*<)/.test(trimmed)
      ) {
        const name = extractVarName(trimmed);
        if (name) {
          moduleMapSets.push({ name, line: i + 1 });
        }
      }

      // ── Module-level array ──────────────────────────────────────────────────
      if (/(?:const|let|var)\s+\w+(?:\s*:\s*\w+(?:<[^>]+>)?\[\])?\s*=\s*\[\s*\]/.test(trimmed)) {
        const name = extractVarName(trimmed);
        if (name) {
          moduleArrays.push({ name, line: i + 1 });
        }
      }
    }

    const compactContent = content.replace(/\s+/g, '');

    // For each module-level Map/Set: check if .delete() or .clear() ever appears
    for (const { name, line } of moduleMapSets) {
      const hasDelete =
        compactContent.includes(`${name}.delete(`) || compactContent.includes(`${name}.clear(`);
      const hasSet =
        compactContent.includes(`${name}.set(`) || compactContent.includes(`${name}.add(`);

      if (hasSet && !hasDelete) {
        appendDiagnostic(breaks, {
          file: relFile,
          line,
          summary: `Module-level collection has growth evidence without cleanup evidence`,
          detail:
            `${name} is declared at module level, has .set()/.add() calls, but never .delete() or .clear(). ` +
            "Unbounded module-level collections grow for the lifetime of the process and are never GC'd.",
          predicates: [
            'module_level_collection_declaration',
            'collection_growth_call_observed',
            'collection_cleanup_call_absent',
          ],
        });
      }
    }

    // For each module-level array: check if .push() appears without .splice()/.shift()/length reset
    for (const { name, line } of moduleArrays) {
      const hasPush = compactContent.includes(`${name}.push(`);
      const hasDrain =
        compactContent.includes(`${name}.splice(`) ||
        compactContent.includes(`${name}.shift(`) ||
        compactContent.includes(`${name}.length=0`) ||
        compactContent.includes(`${name}=[]`);

      if (hasPush && !hasDrain) {
        appendDiagnostic(breaks, {
          file: relFile,
          line,
          summary: `Module-level array has append evidence without drain evidence`,
          detail:
            `${name} is declared at module level, has .push() calls, but never .splice()/.shift() or length reset. ` +
            'Consider using a circular buffer or capping the array size to prevent heap growth.',
          predicates: [
            'module_level_array_declaration',
            'array_append_call_observed',
            'array_drain_call_absent',
          ],
        });
      }
    }

    // ── Event listener added in a loop without cleanup ───────────────────────
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (isCommentLine(raw)) {
        continue;
      }

      const trimmed = raw.trim();
      // Check for .on('event', ...) or .addListener inside a for/while/forEach loop
      if (/\.on\s*\(\s*['"]/.test(trimmed) || /\.addListener\s*\(\s*['"]/.test(trimmed)) {
        // Look backwards up to 5 lines for a for/while/forEach
        const context = lines.slice(Math.max(0, i - 5), i).join('\n');
        if (/for\s*\(|while\s*\(|forEach\s*\(|\.map\s*\(/.test(context)) {
          appendDiagnostic(breaks, {
            file: relFile,
            line: i + 1,
            summary: `Event listener registration appears inside loop context without cleanup evidence`,
            detail:
              `${trimmed.slice(0, 100)} — ` +
              'Each iteration registers a new listener. Without removeListener/off, ' +
              'the emitter retains all callbacks and they accumulate.',
            predicates: [
              'listener_registration_observed',
              'loop_context_observed',
              'listener_cleanup_not_observed',
            ],
          });
        }
      }
    }
  }

  return breaks;
}
