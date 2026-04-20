import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

/**
 * Check whether a return statement uses the `{ data: … }` wrapper pattern.
 *
 * Patterns considered "wrapped":
 *   return { data: … }
 *   return { data: …, meta: … }  (pagination variants)
 *   return this.res.json({ data: … })
 *
 * Patterns considered "raw":
 *   return this.service.foo(…)
 *   return someValue
 *   return { id: …, name: … }  (flat object, NOT { data: … })
 */
function classifyReturn(returnLine: string): 'wrapped' | 'raw' | 'unknown' {
  const trimmed = returnLine.trim();

  // Skip return; (void returns)
  if (/^return\s*;$/.test(trimmed) || trimmed === 'return') {
    return 'unknown';
  }

  // Skip throw statements on the same line (some parsers combine them)
  if (/^throw\b/.test(trimmed)) {
    return 'unknown';
  }

  // Wrapped: return { data:
  if (/return\s+\{[^}]*\bdata\s*:/.test(trimmed)) {
    return 'wrapped';
  }
  if (/\.json\s*\(\s*\{[^}]*\bdata\s*:/.test(trimmed)) {
    return 'wrapped';
  }

  // Raw: any other return with a value
  if (/^return\s+/.test(trimmed)) {
    return 'raw';
  }

  return 'unknown';
}

/**
 * Detect `throw new HttpException(error.message` or `throw new HttpException(err.message`
 * where the exception's status code is likely 5xx.
 * Also catches `throw new InternalServerErrorException(error.message`.
 */
function detectWrongStatusCode(line: string): boolean {
  // throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR
  // throw new HttpException(err.message, 500
  // throw new InternalServerErrorException(error.message  ← always 500
  // throw new HttpException(error.message, HttpStatus.BAD_GATEWAY
  if (/throw\s+new\s+InternalServerErrorException\s*\(\s*(?:error|err|e)\.message/.test(line)) {
    return true;
  }
  if (/throw\s+new\s+HttpException\s*\(\s*(?:error|err|e)\.message/.test(line)) {
    // Check if an explicit 5xx status is provided on the same line
    if (/INTERNAL_SERVER_ERROR|BAD_GATEWAY|SERVICE_UNAVAILABLE|GATEWAY_TIMEOUT|5\d\d/.test(line)) {
      return true;
    }
    // If no status code on same line — still suspicious (defaults or multi-line)
    // Only flag when there is a clear 5xx marker
  }
  return false;
}

/** Check api response consistency. */
export function checkApiResponseConsistency(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const controllerFiles = walkFiles(config.backendDir, ['.ts']).filter(
    (f) => f.endsWith('.controller.ts') && !/\.(spec|test)\.ts$/.test(f),
  );

  for (const file of controllerFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    // ── Per-controller return-style consistency ──────────────────────────────
    // We want to track per-@Controller block (a file may contain multiple).
    // For simplicity, we track the whole file as one unit — most files have one controller.
    let wrappedCount = 0;
    let rawCount = 0;
    let firstWrappedLine = -1;
    let firstRawLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      const cls = classifyReturn(trimmed);
      if (cls === 'wrapped') {
        wrappedCount++;
        if (firstWrappedLine === -1) {
          firstWrappedLine = i + 1;
        }
      } else if (cls === 'raw') {
        rawCount++;
        if (firstRawLine === -1) {
          firstRawLine = i + 1;
        }
      }

      // ── WRONG_STATUS_CODE check ────────────────────────────────────────────
      if (detectWrongStatusCode(trimmed)) {
        breaks.push({
          type: 'WRONG_STATUS_CODE',
          severity: 'medium',
          file: relFile,
          line: i + 1,
          description: 'Re-throwing caught error.message with 5xx status exposes internals',
          detail: `Line ${i + 1}: "${trimmed.slice(0, 120)}" — throwing internal error details to the client leaks stack traces or DB messages. Wrap in a safe message and use an appropriate HTTP status code.`,
        });
      }
    }

    // ── Report inconsistency if BOTH patterns are present ───────────────────
    if (wrappedCount > 0 && rawCount > 0) {
      // Use the higher-line number as the "second style seen" for the break location
      const inconsistentLine = Math.max(firstWrappedLine, firstRawLine);
      breaks.push({
        type: 'RESPONSE_INCONSISTENT',
        severity: 'low',
        file: relFile,
        line: inconsistentLine,
        description: `Controller mixes wrapped ({ data: … }) and raw return styles`,
        detail: `${path.basename(file)} has ${wrappedCount} wrapped return(s) (first at line ${firstWrappedLine}) and ${rawCount} raw return(s) (first at line ${firstRawLine}). Pick one convention and apply it consistently across all methods.`,
      });
    }
  }

  return breaks;
}
