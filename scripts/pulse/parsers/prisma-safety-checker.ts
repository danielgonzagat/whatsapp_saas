import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

// Models that require pagination when queried with findMany
const PAGINATE_SENSITIVE_MODELS = new Set([
  'Message', 'Contact', 'KloelSale', 'WalletTransaction',
  'ChatMessage', 'KloelMessage',
]);

// Financial file path patterns
const FINANCIAL_PATH = /checkout|wallet|payment|billing/i;

// Prisma mutation call patterns
const MUTATION_RE = /\.\s*(?:create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(/g;

/**
 * Extract the body of the function that contains line `targetIdx`.
 * Returns the function body as a string and its start line index.
 * Uses brace-counting; stops when we return to depth 0 after opening.
 */
function extractEnclosingFunction(lines: string[], targetIdx: number): string {
  // Walk backwards to find the nearest function/method declaration
  let funcStart = targetIdx;
  for (let i = targetIdx; i >= Math.max(0, targetIdx - 150); i--) {
    const t = lines[i].trim();
    if (
      /(?:async\s+)?function\s+\w+/.test(t) ||
      /(?:async\s+)?\w+\s*\([^)]*\)\s*(?::\s*\S+\s*)?\{/.test(t) ||
      /(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(/.test(t) ||
      /=>\s*\{/.test(t)
    ) {
      funcStart = i;
      break;
    }
  }

  // Walk forward from funcStart to collect the function body
  let depth = 0;
  let bodyStarted = false;
  let funcEnd = Math.min(lines.length, funcStart + 200);

  for (let i = funcStart; i < Math.min(lines.length, funcStart + 200); i++) {
    for (const ch of lines[i]) {
      if (ch === '{') { depth++; bodyStarted = true; }
      if (ch === '}') depth--;
    }
    if (bodyStarted && depth === 0) { funcEnd = i + 1; break; }
  }

  return lines.slice(funcStart, funcEnd).join('\n');
}

/**
 * Check whether `targetIdx` is inside a try block.
 * Walks backwards up to 20 lines looking for `try {` or `try{`.
 */
function isInsideTry(lines: string[], targetIdx: number): boolean {
  for (let i = targetIdx; i >= Math.max(0, targetIdx - 20); i--) {
    if (/\btry\s*\{/.test(lines[i])) return true;
    // If we hit a catch/finally that closes back to this scope, stop
    if (i < targetIdx && /\}\s*catch\b/.test(lines[i])) return false;
  }
  return false;
}

export function checkPrismaSafety(config: PulseConfig): Break[] {
  const breaks: Break[] = [];
  const files = walkFiles(config.backendDir, ['.ts']);

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

    // Track financial functions we've already reported (avoid duplicate per-function reports)
    const reportedFunctions = new Set<number>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      // ── CHECK 1: deleteMany without where ──────────────────────────────────
      if (/\bdeleteMany\s*\(/.test(trimmed)) {
        // Look forward up to 3 lines for `where:`
        const block = lines.slice(i, Math.min(lines.length, i + 4)).join('\n');
        if (!/\bwhere\s*:/.test(block)) {
          breaks.push({
            type: 'DANGEROUS_DELETE',
            severity: 'critical',
            file: relFile,
            line: i + 1,
            description: 'deleteMany() without where clause — deletes entire table',
            detail: trimmed.slice(0, 120),
          });
        }
      }

      // ── CHECK 2: $queryRaw / $executeRaw with string concatenation ──────────
      if (/\$(?:queryRaw|executeRaw)\s*[(`]/.test(trimmed)) {
        // Dangerous: string concatenation with + or ${} without being a tagged template literal
        // A safe tagged template looks like: prisma.$queryRaw`SELECT ...`
        // Dangerous: prisma.$queryRaw(`SELECT ... ${userInput}`) or prisma.$queryRaw('...' + val)
        const isTaggedTemplate = /\$(?:queryRaw|executeRaw)\s*`/.test(trimmed);
        if (!isTaggedTemplate) {
          // It's called as a function with parens — check for interpolation or concatenation
          const block = lines.slice(i, Math.min(lines.length, i + 5)).join('\n');
          if (/\$\{[\w.[\]'"]+\}|['"`]\s*\+\s*\w/.test(block)) {
            breaks.push({
              type: 'SQL_INJECTION_RISK',
              severity: 'critical',
              file: relFile,
              line: i + 1,
              description: '$queryRaw/$executeRaw with string concatenation — SQL injection risk',
              detail: trimmed.slice(0, 120),
            });
          }
        }
      }

      // ── CHECK 3: Financial files — mutations without $transaction ───────────
      if (isFinancial) {
        // Count Prisma mutation calls in the enclosing function
        if (MUTATION_RE.test(trimmed)) {
          MUTATION_RE.lastIndex = 0; // reset stateful regex

          const funcBody = extractEnclosingFunction(lines, i);
          // Find start line of function to use as dedup key
          const funcStartLine = i - lines.slice(0, i).join('\n').length; // approximate
          // Use a simpler dedup: hash by first 60 chars of funcBody
          const bodyKey = funcBody.slice(0, 60);
          if (reportedFunctions.has(bodyKey.length + i)) {
            // Already reported for this approximate function region
          } else {
            const mutations = funcBody.match(MUTATION_RE);
            MUTATION_RE.lastIndex = 0;
            const mutationCount = mutations ? mutations.length : 0;

            if (mutationCount >= 2 && !/\$transaction\s*\(/.test(funcBody)) {
              reportedFunctions.add(bodyKey.length + i);
              breaks.push({
                type: 'FINANCIAL_NO_TRANSACTION',
                severity: 'critical',
                file: relFile,
                line: i + 1,
                description: `Financial function has ${mutationCount} Prisma mutations without $transaction`,
                detail: trimmed.slice(0, 120),
              });
            }
          }
        }
        MUTATION_RE.lastIndex = 0;
      }

      // ── CHECK 4: $transaction without isolationLevel in financial files ──────
      if (isFinancial && /\$transaction\s*\(/.test(trimmed)) {
        // Look forward 5 lines for isolationLevel
        const block = lines.slice(i, Math.min(lines.length, i + 6)).join('\n');
        if (!/isolationLevel/.test(block)) {
          breaks.push({
            type: 'TRANSACTION_NO_ISOLATION',
            severity: 'high',
            file: relFile,
            line: i + 1,
            description: '$transaction in financial file without isolationLevel specified',
            detail: trimmed.slice(0, 120),
          });
        }
      }

      // ── CHECK 5: findMany without pagination for sensitive models ─────────────
      if (/\bfindMany\s*\(/.test(trimmed)) {
        // Check if the model name is a sensitive one by looking backwards for `this.prisma.ModelName`
        // or `prisma.modelName` in the same line
        const modelMatch = line.match(/\.(\w+)\s*\.\s*findMany\s*\(/);
        if (modelMatch) {
          // Convert accessor name to PascalCase for lookup
          const accessor = modelMatch[1];
          const pascal = accessor.charAt(0).toUpperCase() + accessor.slice(1);
          if (PAGINATE_SENSITIVE_MODELS.has(pascal) || PAGINATE_SENSITIVE_MODELS.has(accessor)) {
            // Look forward 5 lines for take/cursor/first/skip
            const block = lines.slice(i, Math.min(lines.length, i + 6)).join('\n');
            if (!/\btake\s*:|cursor\s*:|first\s*:|skip\s*:/.test(block)) {
              breaks.push({
                type: 'FINDMANY_NO_PAGINATION',
                severity: 'high',
                file: relFile,
                line: i + 1,
                description: `findMany() on ${pascal} without pagination (take/cursor) — unbounded query`,
                detail: trimmed.slice(0, 120),
              });
            }
          }
        }
      }
    }
  }

  // ── CHECK 6: Prisma schema @relation without onDelete ──────────────────────
  // Scan the schema file directly
  if (config.schemaPath && fs.existsSync(config.schemaPath)) {
    let schemaContent: string;
    try {
      schemaContent = fs.readFileSync(config.schemaPath, 'utf8');
    } catch {
      schemaContent = '';
    }

    const schemaLines = schemaContent.split('\n');
    const schemaRelFile = path.relative(config.rootDir, config.schemaPath);

    for (let i = 0; i < schemaLines.length; i++) {
      const line = schemaLines[i];
      // Match lines that have @relation( but NOT onDelete:
      if (/@relation\s*\(/.test(line) && !/onDelete\s*:/.test(line)) {
        // Skip lines that only have @relation(fields: ...) with no onDelete — these are the
        // "owner" side and may be valid without onDelete if it's not a required cascade.
        // But we still flag them for review.
        // Skip if it's just the @relation reference side (no fields:)
        // We flag both sides but only if there's no onDelete anywhere on the line
        breaks.push({
          type: 'RELATION_NO_CASCADE',
          severity: 'medium',
          file: schemaRelFile,
          line: i + 1,
          description: '@relation without onDelete — cascade behavior unspecified',
          detail: line.trim().slice(0, 120),
        });
      }
    }
  }

  return breaks;
}
