import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

function isTestFile(filePath: string): boolean {
  return /\.(spec|test)\.(ts|tsx)$|__tests__|__mocks__|\/seed\.|fixture/i.test(filePath);
}

// Lines that signal we've entered a loop/iteration construct
const LOOP_START_RE = /\bfor\s*\(|\bforEach\s*\(|\.map\s*\(|\.flatMap\s*\(|\.filter\s*\(|\.reduce\s*\(/;

// A Prisma query inside an async call
const PRISMA_QUERY_RE = /await\s+this\.prisma\./;

/**
 * N+1 heuristic: if we see `await this.prisma.` within 1-10 lines after
 * a loop/forEach/map opening, flag it.
 */
export function checkPerformance(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // ---- N+1 Query Detection (backend) ----
  const backendFiles = walkFiles(config.backendDir, ['.ts']).filter(f => !isTestFile(f));

  for (const file of backendFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    // Track loop start info: { line, braceDepthAtStart }
    // A loop is considered "active" if current brace depth >= depth at loop start
    const loopEntries: Array<{ line: number; depth: number }> = [];

    // Track cumulative brace depth
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      // Update brace depth from this line
      for (const ch of lines[i]) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }

      if (LOOP_START_RE.test(trimmed)) {
        // Record the loop start with current depth (after processing braces)
        // The loop body starts after this line's opening brace
        loopEntries.push({ line: i, depth: braceDepth });
      }

      if (PRISMA_QUERY_RE.test(trimmed)) {
        // Check if we're inside any recorded loop
        // We're inside a loop if the current brace depth is >= the depth at loop start
        // AND within 10 lines of the loop start (to limit false positives from distant loops)
        const insideLoop = loopEntries.some(entry => {
          const dist = i - entry.line;
          // Must be within 10 lines of loop start AND still inside the loop (depth >= entry depth)
          return dist >= 1 && dist <= 10 && braceDepth > entry.depth;
        });

        if (insideLoop) {
          breaks.push({
            type: 'N_PLUS_ONE_QUERY',
            severity: 'medium',
            file: relFile,
            line: i + 1,
            description: 'Prisma query inside loop — potential N+1 query problem',
            detail: trimmed.slice(0, 120),
          });
        }
      }

      // Prune loop entries that are too far back to matter (> 15 lines) or loops we've exited
      loopEntries.splice(
        0,
        loopEntries.findIndex(e => (i - e.line) <= 15 && braceDepth >= e.depth) === -1
          ? loopEntries.length
          : loopEntries.findIndex(e => (i - e.line) <= 15 && braceDepth >= e.depth)
      );
    }
  }

  // NOTE: setInterval/clearInterval cleanup is handled by the dedicated
  // interval-cleanup-checker.ts parser. No duplication here.

  return breaks;
}
