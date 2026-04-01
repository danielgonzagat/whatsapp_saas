import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

// Paths that are financially sensitive — unsafe casts here are HIGH severity
const FINANCIAL_PATH_SEGMENTS = [
  'checkout', 'wallet', 'billing', 'payment', 'auth',
];

function isTestFile(filePath: string): boolean {
  return /\.(spec|test)\.ts$|__tests__|__mocks__|\/seed\.|fixture/i.test(filePath);
}

function isFinancialPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return FINANCIAL_PATH_SEGMENTS.some(seg => lower.includes(`/${seg}`));
}

export function checkTypeSafety(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const files = walkFiles(config.backendDir, ['.ts']).filter(f => !isTestFile(f));

  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);
    const isFinancial = isFinancialPath(file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip full-line comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      // Only check the code portion (before any inline comment)
      // Simple heuristic: split on // that isn't inside a string
      const codePart = stripInlineComment(line);

      // ---- Financial/auth paths: ` as any` is HIGH severity ----
      // Match " as any" with a space before "as" to avoid "isAny", "hasAny", etc.
      if (isFinancial && / as any\b/.test(codePart)) {
        breaks.push({
          type: 'UNSAFE_ANY_CAST',
          severity: 'high',
          file: relFile,
          line: i + 1,
          description: '`as any` cast in financial/auth code — type safety bypassed',
          detail: trimmed.slice(0, 120),
        });
        continue; // Don't double-report
      }

      // ---- All backend: this.prismaAny. or (this.prisma as any) ----
      if (/this\.prismaAny\./.test(codePart) || /\(this\.prisma\s+as\s+any\)/.test(codePart)) {
        breaks.push({
          type: 'UNSAFE_ANY_CAST',
          severity: 'medium',
          file: relFile,
          line: i + 1,
          description: 'Prisma accessed via untyped `prismaAny` or `as any` cast — migrate to typed `this.prisma`',
          detail: trimmed.slice(0, 120),
        });
      }
    }
  }

  return breaks;
}

/**
 * Strip an inline comment from a line of TypeScript code.
 * Very conservative: only strips `//` that appears outside of string literals.
 */
function stripInlineComment(line: string): string {
  let inStr: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inStr) {
      if (ch === inStr && line[i - 1] !== '\\') inStr = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
    } else if (ch === '/' && line[i + 1] === '/') {
      return line.slice(0, i);
    }
  }
  return line;
}
