import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  return (
    normalized.includes('.spec.') ||
    normalized.includes('.test.') ||
    normalized.includes('__tests__') ||
    normalized.includes('__mocks__') ||
    normalized.includes('/seed.') ||
    normalized.includes('fixture')
  );
}

function performanceFinding(input: {
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
  predicateKinds: string[];
}): Break {
  const predicateToken =
    input.predicateKinds
      .map((predicate) => predicate.replace(/[^a-z0-9]+/gi, '-').toLowerCase())
      .filter(Boolean)
      .join('+') || 'performance-observation';

  return {
    type: `diagnostic:performance-checker:${predicateToken}`,
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: `syntax-evidence:performance-checker;predicates=${input.predicateKinds.join(',')}`,
  };
}

function splitIdentifier(value: string): Set<string> {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .toLowerCase();
  return new Set(spaced.split(/\s+/).filter(Boolean));
}

function hasLoopSyntax(line: string): boolean {
  const compact = line.replace(/\s+/g, '');
  return (
    compact.startsWith('for(') ||
    compact.includes('.forEach(') ||
    (compact.includes('async') && (compact.includes('.map(') || compact.includes('.flatMap(')))
  );
}

function hasAwaitedStateQuery(line: string): boolean {
  const compact = line.replace(/\s+/g, '');
  const tokens = splitIdentifier(line);
  return compact.includes('await') && tokens.has('prisma');
}

function hasBatchMembershipEvidence(value: string): boolean {
  const tokens = splitIdentifier(value);
  return tokens.has('in') || tokens.has('batch') || tokens.has('ids');
}

/**
 * N+1 heuristic: if we see `await this.prisma.` inside a real loop body
 * (for/forEach, or async .map/.flatMap), flag it — unless the query already
 * uses `{ in: ... }` which indicates batching.
 *
 * Supports PULSE:OK annotations to suppress false positives.
 */
export function checkPerformance(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // ---- N+1 Query Detection (backend) ----
  const backendFiles = walkFiles(config.backendDir, ['.ts']).filter((f) => !isTestFile(f));

  for (const file of backendFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    // Track loop start info: { line, braceDepthAtStart }
    const loopEntries: Array<{ line: number; depth: number }> = [];

    // Track cumulative brace depth
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      if (trimmed.includes('PULSE:OK')) {
        continue;
      }

      // Update brace depth from this line
      for (const ch of lines[i]) {
        if (ch === '{') {
          braceDepth++;
        }
        if (ch === '}') {
          braceDepth--;
        }
      }

      if (hasLoopSyntax(trimmed)) {
        loopEntries.push({ line: i, depth: braceDepth });
      }

      if (hasAwaitedStateQuery(trimmed)) {
        const prevLine = i > 0 ? lines[i - 1].trim() : '';
        if (prevLine.includes('PULSE:OK')) {
          continue;
        }

        const lookAhead = lines.slice(i, Math.min(i + 6, lines.length)).join('\n');
        if (hasBatchMembershipEvidence(lookAhead)) {
          continue;
        }

        const insideLoop = loopEntries.some((entry) => {
          const dist = i - entry.line;
          return dist >= 1 && dist <= 15 && braceDepth > entry.depth;
        });

        if (insideLoop) {
          breaks.push(
            performanceFinding({
              severity: 'medium',
              file: relFile,
              line: i + 1,
              description: 'State query inside loop without batch evidence',
              detail: trimmed.slice(0, 120),
              predicateKinds: ['state-query-in-loop', 'batch-evidence-not-observed'],
            }),
          );
        }
      }

      loopEntries.splice(
        0,
        loopEntries.findIndex((e) => i - e.line <= 20 && braceDepth >= e.depth) === -1
          ? loopEntries.length
          : loopEntries.findIndex((e) => i - e.line <= 20 && braceDepth >= e.depth),
      );
    }
  }

  // NOTE: setInterval/clearInterval cleanup is handled by the dedicated
  // interval-cleanup-checker.ts parser. No duplication here.

  return breaks;
}
