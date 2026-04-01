import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

// ===== Puppeteer timeout patterns =====
const PUPPETEER_TIMEOUT_CALLS = [
  /\bpage\.goto\s*\(/,
  /\bpage\.evaluate\s*\(/,
  /\bpage\.waitForSelector\s*\(/,
  /\bpage\.waitForFunction\s*\(/,
  /\bpage\.waitForNavigation\s*\(/,
  /\bpage\.click\s*\(/,
  /\bpage\.type\s*\(/,
];
const HAS_TIMEOUT_IN_CALL = /\btimeout\s*:/;

// ===== BullMQ job add =====
// Matches: .add( or .addBulk( calls on any queue
const JOB_ADD_RE = /\.add\s*\(/;
const JOB_ADD_BULK_RE = /\.addBulk\s*\(/;
const HAS_ATTEMPTS = /\battempts\s*:/;
const HAS_BACKOFF = /\bbackoff\s*:/;

function shouldSkipFile(file: string): boolean {
  return /\.(spec|test)\.(ts|tsx|js|jsx)$|__tests__|__mocks__/.test(file);
}

function isCommentLine(trimmed: string): boolean {
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

export function checkWorkerResilience(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  if (!config.workerDir) return breaks;

  const files = walkFiles(config.workerDir, ['.ts']).filter(f => !shouldSkipFile(f));

  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    // ===== File-level: Puppeteer page leak check =====
    const hasNewPage = content.includes('browser.newPage()') || content.includes('browser?.newPage()');
    const hasPageGoto = content.includes('page.goto(') || content.includes('page?.goto(');
    const hasPageClose =
      content.includes('page.close()') ||
      content.includes('page?.close()') ||
      content.includes('.close()');

    if ((hasNewPage || hasPageGoto) && !hasPageClose) {
      breaks.push({
        type: 'PUPPETEER_PAGE_LEAK',
        severity: 'high',
        file: relFile,
        line: 1,
        description: 'Puppeteer page opened but never closed — potential memory leak',
        detail: 'Add page.close() in a finally block after page operations.',
      });
    }

    // ===== Line-level checks =====
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();

      if (isCommentLine(trimmed)) continue;

      // --- Puppeteer timeout check ---
      for (const callRe of PUPPETEER_TIMEOUT_CALLS) {
        if (!callRe.test(raw)) continue;

        // Check same line and next 2 lines for `timeout:`
        const window = lines.slice(i, Math.min(i + 3, lines.length)).join(' ');
        if (!HAS_TIMEOUT_IN_CALL.test(window)) {
          breaks.push({
            type: 'PUPPETEER_NO_TIMEOUT',
            severity: 'high',
            file: relFile,
            line: i + 1,
            description: `Puppeteer call without explicit timeout: ${trimmed.slice(0, 80)}`,
            detail: 'Add { timeout: <ms> } option to prevent infinite hangs on network/selector issues.',
          });
        }
        // Only flag once per line even if multiple patterns match
        break;
      }

      // --- BullMQ job add without retry config ---
      if (JOB_ADD_RE.test(raw) || JOB_ADD_BULK_RE.test(raw)) {
        // Collect the call context: current line + next 5 lines
        const callWindow = lines.slice(i, Math.min(i + 6, lines.length)).join('\n');

        const hasRetry = HAS_ATTEMPTS.test(callWindow) || HAS_BACKOFF.test(callWindow);
        if (!hasRetry) {
          breaks.push({
            type: 'JOB_NO_RETRY',
            severity: 'high',
            file: relFile,
            line: i + 1,
            description: `BullMQ job added without retry config: ${trimmed.slice(0, 80)}`,
            detail: 'Pass { attempts: N, backoff: { type: "exponential", delay: ms } } as the third argument to .add().',
          });
        }
      }
    }
  }

  return breaks;
}
