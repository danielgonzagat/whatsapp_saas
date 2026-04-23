import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { pathExists, readTextFile } from '../safe-fs';

// Models that require pagination when queried with findMany
const PAGINATE_SENSITIVE_MODELS = new Set([
  'Message',
  'Contact',
  'KloelSale',
  'WalletTransaction',
  'ChatMessage',
  'KloelMessage',
]);

// Financial file path patterns
const FINANCIAL_PATH = /checkout|wallet|payment|billing/i;

// Prisma mutation call patterns — matches Prisma model mutations.
// Must be preceded by a word boundary (model accessor), NOT a method chain on non-Prisma objects.
// Excludes: .update(payload), .update(buffer), .create(cert), .delete() on non-Prisma objects.
// A Prisma call is: this.prisma.model.create({) or tx.model.create({ — always followed by ({
const MUTATION_RE =
  /\.\s*(?:create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(\s*\{/g;

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
      if (ch === '{') {
        depth++;
        bodyStarted = true;
      }
      if (ch === '}') {
        depth--;
      }
    }
    if (bodyStarted && depth === 0) {
      funcEnd = i + 1;
      break;
    }
  }

  return lines.slice(funcStart, funcEnd).join('\n');
}

/**
 * Check whether `targetIdx` is inside a try block.
 * Walks backwards up to 20 lines looking for `try {` or `try{`.
 */
function isInsideTry(lines: string[], targetIdx: number): boolean {
  for (let i = targetIdx; i >= Math.max(0, targetIdx - 20); i--) {
    if (/\btry\s*\{/.test(lines[i])) {
      return true;
    }
    // If we hit a catch/finally that closes back to this scope, stop
    if (i < targetIdx && /\}\s*catch\b/.test(lines[i])) {
      return false;
    }
  }
  return false;
}

/** Check prisma safety. */
export function checkPrismaSafety(config: PulseConfig): Break[] {
  const breaks: Break[] = [];
  const files = walkFiles(config.backendDir, ['.ts']);

  for (const file of files) {
    // Skip test/spec/seed/migration/mock files
    if (/\.(test|spec|d)\.ts$|seed|migration|fixture|mock\./i.test(file)) {
      continue;
    }

    let content: string;
    try {
      content = readTextFile(file, 'utf8');
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
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      // ── CHECK 1: deleteMany without where ──────────────────────────────────
      if (/\bdeleteMany\s*\(/.test(trimmed)) {
        // Skip interface/type definitions (e.g., deleteMany(args: ...) → Promise<...>)
        const isTypeDefinition =
          /\bdeleteMany\s*\(\s*\w+\s*:.*\)\s*:/.test(trimmed) ||
          /\bdeleteMany\s*\(\s*\w+\s*:.*Promise/.test(trimmed);
        if (!isTypeDefinition) {
          // Look forward up to 3 lines for `where:` or JS shorthand `{ where }` or `{ where,`
          const block = lines.slice(i, Math.min(lines.length, i + 4)).join('\n');
          const hasWhere =
            /\bwhere\s*:/.test(block) ||
            /\{\s*where\s*[,}]/.test(block) ||
            /\bwhere\s*\}/.test(block);
          if (!hasWhere) {
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

          // First: check if this line is already inside a $transaction callback.
          // Strategy: look backwards up to 100 lines. If we find $transaction( before
          // we find the start of a top-level class method (identified by indentation
          // level == 2 spaces / method declaration pattern), we're inside a transaction.
          let isInsideTransaction = false;
          for (let j = i - 1; j >= Math.max(0, i - 100); j--) {
            const jLine = lines[j];
            const jt = jLine.trim();
            // If we hit a $transaction( or $transaction([, we're inside one
            if (/\$transaction\s*\(/.test(jt)) {
              isInsideTransaction = true;
              break;
            }
            // Stop at top-level class method boundaries:
            // A method is at indentation 2 (2 spaces) and starts with async/public/private/protected or name(
            const indent = jLine.match(/^(\s*)/)?.[1].length ?? 0;
            if (
              indent <= 2 &&
              /^(?:async\s+|public\s+|private\s+|protected\s+|override\s+)?(?:async\s+)?\w+\s*\(/.test(
                jt,
              ) &&
              !/=>\s*/.test(jt)
            ) {
              break;
            }
          }
          if (isInsideTransaction) {
            MUTATION_RE.lastIndex = 0;
            continue;
          }

          const funcBody = extractEnclosingFunction(lines, i);
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
        // Skip if PULSE:OK annotation on this or preceding line
        const prevLineCheck = i > 0 ? lines[i - 1] : '';
        if (/PULSE:OK/.test(trimmed) || /PULSE:OK/.test(prevLineCheck)) {
          continue;
        }

        // Batch-form $transaction([...]) takes no options — skip it
        // Batch form: $transaction([ or $transaction(\n  [
        const isBatchForm =
          /\$transaction\s*\(\s*\[/.test(trimmed) || (lines[i + 1] && /^\s*\[/.test(lines[i + 1]));
        if (!isBatchForm) {
          // Look forward 5 lines for isolationLevel (inline comment or option object)
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
            // Look forward 15 lines for take/cursor/first/skip (findMany blocks can be large with select/include)
            const block = lines.slice(i, Math.min(lines.length, i + 16)).join('\n');
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
  if (config.schemaPath && pathExists(config.schemaPath)) {
    let schemaContent: string;
    try {
      schemaContent = readTextFile(config.schemaPath, 'utf8');
    } catch {
      schemaContent = '';
    }

    const schemaLines = schemaContent.split('\n');
    const schemaRelFile = path.relative(config.rootDir, config.schemaPath);

    for (let i = 0; i < schemaLines.length; i++) {
      const line = schemaLines[i];
      // Match lines that have @relation( with fields: (owning side) but NOT onDelete:
      // The back-reference side (array side, no fields:) never carries onDelete in Prisma.
      // Only flag the owning side: lines that contain both @relation( AND fields: AND lack onDelete.
      if (/@relation\s*\(/.test(line) && /fields\s*:/.test(line) && !/onDelete\s*:/.test(line)) {
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
