import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

// File paths that contain financial logic
const FINANCIAL_PATH = /checkout|wallet|billing|payment|kloel/i;

// Arithmetic operators that shouldn't follow a .toFixed() string result
const ARITHMETIC_RE = /(?:^\s*[\w.[\]'"]+\s*[-+*/]|[-+*/]\s*[\w.[\]'"]+\s*$)/;

// Division patterns — look for actual arithmetic division by a variable.
// Must be an assignment or expression, NOT a path, import, comment, or decorator.
// Requires: identifier/number SPACE? / SPACE? identifier (not string/path chars)
const DIVISION_BY_VAR_RE = /\b(?:[\w.[\]]+)\s*\/\s*(?!\/|=|\*)[a-zA-Z_]\w*\s*[;,)\]]/;

// Zero-guard patterns — what a responsible dev would write before dividing
const ZERO_GUARD_RE =
  /(?:=== 0|!== 0|\|\|\s*1\b|Math\.max\s*\(|if\s*\(.*=== 0|if\s*\(!|divisor|denominator)/i;

/** Check financial arithmetic. */
export function checkFinancialArithmetic(config: PulseConfig): Break[] {
  const breaks: Break[] = [];
  const files = walkFiles(config.backendDir, ['.ts']);

  for (const file of files) {
    // Only scan financial paths
    if (!FINANCIAL_PATH.test(file)) {
      continue;
    }

    // Skip test/spec/seed/migration/mock files
    if (/\.(test|spec|d)\.ts$|seed|migration|fixture|mock\./i.test(file)) {
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      // ── CHECK 1: .toFixed(2) in financial files ─────────────────────────────
      // Any .toFixed( in a financial file is flagged conservatively.
      // Developers should use a dedicated money library (e.g. Decimal.js) instead.
      if (/\.toFixed\s*\(\s*\d+\s*\)/.test(trimmed)) {
        // Skip if it's clearly just for display formatting in a template string/log
        // Conservative: only skip if it's inside a string literal being returned or assigned to a label var
        const isDisplayOnly =
          /console\.|logger\.|res\.json\(.*label|res\.json\(.*message|\.toString\s*\(/.test(
            trimmed,
          );

        // Skip if .toFixed() is already wrapped with Number() — this is the correct safe usage pattern
        // e.g. Number(x.toFixed(2)) or Number((expr).toFixed(2)) converts back to number after rounding
        const isWrappedWithNumber = /Number\s*\(.*\.toFixed\s*\(\s*\d+\s*\)\s*\)/.test(trimmed);

        if (!isDisplayOnly && !isWrappedWithNumber) {
          breaks.push({
            type: 'TOFIX_WITHOUT_PARSE',
            severity: 'high',
            file: relFile,
            line: i + 1,
            description:
              '.toFixed() in financial code — returns string, not number; use Decimal.js or parseInt/parseFloat',
            detail: trimmed.slice(0, 120),
          });
        }
      }

      // ── CHECK 2: Division by variable without zero-guard ────────────────────
      // Look for patterns like: `amount / variable` or `x / someVar`
      // Must look like arithmetic: ident / ident with surrounding expression context
      if (DIVISION_BY_VAR_RE.test(trimmed)) {
        // Hard excludes: comments, imports, decorators, URL strings, type casts
        if (/^\/\/|\/\*|^\s*\*/.test(trimmed)) {
          continue;
        }
        if (/require\s*\(|^import\s+|from\s+['"`]/.test(trimmed)) {
          continue;
        }
        if (/https?:\/\/|['"`][^'"`]*\/[^'"`]*['"`]/.test(trimmed)) {
          continue;
        }
        // Exclude: .replace(/regex/) and similar regex literals
        if (
          /\.replace\s*\(\/|\.match\s*\(\/|\.split\s*\(\/|\.search\s*\(\/|\.test\s*\(\//.test(
            trimmed,
          )
        ) {
          continue;
        }
        // Exclude decorator lines (@Controller, @Get, etc.)
        if (/^\s*@\w+/.test(trimmed)) {
          continue;
        }
        // Exclude: line is just a string or template literal
        if (/^\s*['"`]|^\s*`/.test(trimmed)) {
          continue;
        }
        // Exclude: ternary path-like strings
        if (/\?\s*['"`][^'"`]*\/|:\s*['"`][^'"`]*\//.test(trimmed)) {
          continue;
        }

        // Check that there's no zero-guard within the previous 10 lines or same line.
        // Also treat variable names containing 'safe', 'non_zero', 'nonzero', 'clamped'
        // as implicit guards when used as the divisor.
        const contextBefore = lines.slice(Math.max(0, i - 10), i).join('\n');
        const divisorMatch = trimmed.match(/\/\s*([a-zA-Z_]\w*)/);
        const divisorName = divisorMatch ? divisorMatch[1] : '';
        const divisorIsSafe = /safe|nonzero|non_zero|clamp|limit/i.test(divisorName);
        const hasGuard =
          ZERO_GUARD_RE.test(contextBefore) ||
          /!== 0|=== 0|\|\|\s*1\b|Math\.max/.test(trimmed) ||
          divisorIsSafe;

        if (!hasGuard) {
          breaks.push({
            type: 'DIVISION_BY_ZERO_RISK',
            severity: 'high',
            file: relFile,
            line: i + 1,
            description:
              'Division by variable without zero-check — potential division by zero in financial code',
            detail: trimmed.slice(0, 120),
          });
        }
      }
    }
  }

  return breaks;
}
