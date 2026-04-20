import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

// Variable name patterns that suggest sensitive data
const SENSITIVE_VAR_PATTERN =
  /\b(?:password|passwd|pwd|token|secret|apiKey|api_key|creditCard|credit_card|cvv|cvc|authorization|authToken|auth_token|privateKey|private_key|accessToken|access_token|refreshToken|refresh_token)\b/i;

// Log call patterns
const LOG_CALL_PATTERN = /(?:this\.logger\.\w+|console\.(?:log|error|warn|info|debug))\s*\(/;

// HttpException leak patterns — only flag when the exception message directly uses error internals
const HTTP_EXCEPTION_LEAK_PATTERN =
  /throw\s+new\s+HttpException\s*\(\s*(?:error|err)\.(?:message|stack)\b/;

function shouldSkipFile(file: string): boolean {
  return /\.(spec|test)\.ts$|__tests__|__mocks__|\/seed\.|\/migration\.|fixture/i.test(file);
}

/** Check sensitive data. */
export function checkSensitiveData(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const files = walkFiles(config.backendDir, ['.ts']).filter((f) => !shouldSkipFile(f));

  for (const file of files) {
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

      // Skip comment lines
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      // Check: logging statement that references a sensitive variable name
      if (LOG_CALL_PATTERN.test(line) && SENSITIVE_VAR_PATTERN.test(line)) {
        // Extra filter: avoid false positives where sensitive word is in a static string label
        // e.g. this.logger.log('Password updated') — the word appears only inside a string
        // Heuristic: if the sensitive word appears OUTSIDE a string literal, flag it
        // We strip string literals and check again
        const strippedLine = line
          .replace(/'[^']*'/g, "''")
          .replace(/"[^"]*"/g, '""')
          .replace(/`[^`]*`/g, '``');

        if (SENSITIVE_VAR_PATTERN.test(strippedLine)) {
          breaks.push({
            type: 'SENSITIVE_DATA_IN_LOG',
            severity: 'critical',
            file: relFile,
            line: i + 1,
            description: 'Sensitive variable (password/token/secret/etc.) may be logged',
            detail: trimmed.slice(0, 120),
          });
        }
      }

      // Check: HttpException exposing raw error internals
      if (HTTP_EXCEPTION_LEAK_PATTERN.test(line)) {
        breaks.push({
          type: 'INTERNAL_ERROR_EXPOSED',
          severity: 'high',
          file: relFile,
          line: i + 1,
          description: 'HttpException exposes raw error.message or error.stack to clients',
          detail: trimmed.slice(0, 120),
        });
      }
    }
  }

  return breaks;
}
