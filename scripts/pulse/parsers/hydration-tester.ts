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

/** Check hydration. */
export function checkHydration(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const frontendFiles = walkFiles(config.frontendDir, ['.tsx', '.ts']).filter(
    (f) => !/\.(spec|test)\.tsx?$|__tests__|__mocks__|node_modules|\.next\//.test(f),
  );

  for (const file of frontendFiles) {
    const content = readSafe(file);
    if (!content) {
      continue;
    }

    // Skip 'use client' files — they only render in the browser, so typeof window is always safe
    // Check if the first non-empty line is a 'use client' or "use client" directive
    const firstLine = content.trimStart().split('\n')[0].trim();
    if (/^['"]use client['"]/.test(firstLine)) {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    // ── CHECK 1: suppressHydrationWarning usage ────────────────────────────────
    // This prop suppresses the error but signals a known hydration mismatch in the codebase
    for (let i = 0; i < lines.length; i++) {
      if (isCommentLine(lines[i])) {
        continue;
      }
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
    // Pattern: useState(window.X)  — server doesn't have window (dangerous, no guard)
    // SAFE patterns:
    //   - useState(() => typeof window !== 'undefined' ? ... : fallback)  — lazy initializer with guard
    //   - useState(typeof window !== 'undefined' && window.X)  — short-circuit with guard
    for (let i = 0; i < lines.length; i++) {
      if (isCommentLine(lines[i])) {
        continue;
      }
      const line = lines[i];
      if (
        /useState\s*\(/.test(line) &&
        /window\.|document\.|localStorage|sessionStorage|navigator\./.test(line)
      ) {
        // Skip if there's a typeof window guard on the same line (it's protected)
        if (/typeof\s+window/.test(line)) {
          continue;
        }
        // Skip lazy initializer pattern: useState(() => ...) — the function runs client-only
        if (/useState\s*\(\s*\(\s*\)/.test(line)) {
          continue;
        }
        // Check the next 5 lines for a typeof window guard (multi-line lazy initializer)
        const nextLines = lines.slice(i + 1, Math.min(i + 6, lines.length)).join('\n');
        if (/typeof\s+window/.test(nextLines)) {
          continue;
        }

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
    //
    // SKIP: utility/library files that are not React components (no JSX return)
    // A file is a React component if it contains `return (` with JSX or `export default function` with JSX.
    // Utility files (api/*.ts, lib/*.ts, hooks that don't return JSX) are safe to use typeof window.
    const fileHasJsxReturn =
      /return\s*\(\s*\n?\s*</.test(content) || /return\s+<[A-Z]/.test(content);
    const fileIsUtility = /\/lib\/|\/utils\/|\/api\/|\/helpers\/|anonymous-session/.test(relFile);
    const fileIsHookNoJsx = /use[A-Z][A-Za-z]+\.ts$/.test(relFile) && !fileHasJsxReturn;
    const skipWindowCheck = fileIsUtility || fileIsHookNoJsx;

    if (!skipWindowCheck) {
      for (let i = 0; i < lines.length; i++) {
        if (isCommentLine(lines[i])) {
          continue;
        }
        const line = lines[i];
        if (
          /typeof window\s*!==\s*['"]undefined['"]/.test(line) ||
          /typeof window\s*===\s*['"]undefined['"]/.test(line)
        ) {
          // Skip if it's inside a useEffect, event handler, useCallback, useMemo, or useState initializer
          const contextBefore = lines.slice(Math.max(0, i - 15), i).join('\n');
          if (
            /useEffect\s*\(|useCallback\s*\(|useMemo\s*\(|addEventListener|handleClick|onClick|useState\s*\(/.test(
              contextBefore,
            )
          ) {
            continue;
          }
          // Skip if inside a function body that's an event handler or callback (arrow function in JSX)
          const localContext = lines.slice(Math.max(0, i - 5), i).join('\n');
          if (
            /=>\s*\{|function\s+\w+\s*\(|async\s*\(/.test(localContext) &&
            !/return\s*\(/.test(localContext)
          ) {
            continue;
          }
          // Skip top-level module variable declarations (const x = typeof window !== 'undefined' ? ...)
          if (/^(?:const|let|var)\s/.test(line.trim())) {
            continue;
          }

          breaks.push({
            type: 'HYDRATION_MISMATCH',
            severity: 'medium',
            file: relFile,
            line: i + 1,
            description:
              'typeof window check in render — may produce different SSR vs client output',
            detail:
              `${line.trim().slice(0, 120)} — ` +
              'This guard renders different content server vs client. ' +
              'Wrap the component in dynamic(() => import(...), { ssr: false }) or use useEffect.',
          });
        }
      }
    }
  }

  return breaks;
}
