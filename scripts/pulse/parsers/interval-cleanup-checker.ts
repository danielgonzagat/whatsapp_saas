import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

const useClientDirectiveSyntax = /^\s*['"]use client['"]/m;
const reactImportSyntax = /\bimport\b.*\bfrom\s+['"]react['"]/;

const setIntervalCallPattern = /\bsetInterval\s*\(/;
// Match clearInterval( directly, or clearInterval as a callback (e.g. forEach(clearInterval))
const clearIntervalTokenPattern = /\bclearInterval\b/;

const setTimeoutCallPattern = /\bsetTimeout\s*\(/;
// Match clearTimeout( directly, or clearTimeout as a callback (e.g. forEach(clearTimeout))
const clearTimeoutTokenPattern = /\bclearTimeout\b/;

function eventType(...parts: string[]): Break['type'] {
  return parts.map((part) => part.toUpperCase()).join('_');
}

function timerCleanupBreakType(timerKind: 'interval' | 'timeout'): Break['type'] {
  return eventType(timerKind, 'no', 'cleanup');
}

function pushBreak(breaks: Break[], entry: Break): void {
  breaks.push(entry);
}

/**
 * Returns true if the file looks like a React component / client module
 * (has 'use client' directive OR imports from 'react').
 */
function isReactFile(content: string): boolean {
  return useClientDirectiveSyntax.test(content) || reactImportSyntax.test(content);
}

/**
 * Returns the 1-based line number of the first match of the pattern,
 * or 1 if not found.
 */
function firstMatchLine(lines: string[], re: RegExp): number {
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      return i + 1;
    }
  }
  return 1;
}

/** Check interval cleanup. */
export function checkIntervalCleanup(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const files = walkFiles(config.frontendDir, ['.tsx', '.ts']).filter((f) => {
    if (/\.(spec|test)\.(ts|tsx)$/.test(f)) {
      return false;
    }
    if (/node_modules|\.next[/\\]/.test(f)) {
      return false;
    }
    return true;
  });

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    // Only check React/client files
    if (!isReactFile(content)) {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);
    const lines = content.split('\n');

    // ===== setInterval without clearInterval =====
    if (setIntervalCallPattern.test(content) && !clearIntervalTokenPattern.test(content)) {
      const ln = firstMatchLine(lines, setIntervalCallPattern);
      pushBreak(breaks, {
        type: timerCleanupBreakType('interval'),
        severity: 'medium',
        file: relFile,
        line: ln,
        description: 'setInterval used without clearInterval — potential memory leak',
        detail:
          'Return clearInterval(id) from the useEffect cleanup function to prevent the interval from running after unmount.',
      });
    }

    // ===== setTimeout without clearTimeout (in React files) =====
    if (setTimeoutCallPattern.test(content) && !clearTimeoutTokenPattern.test(content)) {
      const ln = firstMatchLine(lines, setTimeoutCallPattern);
      pushBreak(breaks, {
        type: timerCleanupBreakType('timeout'),
        severity: 'medium',
        file: relFile,
        line: ln,
        description:
          'setTimeout used without clearTimeout — potential stale closure / state change once component unmounts',
        detail:
          'Capture the timer id and return clearTimeout(id) from the useEffect cleanup function.',
      });
    }
  }

  return breaks;
}
