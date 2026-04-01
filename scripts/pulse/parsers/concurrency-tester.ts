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
import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

const FINANCIAL_PATH_RE = /checkout|wallet|billing|payment|kloel|commission/i;

// Read-modify-write anti-pattern: findFirst/findUnique followed by update in same function
// without a transaction or lock
const FIND_THEN_UPDATE_RE = /findFirst|findUnique/;
const UPDATE_RE = /\.update\s*\(|\.updateMany\s*\(/;

// Optimistic locking patterns (good)
const OPTIMISTIC_LOCK_RE = /version|updatedAt.*where|where.*version|prisma\.\$executeRaw|SELECT\s+FOR\s+UPDATE/i;
const TRANSACTION_RE = /prisma\.\$transaction|\$transaction\s*\(\s*\[/;

export function checkConcurrency(config: PulseConfig): Break[] {
  if (!process.env.PULSE_DEEP) return [];
  const breaks: Break[] = [];

  // STATIC ANALYSIS: Check for read-modify-write without locking in financial files
  const backendFiles = walkFiles(config.backendDir, ['.ts']);

  for (const file of backendFiles) {
    if (!FINANCIAL_PATH_RE.test(file)) continue;
    if (/\.spec\.ts$|migration|seed/i.test(file)) continue;
    if (!/service/i.test(file)) continue;

    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);
    const lines = content.split('\n');

    // Scan function bodies for findFirst/findUnique + update without transaction
    let inFunction = false;
    let functionStart = 0;
    let braceDepth = 0;
    let foundFind = false;
    let foundFindLine = 0;
    let hasTransaction = false;
    let hasOptimisticLock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track brace depth to find function boundaries
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;

      if (/async\s+\w+\s*\(/.test(line) && !inFunction) {
        inFunction = true;
        functionStart = i;
        foundFind = false;
        hasTransaction = false;
        hasOptimisticLock = false;
      }

      if (inFunction) {
        if (FIND_THEN_UPDATE_RE.test(line)) {
          foundFind = true;
          foundFindLine = i;
        }
        if (TRANSACTION_RE.test(line)) hasTransaction = true;
        if (OPTIMISTIC_LOCK_RE.test(line)) hasOptimisticLock = true;

        if (UPDATE_RE.test(line) && foundFind && !hasTransaction && !hasOptimisticLock) {
          // Found a read-modify-write pattern without protection
          breaks.push({
            type: 'RACE_CONDITION_DATA_CORRUPTION',
            severity: 'critical',
            file: relFile,
            line: foundFindLine + 1,
            description: 'Read-modify-write without transaction or optimistic lock — race condition possible',
            detail: `findFirst/findUnique at line ${foundFindLine + 1} followed by update at line ${i + 1} without $transaction or version check`,
          });
          foundFind = false; // Reset to avoid duplicate reports per function
        }

        // End of function (approximate)
        if (braceDepth <= 0 && i > functionStart) {
          inFunction = false;
          foundFind = false;
        }
      }
    }

    // CHECK: Wallet/balance operations without transaction
    if (FINANCIAL_PATH_RE.test(file) && /wallet|balance|saldo/i.test(content)) {
      if (!TRANSACTION_RE.test(content)) {
        breaks.push({
          type: 'RACE_CONDITION_FINANCIAL',
          severity: 'critical',
          file: relFile,
          line: 0,
          description: 'Wallet/balance operations without $transaction — double-spend race condition possible',
          detail: 'All balance modifications must use prisma.$transaction with SELECT FOR UPDATE or atomic increment',
        });
      }
    }

    // CHECK: Missing optimistic locking on shared resources
    if (/\.update\s*\(/.test(content) && !/version|@@unique|@@index/i.test(content)) {
      // Check if this file updates a model without version field (requires schema cross-ref)
      // Simplified: flag if update targets a resource without any version/updatedAt condition
      const updatePatterns = content.match(/update\s*\(\s*\{[^}]{0,200}where/g) || [];
      for (const updatePattern of updatePatterns) {
        if (!/version|updatedAt/i.test(updatePattern)) {
          breaks.push({
            type: 'RACE_CONDITION_OVERWRITE',
            severity: 'high',
            file: relFile,
            line: 0,
            description: 'Update without optimistic lock version check — concurrent updates may silently overwrite each other',
            detail: 'Add a `version` field to the model and use `where: { id, version: current.version }` to detect conflicts',
          });
          break; // One report per file
        }
      }
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
