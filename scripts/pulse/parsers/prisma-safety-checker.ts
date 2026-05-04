import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { pathExists, readTextFile } from '../safe-fs';

const PRISMA_SAFETY_BREAK_TYPE_GRAMMAR = {
  dangerousDelete: 'DANGEROUS_DELETE',
  findManyNoPagination: 'FINDMANY_NO_PAGINATION',
  mutatingTransactionNoIsolation: 'TRANSACTION_NO_ISOLATION',
  rawSqlInjectionRisk: 'SQL_INJECTION_RISK',
  relationNoCascade: 'RELATION_NO_CASCADE',
  stateMutationNoTransaction: 'FINANCIAL_NO_TRANSACTION',
};

// Prisma mutation call patterns — matches Prisma model mutations.
// Must be preceded by a word boundary (model accessor), NOT a method chain on non-Prisma objects.
// Excludes: .update(payload), .update(buffer), .create(cert), .delete() on non-Prisma objects.
// A Prisma call is: this.prisma.model.create({) or tx.model.create({ — always followed by ({
const PRISMA_MUTATION_CALL_KERNEL_GRAMMAR =
  /\.\s*(?:create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(\s*\{/g;
const PRISMA_TRANSACTION_MUTATION_KERNEL_GRAMMAR =
  /\.\s*(?:create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(/;

interface PrismaSchemaEvidence {
  atomicWriteAccessors: Set<string>;
  paginationAccessors: Set<string>;
}

function prismaAccessorForModel(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

function collectPrismaSchemaEvidence(schemaPath: string | undefined): PrismaSchemaEvidence {
  const emptyEvidence: PrismaSchemaEvidence = {
    atomicWriteAccessors: new Set(),
    paginationAccessors: new Set(),
  };
  if (!schemaPath || !pathExists(schemaPath)) {
    return emptyEvidence;
  }

  let schemaContent: string;
  try {
    schemaContent = readTextFile(schemaPath, 'utf8');
  } catch {
    return emptyEvidence;
  }

  const modelBlockKernelGrammar = /\bmodel\s+([A-Za-z]\w*)\s*\{([\s\S]*?)\n\s*\}/g;
  for (const match of schemaContent.matchAll(modelBlockKernelGrammar)) {
    const modelName = match[1];
    const modelBody = match[2] ?? '';
    if (!modelName) {
      continue;
    }

    const accessor = prismaAccessorForModel(modelName);
    emptyEvidence.paginationAccessors.add(accessor);

    const fieldLines = modelBody
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('//'));
    const hasAtomicStateShape = fieldLines.some(
      (line) =>
        /\b(?:Decimal|BigInt|Json|DateTime)\b/.test(line) ||
        /@relation\b/.test(line) ||
        /@@(?:unique|index)\b/.test(line),
    );
    if (hasAtomicStateShape) {
      emptyEvidence.atomicWriteAccessors.add(accessor);
    }
  }

  return emptyEvidence;
}

function collectMutatedPrismaAccessors(content: string): Set<string> {
  const accessors = new Set<string>();
  const mutationAccessorKernelGrammar =
    /\.([A-Za-z_$][A-Za-z0-9_$]*)\s*\.\s*(?:create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(/g;
  for (const match of content.matchAll(mutationAccessorKernelGrammar)) {
    if (match[1]) {
      accessors.add(match[1]);
    }
  }
  return accessors;
}

function hasAtomicWriteEvidence(content: string, schemaEvidence: PrismaSchemaEvidence): boolean {
  const mutatedAccessors = collectMutatedPrismaAccessors(content);
  for (const accessor of mutatedAccessors) {
    if (schemaEvidence.atomicWriteAccessors.has(accessor)) {
      return true;
    }
  }
  return false;
}

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

function collectTransactionIsolationOptionAliases(content: string): Set<string> {
  const aliases = new Set<string>();
  const optionRe = /const\s+([A-Za-z_$]\w*)\s*=\s*\{[\s\S]{0,800}?\bisolationLevel\s*:/g;
  for (const match of content.matchAll(optionRe)) {
    if (match[1]) {
      aliases.add(match[1]);
    }
  }
  return aliases;
}

function extractTransactionCallBlock(lines: string[], startIdx: number): string {
  const collected: string[] = [];
  let depth = 0;
  let sawOpen = false;

  for (let i = startIdx; i < Math.min(lines.length, startIdx + 240); i++) {
    const line = lines[i];
    collected.push(line);
    for (const ch of line) {
      if (ch === '(') {
        depth += 1;
        sawOpen = true;
      } else if (ch === ')') {
        depth -= 1;
      }
    }
    if (sawOpen && depth <= 0) {
      break;
    }
  }

  return collected.join('\n');
}

function transactionHasIsolation(block: string, aliases: Set<string>): boolean {
  if (/\bisolationLevel\s*:/.test(block)) {
    return true;
  }
  const identifiers = new Set(block.match(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g) || []);
  for (const alias of aliases) {
    if (identifiers.has(alias)) {
      return true;
    }
  }
  return false;
}

function transactionWritesState(block: string): boolean {
  PRISMA_TRANSACTION_MUTATION_KERNEL_GRAMMAR.lastIndex = 0;
  return PRISMA_TRANSACTION_MUTATION_KERNEL_GRAMMAR.test(block);
}

/**
 * Check whether `targetIdx` is inside a try block.
 * Walks backwards up to 20 lines looking for `try {` or `try{`.
 */
function isInsideTry(lines: string[], targetIdx: number): boolean {
  for (let i = targetIdx; i >= Math.max(0, targetIdx - 20); i--) {
    if (lines[i].includes('try {') || lines[i].includes('try{')) {
      return true;
    }
    // If we hit a catch/finally that closes back to this scope, stop
    if (i < targetIdx && (lines[i].includes('} catch') || lines[i].includes('}catch'))) {
      return false;
    }
  }
  return false;
}

/** Check prisma safety. */
export function checkPrismaSafety(config: PulseConfig): Break[] {
  const breaks: Break[] = [];
  const files = walkFiles(config.backendDir, ['.ts']);
  const schemaEvidence = collectPrismaSchemaEvidence(config.schemaPath);

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
    const isolationOptionAliases = collectTransactionIsolationOptionAliases(content);
    const hasAtomicWrites = hasAtomicWriteEvidence(content, schemaEvidence);

    // Track mutating functions we've already reported (avoid duplicate per-function reports)
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
              type: PRISMA_SAFETY_BREAK_TYPE_GRAMMAR.dangerousDelete,
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
              type: PRISMA_SAFETY_BREAK_TYPE_GRAMMAR.rawSqlInjectionRisk,
              severity: 'critical',
              file: relFile,
              line: i + 1,
              description: '$queryRaw/$executeRaw with string concatenation — SQL injection risk',
              detail: trimmed.slice(0, 120),
            });
          }
        }
      }

      // ── CHECK 3: Atomic state files — mutations without $transaction ───────
      if (hasAtomicWrites) {
        // Count Prisma mutation calls in the enclosing function
        if (PRISMA_MUTATION_CALL_KERNEL_GRAMMAR.test(trimmed)) {
          PRISMA_MUTATION_CALL_KERNEL_GRAMMAR.lastIndex = 0; // reset stateful regex

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
            PRISMA_MUTATION_CALL_KERNEL_GRAMMAR.lastIndex = 0;
            continue;
          }

          const funcBody = extractEnclosingFunction(lines, i);
          // Use a simpler dedup: hash by first 60 chars of funcBody
          const bodyKey = funcBody.slice(0, 60);
          if (reportedFunctions.has(bodyKey.length + i)) {
            // Already reported for this approximate function region
          } else {
            const mutations = funcBody.match(PRISMA_MUTATION_CALL_KERNEL_GRAMMAR);
            PRISMA_MUTATION_CALL_KERNEL_GRAMMAR.lastIndex = 0;
            const mutationCount = mutations ? mutations.length : 0;

            if (mutationCount >= 2 && !/\$transaction\s*\(/.test(funcBody)) {
              reportedFunctions.add(bodyKey.length + i);
              breaks.push({
                type: PRISMA_SAFETY_BREAK_TYPE_GRAMMAR.stateMutationNoTransaction,
                severity: 'critical',
                file: relFile,
                line: i + 1,
                description: `State-mutating function has ${mutationCount} Prisma mutations without $transaction`,
                detail: trimmed.slice(0, 120),
              });
            }
          }
        }
        PRISMA_MUTATION_CALL_KERNEL_GRAMMAR.lastIndex = 0;
      }

      // ── CHECK 4: mutating $transaction without isolationLevel ───────────────
      if (hasAtomicWrites && /\$transaction\s*\(/.test(trimmed)) {
        // Skip if PULSE:OK annotation on this or preceding line
        const prevLineCheck = i > 0 ? lines[i - 1] : '';
        if (/PULSE:OK/.test(trimmed) || /PULSE:OK/.test(prevLineCheck)) {
          continue;
        }

        const block = extractTransactionCallBlock(lines, i);
        if (!transactionWritesState(block)) {
          continue;
        }
        if (!transactionHasIsolation(block, isolationOptionAliases)) {
          breaks.push({
            type: PRISMA_SAFETY_BREAK_TYPE_GRAMMAR.mutatingTransactionNoIsolation,
            severity: 'high',
            file: relFile,
            line: i + 1,
            description: 'State-mutating $transaction without isolationLevel specified',
            detail: trimmed.slice(0, 120),
          });
        }
      }

      // ── CHECK 5: findMany without pagination for schema-discovered models ───
      if (/\bfindMany\s*\(/.test(trimmed)) {
        // Check if the model name is known by schema evidence by looking backwards for `this.prisma.ModelName`
        // or `prisma.modelName` in the same line
        const modelMatch = line.match(/\.(\w+)\s*\.\s*findMany\s*\(/);
        if (modelMatch) {
          const accessor = modelMatch[1];
          if (schemaEvidence.paginationAccessors.has(accessor)) {
            // Look forward for take/cursor/first/skip (findMany blocks can be large with select/include).
            const block = lines.slice(i, Math.min(lines.length, i + 31)).join('\n');
            if (!/\btake\s*:|cursor\s*:|first\s*:|skip\s*:/.test(block)) {
              breaks.push({
                type: PRISMA_SAFETY_BREAK_TYPE_GRAMMAR.findManyNoPagination,
                severity: 'high',
                file: relFile,
                line: i + 1,
                description: `findMany() on ${accessor} without pagination (take/cursor) — unbounded query`,
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
          type: PRISMA_SAFETY_BREAK_TYPE_GRAMMAR.relationNoCascade,
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
