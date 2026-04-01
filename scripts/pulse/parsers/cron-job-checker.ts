import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

function shouldSkipFile(filePath: string): boolean {
  return /\.(spec|test|d)\.ts$|__tests__|__mocks__|\/seed\.|\/migration\.|fixture/i.test(filePath);
}

/**
 * Given the lines array and the index of the @Cron/@Interval decorator line,
 * find the opening brace of the method body and return the next N lines inside it.
 */
function extractMethodBody(lines: string[], decoratorIdx: number, maxLines = 20): string[] {
  // Walk forward from the decorator to find the method opening brace '{'
  let braceIdx = -1;
  for (let i = decoratorIdx; i < Math.min(decoratorIdx + 10, lines.length); i++) {
    if (lines[i].includes('{')) {
      braceIdx = i;
      break;
    }
  }
  if (braceIdx === -1) return [];

  return lines.slice(braceIdx + 1, Math.min(braceIdx + 1 + maxLines, lines.length));
}

/**
 * Returns true if the body lines contain at least one meaningful statement
 * (i.e., not just whitespace, comments, or closing braces).
 */
function hasMeaningfulStatement(bodyLines: string[]): boolean {
  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (
      trimmed === '' ||
      trimmed === '}' ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*/')
    ) {
      continue;
    }
    return true;
  }
  return false;
}

/**
 * Returns true if the body lines contain a try/catch block.
 */
function hasTryCatch(bodyLines: string[]): boolean {
  return bodyLines.some(line => /\btry\s*\{/.test(line));
}

export function checkCronJobs(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const files = walkFiles(config.backendDir, ['.ts']).filter(f => !shouldSkipFile(f));

  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    // Quick pre-check: skip files without cron decorators
    if (!/@Cron\(|@Interval\(/.test(content)) continue;

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // Detect @Cron( or @Interval( decorator lines
      if (!/@Cron\s*\(|@Interval\s*\(/.test(trimmed)) continue;

      // Skip comment lines
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      const decoratorLine = i + 1; // 1-based

      const bodyLines = extractMethodBody(lines, i);

      // Check 1: empty method body
      if (!hasMeaningfulStatement(bodyLines)) {
        breaks.push({
          type: 'CRON_NO_HANDLER',
          severity: 'medium',
          file: relFile,
          line: decoratorLine,
          description: 'Cron/Interval decorated method has an empty or comment-only body',
          detail: `${trimmed.slice(0, 120)} — the scheduled method appears to have no implementation.`,
        });
        // Still check for try/catch below
      }

      // Check 2: no try/catch error handling
      if (hasMeaningfulStatement(bodyLines) && !hasTryCatch(bodyLines)) {
        breaks.push({
          type: 'CRON_NO_ERROR_HANDLING',
          severity: 'medium',
          file: relFile,
          line: decoratorLine,
          description: 'Cron/Interval method has no try/catch — unhandled errors will crash the job silently',
          detail: `${trimmed.slice(0, 120)} — wrap the method body in try/catch and log failures.`,
        });
      }
    }
  }

  return breaks;
}
