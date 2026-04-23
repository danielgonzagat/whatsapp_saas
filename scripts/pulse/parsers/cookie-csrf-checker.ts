import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

// Patterns that indicate a cookie is being set
const COOKIE_SET_PATTERNS = [
  /res\.cookie\s*\(/,
  /response\.cookie\s*\(/,
  /setCookie\s*\(/,
  /['"`]Set-Cookie['"`]/,
];

function shouldSkipFile(file: string): boolean {
  return /\.(spec|test)\.ts$|__tests__|__mocks__|\/seed\.|\/migration\.|fixture/i.test(file);
}

/**
 * Given a line index where a cookie-setting call starts,
 * extract the options block by reading forward until we collect
 * a balanced object literal or the statement ends.
 */
function extractCookieOptions(lines: string[], startLine: number): string {
  const MAX_SCAN = 10;
  const chunk = lines.slice(startLine, Math.min(startLine + MAX_SCAN, lines.length)).join(' ');
  return chunk;
}

/** Check cookie security. */
export function checkCookieSecurity(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const files = walkFiles(config.backendDir, ['.ts']).filter((f) => !shouldSkipFile(f));

  // Global CSRF check accumulator
  let csrfMentionCount = 0;

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    // Check for CSRF mentions anywhere in the file
    if (/csrf|csurf|csrfProtection|_csrf/i.test(content)) {
      csrfMentionCount++;
    }

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // Skip comment lines
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      const isCookieSet = COOKIE_SET_PATTERNS.some((re) => re.test(trimmed));
      if (!isCookieSet) {
        continue;
      }

      // Extract the options context (multi-line)
      const optionsContext = extractCookieOptions(lines, i);

      // httpOnly check
      if (!/httpOnly\s*:\s*true/.test(optionsContext)) {
        breaks.push({
          type: 'COOKIE_NOT_HTTPONLY',
          severity: 'high',
          file: relFile,
          line: i + 1,
          description: 'Cookie set without httpOnly: true — vulnerable to XSS theft',
          detail: trimmed.slice(0, 120),
        });
      }

      // secure check — accept both literal true and env-conditional (secure: process.env.NODE_ENV === 'production')
      if (!/\bsecure\s*:\s*(true|process\.env)/.test(optionsContext)) {
        breaks.push({
          type: 'COOKIE_NOT_SECURE',
          severity: 'medium',
          file: relFile,
          line: i + 1,
          description: 'Cookie set without secure: true — transmitted over HTTP',
          detail: trimmed.slice(0, 120),
        });
      }

      // sameSite check
      if (!/sameSite\s*:/.test(optionsContext)) {
        breaks.push({
          type: 'COOKIE_NO_SAMESITE',
          severity: 'medium',
          file: relFile,
          line: i + 1,
          description: 'Cookie set without sameSite attribute — vulnerable to CSRF',
          detail: trimmed.slice(0, 120),
        });
      }
    }
  }

  // Single global break if no CSRF protection found anywhere
  if (csrfMentionCount === 0) {
    breaks.push({
      type: 'CSRF_UNPROTECTED',
      severity: 'critical',
      file: 'backend/src',
      line: 0,
      description: 'No CSRF protection found anywhere in the backend',
      detail:
        'No references to csrf, csurf, csrfProtection, or _csrf found. Add CSRF middleware if using cookie-based auth.',
    });
  }

  return breaks;
}
