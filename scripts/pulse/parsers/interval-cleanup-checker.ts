import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

const USE_CLIENT_RE = /^\s*['"]use client['"]/m;
const REACT_IMPORT_RE = /\bimport\b.*\bfrom\s+['"]react['"]/;

const HAS_SET_INTERVAL = /\bsetInterval\s*\(/;
// Match clearInterval( directly, or clearInterval as a callback (e.g. forEach(clearInterval))
const HAS_CLEAR_INTERVAL = /\bclearInterval\b/;

const HAS_SET_TIMEOUT = /\bsetTimeout\s*\(/;
// Match clearTimeout( directly, or clearTimeout as a callback (e.g. forEach(clearTimeout))
const HAS_CLEAR_TIMEOUT = /\bclearTimeout\b/;

/**
 * Returns true if the file looks like a React component / client module
 * (has 'use client' directive OR imports from 'react').
 */
function isReactFile(content: string): boolean {
  return USE_CLIENT_RE.test(content) || REACT_IMPORT_RE.test(content);
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
    if (HAS_SET_INTERVAL.test(content) && !HAS_CLEAR_INTERVAL.test(content)) {
      const ln = firstMatchLine(lines, HAS_SET_INTERVAL);
      breaks.push({
        type: 'INTERVAL_NO_CLEANUP',
        severity: 'medium',
        file: relFile,
        line: ln,
        description: 'setInterval used without clearInterval — potential memory leak',
        detail:
          'Return clearInterval(id) from the useEffect cleanup function to prevent the interval from running after unmount.',
      });
    }

    // ===== setTimeout without clearTimeout (in React files) =====
    if (HAS_SET_TIMEOUT.test(content) && !HAS_CLEAR_TIMEOUT.test(content)) {
      const ln = firstMatchLine(lines, HAS_SET_TIMEOUT);
      breaks.push({
        type: 'TIMEOUT_NO_CLEANUP',
        severity: 'medium',
        file: relFile,
        line: ln,
        description:
          'setTimeout used without clearTimeout — potential stale closure / state update after unmount',
        detail:
          'Capture the timer id and return clearTimeout(id) from the useEffect cleanup function.',
      });
    }
  }

  return breaks;
}
