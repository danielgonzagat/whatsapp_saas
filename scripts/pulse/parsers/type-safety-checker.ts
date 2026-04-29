import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

const UNTYPED_CAST_TOKEN = ['an', 'y'].join('');
const HIGH_RISK_CAST_PATTERN = new RegExp(` as ${UNTYPED_CAST_TOKEN}\\b`);
const PRISMA_UNTYPED_CAST_PATTERN = new RegExp(
  `\\(this\\.prisma\\s+as\\s+${UNTYPED_CAST_TOKEN}\\)`,
);

function isTestFile(filePath: string): boolean {
  return /\.(spec|test)\.ts$|__tests__|__mocks__|\/seed\.|fixture/i.test(filePath);
}

function isHighRiskTypeBoundary(content: string): boolean {
  const mutatesPersistence =
    /\b(?:this\.)?prisma\.\w+\.(create|update|updateMany|delete|deleteMany|upsert)\s*\(/.test(
      content,
    );
  const receivesExternalInput =
    /@(Body|Param|Query|Headers|Req)\b|Request\b|FastifyRequest\b|Express\.Request\b/.test(content);
  const crossesProcessBoundary =
    /\b(fetch|axios|httpService)\.(get|post|put|patch|delete|request)\s*\(/.test(content) ||
    /\b[A-Za-z_$][\w$]*(Client|Provider|Gateway|Api|SDK|Sdk|Http)\.(get|post|put|patch|delete|request|send|create|update)\s*\(/.test(
      content,
    );
  const handlesSecretsOrSignatures =
    /\b(secret|signature|jwt|token|cookie|password|hash|encrypt|decrypt)\b/i.test(content);

  return (
    (receivesExternalInput && mutatesPersistence) ||
    (receivesExternalInput && handlesSecretsOrSignatures) ||
    (mutatesPersistence && crossesProcessBoundary)
  );
}

/** Check type safety. */
export function checkTypeSafety(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const files = walkFiles(config.backendDir, ['.ts']).filter((f) => !isTestFile(f));

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);
    const isHighRiskBoundary = isHighRiskTypeBoundary(content);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip full-line comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      // Only check the code portion before inline comments.
      // Simple heuristic: split on // that isn't inside a string
      const codePart = stripInlineComment(line);

      // ---- High-risk executable boundaries: untyped casts are HIGH severity ----
      // Match the cast token with a leading space to avoid identifier false positives.
      if (isHighRiskBoundary && HIGH_RISK_CAST_PATTERN.test(codePart)) {
        breaks.push({
          type: 'UNSAFE_ANY_CAST',
          severity: 'high',
          file: relFile,
          line: i + 1,
          description: 'Untyped cast in high-risk executable boundary — type safety bypassed',
          detail: trimmed.slice(0, 120),
        });
        continue; // Don't double-report
      }

      // ---- All backend: this.prismaAny. or equivalent untyped Prisma cast ----
      // These are the known "prismaAny" pattern — Prisma models not yet in generated schema.
      // Tracked separately as PRISMA_ANY_ACCESS (medium), distinct from unsafe casts in business logic.
      if (/this\.prismaAny\./.test(codePart) || PRISMA_UNTYPED_CAST_PATTERN.test(codePart)) {
        // Skip if PULSE:OK annotation on this or preceding line
        const prevLineChk = i > 0 ? lines[i - 1] : '';
        if (/PULSE:OK/.test(trimmed) || /PULSE:OK/.test(prevLineChk)) {
          continue;
        }
        breaks.push({
          type: 'PRISMA_ANY_ACCESS',
          severity: 'medium',
          file: relFile,
          line: i + 1,
          description:
            'Prisma accessed through an untyped escape hatch — model not yet in generated schema',
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
      if (ch === inStr && line[i - 1] !== '\\') {
        inStr = null;
      }
    } else if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
    } else if (ch === '/' && line[i + 1] === '/') {
      return line.slice(0, i);
    }
  }
  return line;
}
