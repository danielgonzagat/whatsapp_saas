import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';
import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';

function severityFromRisk(riskScore: number, fallback: Break['severity']): Break['severity'] {
  if (riskScore >= 0.9) return 'critical';
  if (riskScore >= 0.7) return 'high';
  if (riskScore >= 0.4) return 'medium';
  return fallback;
}

function synthesizeJsonDiagnosticBreak(
  signal: PulseSignalEvidence,
  fallback: Break['severity'],
): Break {
  const signalGraph = buildPulseSignalGraph([signal]);
  const predicateGraph = buildPredicateGraph(signalGraph);
  const risk = calculateDynamicRisk({ predicateGraph });
  const diagnostic = synthesizeDiagnostic(signalGraph, predicateGraph, risk);

  return {
    type: diagnostic.id,
    severity: severityFromRisk(risk.score, fallback),
    file: signal.location.file,
    line: signal.location.line,
    description: diagnostic.title,
    detail: `${diagnostic.summary}; evidence=${diagnostic.evidenceIds.join(',')}; predicates=${diagnostic.predicateKinds.join(',')}; signal=${signal.detail ?? signal.summary}`,
    source: `${signal.source};detector=${signal.detector};truthMode=${signal.truthMode};proofMode=${diagnostic.proofMode}`,
  };
}

function buildJsonSafetyBreak(input: {
  file: string;
  line: number;
  summary: string;
  detail: string;
  fallbackSeverity: Break['severity'];
}): Break {
  return synthesizeJsonDiagnosticBreak(
    {
      source: 'json-api-weak-sensor',
      detector: 'json-parse-safety',
      truthMode: 'weak_signal',
      summary: input.summary,
      detail: input.detail,
      location: {
        file: input.file,
        line: input.line,
      },
    },
    input.fallbackSeverity,
  );
}

/**
 * Build a Set of 0-based line indices that are inside a try block.
 *
 * Forward-scan algorithm tracking brace depth with cross-line string state.
 * Template literals that span multiple lines are handled correctly by carrying
 * string context across lines.
 *
 * For each `try {` found, the opening depth is recorded. Lines are marked as
 * "in try" while any such depth is active on the stack. The depth entry is
 * removed when a `}` brings the global depth back below it.
 */
function buildTryLineSet(lines: string[]): Set<number> {
  const inTry = new Set<number>();

  // Each entry: the depth value when the try's `{` was processed (depth AFTER opening).
  // The try block closes when a `}` is encountered while depth === entry.
  const tryOpenDepths: number[] = [];
  let depth = 0;

  // Cross-line template literal tracking
  let inTemplateLiteral = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    // Inline try: `try { ... } catch { ... }` — mark the single line as covered
    if (/\btry\s*\{/.test(t) && /\}\s*catch\b/.test(t)) {
      inTry.add(i);
      // Still process braces below for depth tracking
    }

    // Strip strings/comments for brace counting.
    // Carry template literal state across lines.
    const stripped: string[] = [];
    let inStr = inTemplateLiteral;
    let strChar = inTemplateLiteral ? '`' : '';
    let k = 0;

    while (k < line.length) {
      const ch = line[k];
      if (inStr) {
        const isTemplate = strChar === '`';
        if (ch === strChar && (k === 0 || line[k - 1] !== '\\')) {
          // Closing the string
          inStr = false;
          if (isTemplate) {
            inTemplateLiteral = false;
          }
          strChar = '';
        }
        stripped.push(' ');
      } else if (ch === '/' && line[k + 1] === '/') {
        while (stripped.length < line.length) {
          stripped.push(' ');
        }
        break;
      } else if (ch === '"' || ch === "'") {
        inStr = true;
        strChar = ch;
        stripped.push(' ');
      } else if (ch === '`') {
        inStr = true;
        strChar = '`';
        inTemplateLiteral = true;
        stripped.push(' ');
      } else {
        stripped.push(ch);
      }
      k++;
    }

    // If still in a non-template string at end of line, reset (shouldn't happen in valid TS)
    if (inStr && strChar !== '`') {
      inStr = false;
      strChar = '';
    }
    // If inTemplateLiteral=true, carry it to the next line

    const s = stripped.join('');

    // Process braces left-to-right
    for (let j = 0; j < s.length; j++) {
      const ch = s[j];
      if (ch === '{') {
        depth++;
        // Check if this `{` is part of a `try` (and not an inline try/catch)
        const before = s.slice(0, j);
        const isTryBrace = /\btry\s*$/.test(before) && !/\}\s*catch\b/.test(t);
        if (isTryBrace) {
          tryOpenDepths.push(depth);
        }
      } else if (ch === '}') {
        // Close any try that opened at this depth
        for (let m = tryOpenDepths.length - 1; m >= 0; m--) {
          if (tryOpenDepths[m] === depth) {
            tryOpenDepths.splice(m, 1);
            break;
          }
        }
        depth--;
      }
    }

    // This line is in a try block if tryOpenDepths is non-empty
    if (tryOpenDepths.length > 0) {
      inTry.add(i);
    }
  }

  return inTry;
}

function hasRecentTryGuard(lines: string[], lineIndex: number): boolean {
  const start = Math.max(0, lineIndex - 120);
  let sawCatchBoundary = false;
  for (let i = lineIndex; i >= start; i--) {
    const trimmed = lines[i].trim();
    if (/\bcatch\b/.test(trimmed)) {
      sawCatchBoundary = true;
    }
    if (/\btry\s*\{/.test(trimmed)) {
      return !sawCatchBoundary;
    }
  }
  return false;
}

/** Check json parse safety. */
export function checkJsonParseSafety(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const dirs = [config.backendDir, config.workerDir];

  for (const dir of dirs) {
    if (!dir) {
      continue;
    }

    const files = walkFiles(dir, ['.ts']);

    for (const file of files) {
      // Skip test/spec/seed/migration/mock/node_modules files
      if (/\.(test|spec|d)\.ts$|seed|migration|fixture|mock\.|node_modules/i.test(file)) {
        continue;
      }

      let content: string;
      try {
        content = readTextFile(file, 'utf8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      const relFile = path.relative(config.rootDir, file);

      // Pre-build the try-line set for this file (O(n) forward pass)
      const tryLineSet = buildTryLineSet(lines);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip comments
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          continue;
        }

        // ── CHECK 1: JSON.parse( without try block ──────────────────────────
        if (/\bJSON\.parse\s*\(/.test(trimmed)) {
          // Skip if it's in a comment (inline)
          if (
            /\/\/.*JSON\.parse/.test(trimmed) &&
            trimmed.indexOf('//') < trimmed.indexOf('JSON.parse')
          ) {
            continue;
          }
          // Skip if PULSE:OK annotation on same or previous line
          const prevLine = i > 0 ? lines[i - 1].trim() : '';
          if (/PULSE:OK/.test(trimmed) || /PULSE:OK/.test(prevLine)) {
            continue;
          }
          const parseBlock = lines.slice(i, Math.min(lines.length, i + 4)).join('\n');
          if (/\bJSON\.parse\s*\(\s*JSON\.stringify\s*\(/.test(parseBlock)) {
            continue;
          }

          if (!tryLineSet.has(i) && !hasRecentTryGuard(lines, i)) {
            breaks.push(
              buildJsonSafetyBreak({
                file: relFile,
                line: i + 1,
                fallbackSeverity: 'high',
                summary: 'JSON.parse call lacks nearby try/catch evidence',
                detail: `${trimmed.slice(0, 120)}; syntax sensor needs control-flow confirmation before blocking.`,
              }),
            );
          }
        }

        // ── CHECK 2: JSON.stringify on request/socket objects ────────────────
        // These objects can have circular references and will throw a TypeError.
        if (/\bJSON\.stringify\s*\(\s*(?:req|request|socket|ws|ctx|context)\b/.test(trimmed)) {
          // Skip if it's in a comment
          if (
            /\/\/.*JSON\.stringify/.test(trimmed) &&
            trimmed.indexOf('//') < trimmed.indexOf('JSON.stringify')
          ) {
            continue;
          }

          breaks.push(
            buildJsonSafetyBreak({
              file: relFile,
              line: i + 1,
              fallbackSeverity: 'low',
              summary:
                'JSON.stringify call targets request-like object that may contain circular references',
              detail: `${trimmed.slice(0, 120)}; syntax sensor needs runtime shape confirmation before blocking.`,
            }),
          );
        }
      }
    }
  }

  return breaks;
}
