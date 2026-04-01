import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

// Financial file path patterns
const FINANCIAL_PATH = /checkout|wallet|payment|billing/i;

/**
 * Extract the body of a catch block starting at line `catchLineIdx`.
 * Returns up to `maxLines` lines after the `} catch (...) {` opener.
 */
function extractCatchBody(lines: string[], catchLineIdx: number, maxLines = 8): string[] {
  // Find the opening `{` of the catch body
  let braceFound = false;
  let startBody = catchLineIdx;

  for (let i = catchLineIdx; i < Math.min(lines.length, catchLineIdx + 3); i++) {
    if (/\{/.test(lines[i])) {
      startBody = i + 1;
      braceFound = true;
      break;
    }
  }

  if (!braceFound) return [];

  // Collect lines until we find the closing `}` or hit maxLines
  const body: string[] = [];
  let depth = 0;

  for (let i = startBody; i < Math.min(lines.length, startBody + maxLines); i++) {
    const t = lines[i].trim();
    // Count braces to detect nested blocks
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }
    // If depth drops below 0, we've hit the closing `}` of the catch
    if (depth < 0) break;
    body.push(t);
  }

  return body;
}

/**
 * Check if a catch body is effectively empty:
 * - No lines, or
 * - All lines are empty/whitespace/comments
 */
function isCatchBodyEmpty(bodyLines: string[]): boolean {
  if (bodyLines.length === 0) return true;
  return bodyLines.every(l => {
    const t = l.trim();
    return t === '' || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
  });
}

/**
 * Check if a catch body only logs without re-throwing or returning.
 * This means it swallows the error silently after logging.
 */
function isCatchBodyLogOnly(bodyLines: string[]): boolean {
  if (bodyLines.length === 0) return false;
  const meaningful = bodyLines.filter(l => {
    const t = l.trim();
    return t !== '' && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  });
  if (meaningful.length === 0) return false;

  // All meaningful lines are console.log/console.error/console.warn/logger.log etc.
  // AND there's no throw or return
  const hasThrowOrReturn = meaningful.some(l => /\b(?:throw|return)\b/.test(l));
  if (hasThrowOrReturn) return false;

  const allLogging = meaningful.every(l =>
    /\bconsole\.\w+\s*\(|\bthis\.logger\.\w+|\bLogger\.\w+|\bthis\.log\b/.test(l)
  );

  return allLogging;
}

/**
 * Check if a catch body re-throws (has `throw` statement).
 */
function catchBodyRethrows(bodyLines: string[]): boolean {
  return bodyLines.some(l => /\bthrow\b/.test(l.trim()));
}

export function checkErrorHandlers(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const dirs = [config.backendDir, config.workerDir];

  for (const dir of dirs) {
    if (!dir) continue;

    const files = walkFiles(dir, ['.ts']);

    for (const file of files) {
      // Skip test/spec/seed/migration/mock files
      if (/\.(test|spec|d)\.ts$|seed|migration|fixture|mock\./i.test(file)) continue;

      let content: string;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      const relFile = path.relative(config.rootDir, file);
      const isFinancial = FINANCIAL_PATH.test(file);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip comment lines
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

        // ── CHECK 1: catch block analysis ─────────────────────────────────────
        if (/\}\s*catch\s*[\w(]/.test(trimmed) || /^\s*catch\s*[\w(]/.test(trimmed)) {
          const bodyLines = extractCatchBody(lines, i);

          if (isCatchBodyEmpty(bodyLines)) {
            // Empty catch — swallows error completely
            if (isFinancial) {
              breaks.push({
                type: 'FINANCIAL_ERROR_SWALLOWED',
                severity: 'critical',
                file: relFile,
                line: i + 1,
                description: 'Empty catch block in financial code — error silently swallowed',
                detail: trimmed.slice(0, 120),
              });
            } else {
              breaks.push({
                type: 'EMPTY_CATCH',
                severity: 'medium',
                file: relFile,
                line: i + 1,
                description: 'Empty catch block — error silently swallowed',
                detail: trimmed.slice(0, 120),
              });
            }
          } else if (isCatchBodyLogOnly(bodyLines)) {
            // Logs but doesn't rethrow/return
            if (isFinancial) {
              breaks.push({
                type: 'FINANCIAL_ERROR_SWALLOWED',
                severity: 'critical',
                file: relFile,
                line: i + 1,
                description: 'catch block in financial code only logs — error swallowed without throw',
                detail: trimmed.slice(0, 120),
              });
            } else {
              breaks.push({
                type: 'EMPTY_CATCH',
                severity: 'medium',
                file: relFile,
                line: i + 1,
                description: 'catch block only logs without throw/return — error effectively swallowed',
                detail: trimmed.slice(0, 120),
              });
            }
          } else if (isFinancial && !catchBodyRethrows(bodyLines)) {
            // Financial catch that does something but doesn't rethrow
            // Downgrade to high if catch has a return (intentional error handling)
            // or calls an error reporting function
            const meaningful = bodyLines.filter(l => l.trim() && !l.trim().startsWith('//'));
            const hasReturn = meaningful.some(l => /\breturn\b/.test(l));
            const hasErrorReport = meaningful.some(l => /\b(report|sentry|notify|alert|emit|dispatch|rollback)\b/i.test(l));
            const hasNullReturn = meaningful.some(l => /return\s*(null|undefined|false|\[\]|\{\}|0|''|"")\s*;?/.test(l));
            if (hasReturn || hasErrorReport) {
              // Intentional error handling — not swallowed, downgrade
              breaks.push({
                type: 'FINANCIAL_ERROR_SWALLOWED',
                severity: 'high',
                file: relFile,
                line: i + 1,
                description: hasNullReturn
                  ? 'catch in financial code returns null/default — caller may not detect failure'
                  : 'catch in financial code handles error without rethrow',
                detail: trimmed.slice(0, 120),
              });
            } else {
              breaks.push({
                type: 'FINANCIAL_ERROR_SWALLOWED',
                severity: 'critical',
                file: relFile,
                line: i + 1,
                description: 'catch block in financial code does not rethrow — caller unaware of failure',
                detail: trimmed.slice(0, 120),
              });
            }
          }
        }

        // ── CHECK 2: .then( without .catch( ───────────────────────────────────
        // Look for .then( that is NOT followed by .catch( on same line or next 2 lines
        if (/\.then\s*\(/.test(trimmed)) {
          // Skip if this line already has .catch(
          if (/\.catch\s*\(/.test(trimmed)) continue;

          // Skip if it's inside a chain that has await (then is on a thenable, not a Promise chain)
          if (/\bawait\b/.test(trimmed)) continue;

          // Check the next 2 lines for .catch(
          const nextLines = lines.slice(i + 1, Math.min(lines.length, i + 3)).join('\n');
          if (!/\.catch\s*\(/.test(nextLines)) {
            // Additional filter: skip if it's a test assertion chain (.then().expect())
            // or a type guard (.then(res => res.json()))
            if (/\.(expect|toBe|toEqual|toMatch|finally)\s*\(/.test(trimmed + nextLines)) continue;

            breaks.push({
              type: 'UNHANDLED_PROMISE',
              severity: 'medium',
              file: relFile,
              line: i + 1,
              description: '.then() without .catch() — unhandled promise rejection',
              detail: trimmed.slice(0, 120),
            });
          }
        }
      }
    }
  }

  return breaks;
}
