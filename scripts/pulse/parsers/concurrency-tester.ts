/**
 * PULSE Parser 84: Concurrency Tester
 * Layer 15: Concurrency & Race Conditions
 * Mode: DEEP/TOTAL (requires running infrastructure)
 *
 * CHECKS:
 * 1. Simultaneous write test: sends 10 concurrent POST/PATCH requests to the same
 *    resource and verifies exactly one succeeds (or all succeed with correct final state)
 * 2. Double-spend prevention: sends 2 concurrent wallet withdrawal requests for the
 *    full balance — verifies only one succeeds (balance never goes negative)
 * 3. Optimistic locking: checks that update operations use version fields or
 *    conditional WHERE clauses to detect concurrent modifications
 * 4. Scans codebase for Prisma update operations on financial records that lack
 *    optimistic locking or transaction isolation
 * 5. Checks for missing SELECT FOR UPDATE / findFirst-then-update patterns
 *    (read-modify-write without lock = classic race condition)
 * 6. Verifies BullMQ job processing uses locks (not processed by multiple workers)
 *
 * REQUIRES: PULSE_DEEP=1, PULSE_CHAOS=1, running backend + DB
 * BREAK TYPES:
 *   RACE_CONDITION_DATA_CORRUPTION(critical) — concurrent writes produce inconsistent state
 *   RACE_CONDITION_FINANCIAL(critical)        — double-spend or negative balance possible
 *   RACE_CONDITION_OVERWRITE(high)            — last-write-wins without version check
 */
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';
import { safeForRegex } from '../lib/safe-regex';

const FINANCIAL_PATH_RE = /checkout|wallet|billing|payment|kloel|commission/i;

// Read-modify-write anti-pattern: findFirst/findUnique followed by update in same function
// without a transaction or lock
const PRISMA_FIND_RE = /\b(?:this\.prisma|prisma|tx)\.[A-Za-z_$]\w*\.(?:findFirst|findUnique)\s*\(/;
const PRISMA_UPDATE_RE = /\b(?:this\.prisma|prisma|tx)\.[A-Za-z_$]\w*\.(?:update|updateMany)\s*\(/;

// Optimistic locking patterns (good)
const OPTIMISTIC_LOCK_RE =
  /version|updatedAt.*where|where.*version|prisma\.\$executeRaw|SELECT\s+FOR\s+UPDATE/i;
const TRANSACTION_RE = /prisma\.\$transaction|\$transaction\s*\(\s*\[/;

type FunctionBlock = {
  start: number;
  lines: string[];
};

function countBraces(line: string): number {
  let depth = 0;
  for (const ch of line) {
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
    }
  }
  return depth;
}

function isFunctionStart(line: string): boolean {
  return /^\s*(?:(?:public|private|protected|static|override|async)\s+)*[A-Za-z_$]\w*\s*\([^)]*\)\s*(?::[^{]+)?\{/.test(
    safeForRegex(line),
  );
}

function extractFunctionBlocks(lines: string[]): FunctionBlock[] {
  const blocks: FunctionBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!isFunctionStart(lines[i])) {
      continue;
    }

    let depth = 0;
    const blockLines: string[] = [];
    for (let j = i; j < lines.length; j++) {
      blockLines.push(lines[j]);
      depth += countBraces(lines[j]);
      if (depth === 0) {
        blocks.push({ start: i, lines: blockLines });
        i = j;
        break;
      }
    }
  }

  return blocks;
}

function hasUnprotectedReadModifyWrite(
  block: FunctionBlock,
): { findLine: number; updateLine: number } | null {
  const body = block.lines.join('\n');
  if (TRANSACTION_RE.test(body) || OPTIMISTIC_LOCK_RE.test(body)) {
    return null;
  }

  let findLine = -1;
  for (let i = 0; i < block.lines.length; i++) {
    const line = block.lines[i];
    if (PRISMA_FIND_RE.test(line)) {
      findLine = i;
    }
    if (findLine >= 0 && PRISMA_UPDATE_RE.test(line)) {
      return { findLine: block.start + findLine + 1, updateLine: block.start + i + 1 };
    }
  }

  return null;
}

function hasDirectBalanceMutationWithoutTransaction(block: FunctionBlock): boolean {
  const body = block.lines.join('\n');
  if (TRANSACTION_RE.test(body)) {
    return false;
  }

  return /\b(?:this\.prisma|prisma)\.[A-Za-z_$]\w*(?:Wallet|wallet|Balance|balance)[A-Za-z_$]\w*\.(?:update|updateMany)\s*\(/.test(
    body,
  );
}

function hasUnprotectedSharedUpdate(block: FunctionBlock): boolean {
  const body = block.lines.join('\n');
  if (TRANSACTION_RE.test(body) || OPTIMISTIC_LOCK_RE.test(body) || /\btx\./.test(body)) {
    return false;
  }
  return hasUnprotectedReadModifyWrite(block) !== null;
}

/** Check concurrency. */
export function checkConcurrency(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // STATIC ANALYSIS: Check for read-modify-write without locking in financial files
  const backendFiles = walkFiles(config.backendDir, ['.ts']);

  for (const file of backendFiles) {
    if (!FINANCIAL_PATH_RE.test(file)) {
      continue;
    }
    if (/\.spec\.ts$|migration|seed/i.test(file)) {
      continue;
    }
    if (!/service/i.test(file)) {
      continue;
    }

    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);
    const lines = content.split('\n');

    const functionBlocks = extractFunctionBlocks(lines);
    for (const block of functionBlocks) {
      const unprotected = hasUnprotectedReadModifyWrite(block);
      if (!unprotected) {
        continue;
      }

      breaks.push({
        type: 'RACE_CONDITION_DATA_CORRUPTION',
        severity: 'critical',
        file: relFile,
        line: unprotected.findLine,
        description:
          'Read-modify-write without transaction or optimistic lock — race condition possible',
        detail: `findFirst/findUnique at line ${unprotected.findLine} followed by update at line ${unprotected.updateLine} without $transaction or version check`,
      });
    }

    // CHECK: Wallet/balance operations without transaction
    if (FINANCIAL_PATH_RE.test(file) && /wallet|balance|saldo/i.test(content)) {
      if (functionBlocks.some(hasDirectBalanceMutationWithoutTransaction)) {
        breaks.push({
          type: 'RACE_CONDITION_FINANCIAL',
          severity: 'critical',
          file: relFile,
          line: 0,
          description:
            'Wallet/balance operations without $transaction — double-spend race condition possible',
          detail:
            'All balance modifications must use prisma.$transaction with SELECT FOR UPDATE or atomic increment',
        });
      }
    }

    // CHECK: Missing optimistic locking on shared resources. Evaluate at function
    // level so transaction-protected financial mutations do not become false positives.
    const unprotectedSharedUpdate = functionBlocks.find(hasUnprotectedSharedUpdate);
    if (unprotectedSharedUpdate) {
      breaks.push({
        type: 'RACE_CONDITION_OVERWRITE',
        severity: 'high',
        file: relFile,
        line: unprotectedSharedUpdate.start + 1,
        description:
          'Update without optimistic lock version check — concurrent updates may silently overwrite each other',
        detail:
          'Add a `version` field or protect the mutation with a transaction/conditional WHERE to detect conflicts',
      });
    }
  }

  // RUNTIME CHECKS (require PULSE_CHAOS=1 + running infrastructure)
  if (process.env.PULSE_CHAOS) {
    // TODO: Implement when infrastructure available
    //
    // CHECK 1 — Simultaneous write test
    // 1. Make 10 concurrent POST /products with same name
    // 2. Verify DB has at most 1 record (unique constraint) or exactly 10 (expected)
    // 3. Verify no 500 errors — unique constraint violations must be caught and returned as 409
    //
    // CHECK 2 — Double-spend wallet test
    // 1. Set wallet balance to R$100
    // 2. Send 2 concurrent withdrawal requests for R$100 each
    // 3. Verify: exactly one succeeds (200), one fails (422 insufficient funds)
    // 4. Verify: final balance is R$0, not R$-100
    //
    // CHECK 6 — BullMQ job lock
    // 1. Start 2 workers consuming same queue
    // 2. Enqueue 1 job
    // 3. Verify: job is processed exactly once (not twice)
  }

  return breaks;
}
