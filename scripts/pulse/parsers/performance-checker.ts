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

    // Track lines where loops start
    const loopLines: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      if (LOOP_START_RE.test(trimmed)) {
        loopLines.push(i);
      }

      if (PRISMA_QUERY_RE.test(trimmed)) {
        // Check if any loop started in the 1-10 lines immediately before this line
        const nearbyLoop = loopLines.some(loopLine => {
          const dist = i - loopLine;
          return dist >= 1 && dist <= 10;
        });

        if (nearbyLoop) {
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

      // Prune loop lines that are too far back to matter (> 15 lines)
      while (loopLines.length > 0 && i - loopLines[0] > 15) {
        loopLines.shift();
      }
    }
  }

  // NOTE: setInterval/clearInterval cleanup is handled by the dedicated
  // interval-cleanup-checker.ts parser. No duplication here.

  return breaks;
}
