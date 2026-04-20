import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

// ===== Puppeteer timeout patterns =====
// Only methods that actually accept { timeout } in their options object.
// Excluded: page.evaluate() — uses page.setDefaultTimeout(), no per-call option.
// Excluded: page.click() — ClickOptions does not include timeout in puppeteer-core v24.
// Excluded: page.type() — KeyboardTypeOptions does not include timeout.
const PUPPETEER_TIMEOUT_CALLS = [
  /\bpage\.goto\s*\(/,
  /\bpage\.waitForSelector\s*\(/,
  /\bpage\.waitForFunction\s*\(/,
  /\bpage\.waitForNavigation\s*\(/,
];
const HAS_TIMEOUT_IN_CALL = /\btimeout\s*:/;

// ===== BullMQ job add =====
// Matches actual BullMQ queue.add() calls — must be prefixed by a queue-like variable name.
// Excludes Set.add(), Map.set(), Array.push(), DOM operations, etc.
// Pattern: <queueVar>.add('jobName', data, opts?) where queueVar ends in Queue or is a known queue name
const BULLMQ_ADD_RE =
  /\b(\w*[Qq]ueue|this\.\w*[Qq]ueue|flowQueue|autopilotQueue|memoryQueue|voiceQueue|campaignQueue|scraperQueue|mediaQueue|crmQueue|webhookQueue|dlq)\s*\.\s*add\s*\(/;
const BULLMQ_ADD_BULK_RE =
  /\b(\w*[Qq]ueue|this\.\w*[Qq]ueue|flowQueue|autopilotQueue|memoryQueue|voiceQueue|campaignQueue|scraperQueue|mediaQueue|crmQueue|webhookQueue)\s*\.\s*addBulk\s*\(/;
const HAS_ATTEMPTS = /\battempts\s*:/;
const HAS_BACKOFF = /\bbackoff\s*:/;

// ===== Queue-level defaultJobOptions detection =====
// If a queue is instantiated with defaultJobOptions containing attempts, per-job retry is inherited.
const HAS_DEFAULT_JOB_OPTIONS_WITH_RETRY = /defaultJobOptions\s*:\s*\{[^}]*\battempts\s*:/s;

function shouldSkipFile(file: string): boolean {
  return /\.(spec|test)\.(ts|tsx|js|jsx)$|__tests__|__mocks__/.test(file);
}

function isCommentLine(trimmed: string): boolean {
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

export function checkWorkerResilience(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  if (!config.workerDir) {
    return breaks;
  }

  const files = walkFiles(config.workerDir, ['.ts']).filter((f) => !shouldSkipFile(f));

  // Check if queue.ts defines queues with defaultJobOptions retry — if so, per-job retry is inherited
  const queueTsPath = path.join(config.workerDir, 'queue.ts');
  let queueHasDefaultRetry = false;
  try {
    const queueContent = fs.readFileSync(queueTsPath, 'utf8');
    queueHasDefaultRetry = HAS_DEFAULT_JOB_OPTIONS_WITH_RETRY.test(queueContent);
  } catch {
    // queue.ts not found — conservative, will flag per-job missing retry
  }

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
    const hasNewPage =
      content.includes('browser.newPage()') || content.includes('browser?.newPage()');
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

      if (isCommentLine(trimmed)) {
        continue;
      }

      // --- Puppeteer timeout check ---
      for (const callRe of PUPPETEER_TIMEOUT_CALLS) {
        if (!callRe.test(raw)) {
          continue;
        }

        // Check same line and next 4 lines for `timeout:` (larger window for multi-line option objects)
        const window = lines.slice(i, Math.min(i + 5, lines.length)).join(' ');
        if (!HAS_TIMEOUT_IN_CALL.test(window)) {
          breaks.push({
            type: 'PUPPETEER_NO_TIMEOUT',
            severity: 'high',
            file: relFile,
            line: i + 1,
            description: `Puppeteer call without explicit timeout: ${trimmed.slice(0, 80)}`,
            detail:
              'Add { timeout: <ms> } option to prevent infinite hangs on network/selector issues.',
          });
        }
        // Only flag once per line even if multiple patterns match
        break;
      }

      // --- BullMQ job add without retry config ---
      // Only flag actual BullMQ queue.add() calls, not Set.add() or Map.set() etc.
      if (BULLMQ_ADD_RE.test(raw) || BULLMQ_ADD_BULK_RE.test(raw)) {
        // Skip if PULSE:OK annotation is present
        const prevLine = i > 0 ? lines[i - 1].trim() : '';
        if (/PULSE:OK/.test(trimmed) || /PULSE:OK/.test(prevLine)) {
          continue;
        }

        // If queue.ts defines defaultJobOptions with retry, skip — all queues inherit it
        if (queueHasDefaultRetry) {
          continue;
        }

        // Collect the call context: current line + next 6 lines
        const callWindow = lines.slice(i, Math.min(i + 7, lines.length)).join('\n');

        const hasRetry = HAS_ATTEMPTS.test(callWindow) || HAS_BACKOFF.test(callWindow);
        if (!hasRetry) {
          breaks.push({
            type: 'JOB_NO_RETRY',
            severity: 'high',
            file: relFile,
            line: i + 1,
            description: `BullMQ job added without retry config: ${trimmed.slice(0, 80)}`,
            detail:
              'Pass { attempts: N, backoff: { type: "exponential", delay: ms } } as the third argument to .add().',
          });
        }
      }
    }
  }

  return breaks;
}
