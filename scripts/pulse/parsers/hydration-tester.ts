/**
 * PULSE Parser 68: Hydration Tester (STATIC)
 * Layer 9: Frontend Health
 *
 * STATIC analysis: scans frontend pages for patterns that cause React
 * SSR/hydration mismatches without running a browser.
 *
 * BREAK TYPES:
 *   HYDRATION_MISMATCH (medium) — code pattern that causes SSR vs client render difference
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

export function checkHydration(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const frontendFiles = walkFiles(config.frontendDir, ['.tsx', '.ts']).filter(
    f => !/\.(spec|test)\.tsx?$|__tests__|__mocks__|node_modules|\.next\//.test(f),
  );

  for (const file of frontendFiles) {
    const content = readSafe(file);
    if (!content) continue;

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    // ── CHECK 1: suppressHydrationWarning usage ────────────────────────────────
    // This prop suppresses the error but signals a known hydration mismatch in the codebase
    for (let i = 0; i < lines.length; i++) {
      if (isCommentLine(lines[i])) continue;
      if (/suppressHydrationWarning/.test(lines[i])) {
        breaks.push({
          type: 'HYDRATION_MISMATCH',
          severity: 'medium',
          file: relFile,
          line: i + 1,
          description: 'suppressHydrationWarning detected — indicates a known SSR/client mismatch',
          detail:
            `${lines[i].trim().slice(0, 100)} — ` +
            'suppressHydrationWarning hides the error but does not fix the root cause. ' +
            'Identify and move server-unsafe code into useEffect.',
        });
      }
    }

    // ── CHECK 2: useState default that reads from window or document ───────────
    // Pattern: useState(typeof window !== 'undefined' && window.X)
    // or: useState(window.innerWidth)  — server doesn't have window
    for (let i = 0; i < lines.length; i++) {
      if (isCommentLine(lines[i])) continue;
      const line = lines[i];
      if (
        /useState\s*\(/.test(line) &&
        /window\.|document\.|localStorage|sessionStorage|navigator\./.test(line)
      ) {
        breaks.push({
          type: 'HYDRATION_MISMATCH',
          severity: 'medium',
          file: relFile,
          line: i + 1,
          description: 'useState default value reads browser-only API — causes SSR/client mismatch',
          detail:
            `${line.trim().slice(0, 120)} — ` +
            'Server does not have window/document/localStorage. ' +
            'Use useState(null) or useState(undefined) as default, then set value in useEffect.',
        });
      }
    }

    // ── CHECK 3: Conditional render on typeof window (SSR guard in JSX) ────────
    // Inline `typeof window !== 'undefined'` checks in JSX/render (outside useEffect)
    // can produce different output server vs client
    for (let i = 0; i < lines.length; i++) {
      if (isCommentLine(lines[i])) continue;
      const line = lines[i];
      if (
        /typeof window\s*!==\s*['"]undefined['"]/.test(line) ||
        /typeof window\s*===\s*['"]undefined['"]/.test(line)
      ) {
        // Skip if it's inside a useEffect, event handler, or useCallback
        const contextBefore = lines.slice(Math.max(0, i - 10), i).join('\n');
        if (/useEffect\s*\(|useCallback\s*\(|useMemo\s*\(|addEventListener|handleClick|onClick/.test(contextBefore)) {
          continue;
        }
        breaks.push({
          type: 'HYDRATION_MISMATCH',
          severity: 'medium',
          file: relFile,
          line: i + 1,
          description: 'typeof window check in render — may produce different SSR vs client output',
          detail:
            `${line.trim().slice(0, 120)} — ` +
            'This guard renders different content server vs client. ' +
            'Wrap the component in dynamic(() => import(...), { ssr: false }) or use useEffect.',
        });
      }
    }
  }

  return breaks;
}
