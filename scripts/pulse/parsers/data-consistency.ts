/**
 * PULSE Parser 63: Data Consistency
 * Layer 7: Database Health
 * Mode: STATIC (source code pattern analysis — no DB access needed)
 *
 * CHECKS:
 * Verify business rule consistency enforcement in financial service code.
 * These are rules that foreign keys cannot enforce — they require application-level logic.
 * This static checker looks for the ABSENCE of validation guards before financial mutations.
 *
 * Product rules:
 * 1. Every published Product must have at least one active Plan
 *    → Products with status=PUBLISHED and zero Plans → DATA_PRODUCT_NO_PLAN
 * 2. Every Plan must have a price > 0
 *    → Plans with price <= 0 → data consistency violation
 * 3. Every Product with checkoutEnabled=true must have Asaas config (apiKey or linked account)
 *
 * Order rules:
 * 4. Every Order with status=PAID must have a corresponding Payment with status=CONFIRMED
 *    → PAID Orders without confirmed Payment → DATA_ORDER_NO_PAYMENT
 * 5. Every Order amount must match the Plan price (minus coupon discount if applied)
 *    → Orders where amount != plan.price - couponDiscount → arithmetic inconsistency
 * 6. Every Order must belong to a Workspace that owns the Product ordered
 *    → Cross-workspace orders → critical data inconsistency
 *
 * Workspace rules:
 * 7. Every Workspace must have exactly one OWNER member
 *    → Workspaces with zero OWNER members → DATA_WORKSPACE_NO_OWNER
 * 8. Workspaces with multiple OWNER members → flag (may be intentional or bug)
 * 9. Every Workspace must have a Wallet record
 *    → Workspaces without Wallet → financial operations will fail
 *
 * STATIC APPROACH:
 * Look for the pattern: financial .create() / .update() WITHOUT a prior .findFirst() / .findUnique()
 * in the same function body. This indicates an operation that does not validate existence first.
 *
 * BREAK TYPES:
 * - DATA_PRODUCT_NO_PLAN (high) — checkout service creates order without validating plan exists
 * - DATA_ORDER_NO_PAYMENT (high) — payment webhook marks order paid without confirming payment record
 * - DATA_WORKSPACE_NO_OWNER (high) — workspace creation does not enforce owner member creation
 */

import * as path from 'path';
import { walkFiles, readFileSafe } from './utils';
import type { Break, PulseConfig } from '../types';

// Financial service files to check
const FINANCIAL_SERVICE_PATTERNS = [
  /checkout.*\.service\.ts$/i,
  /wallet.*\.service\.ts$/i,
  /billing.*\.service\.ts$/i,
  /payment.*\.service\.ts$/i,
  /order.*\.service\.ts$/i,
  /stripe.*\.service\.ts$/i,
];

const CREATE_OPERATION_TOKENS = ['.create(', '.createMany(', '.upsert('];

// Keywords that indicate existence validation before create
const VALIDATION_READS = ['findFirst(', 'findUnique(', 'findMany(', 'count('];

/**
 * Extract function bodies from TypeScript source.
 * Simple heuristic: find async method declarations and track brace depth.
 */
function extractFunctionBodies(
  content: string,
): Array<{ name: string; body: string; startLine: number }> {
  const functions: Array<{ name: string; body: string; startLine: number }> = [];
  const lines = content.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Match async method declarations
    const methodMatch = line.match(/^\s+(?:async\s+)?(\w+)\s*\([^)]*\).*\{?\s*$/);
    if (methodMatch && /async/.test(line)) {
      const name = methodMatch[1];
      const startLine = i + 1;
      // Collect the function body
      let braceDepth = 0;
      let body = '';
      let j = i;
      let started = false;
      while (j < lines.length) {
        const l = lines[j];
        for (const ch of l) {
          if (ch === '{') {
            braceDepth++;
            started = true;
          }
          if (ch === '}') {
            braceDepth--;
          }
        }
        body += l + '\n';
        if (started && braceDepth === 0) {
          break;
        }
        j++;
      }
      if (body.length > 20) {
        functions.push({ name, body, startLine });
      }
      i = j + 1;
    } else {
      i++;
    }
  }
  return functions;
}

/**
 * Check if a function body performs a create operation without a prior read/validation.
 * writePatterns are static regex literals; readKeywords are plain strings.
 */
function hasWriteWithoutValidation(body: string, readKeywords: string[]): boolean {
  const firstWriteIdx = findFirstPrismaWriteIndex(body);
  if (firstWriteIdx === Infinity) {
    return false;
  }

  // Check for validation reads that happen before the first write
  const hasValidation = readKeywords.some((kw) => {
    const readIdx = body.indexOf(kw);
    return readIdx !== -1 && readIdx < firstWriteIdx;
  });

  return !hasValidation;
}

function findFirstPrismaWriteIndex(body: string): number {
  let firstWriteIdx = Number.POSITIVE_INFINITY;
  for (const token of CREATE_OPERATION_TOKENS) {
    let cursor = body.indexOf(token);
    while (cursor !== -1) {
      const prefix = body.slice(Math.max(0, cursor - 80), cursor);
      if (prefix.includes('this.prisma') || prefix.includes('prisma.')) {
        firstWriteIdx = Math.min(firstWriteIdx, cursor);
        break;
      }
      cursor = body.indexOf(token, cursor + token.length);
    }
  }
  return firstWriteIdx;
}

/** Check data consistency. */
export function checkDataConsistency(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const backendFiles = walkFiles(config.backendDir, ['.ts']);
  const financialFiles = backendFiles.filter(
    (file) =>
      FINANCIAL_SERVICE_PATTERNS.some((p) => p.test(file)) &&
      !file.includes('.spec.') &&
      !file.includes('.test.'),
  );

  for (const file of financialFiles) {
    const content = readFileSafe(file);
    if (!content) {
      continue;
    }

    const fileName = path.basename(file);
    const functions = extractFunctionBodies(content);

    for (const fn of functions) {
      // Skip utility/getter functions by name
      if (/^(get|find|fetch|load|build|format|compute|check|validate|is|has|can)/.test(fn.name)) {
        continue;
      }

      // Check for create without prior findFirst/findUnique in financial context
      // (updates are excluded — they usually already have a validated ID from the request)
      if (hasWriteWithoutValidation(fn.body, VALIDATION_READS)) {
        // Determine the most specific break type based on file
        let breakType: 'DATA_PRODUCT_NO_PLAN' | 'DATA_ORDER_NO_PAYMENT' | 'DATA_WORKSPACE_NO_OWNER';
        let description: string;
        let detail: string;

        if (/checkout|order/i.test(fileName)) {
          breakType = 'DATA_PRODUCT_NO_PLAN';
          description = `Checkout/order creation without prior plan/product validation in ${fileName}`;
          detail =
            `Function '${fn.name}' performs a write operation without a findFirst/findUnique guard. ` +
            `An order could be created for a non-existent or inactive plan.`;
        } else if (/wallet|payment/i.test(fileName)) {
          breakType = 'DATA_ORDER_NO_PAYMENT';
          description = `Financial write without existence check in ${fileName}`;
          detail =
            `Function '${fn.name}' creates or updates a financial record without first validating ` +
            `the referenced entity exists. This can create orphaned payment records.`;
        } else if (/billing|subscription/i.test(fileName)) {
          breakType = 'DATA_PRODUCT_NO_PLAN';
          description = `Billing operation without plan validation in ${fileName}`;
          detail =
            `Function '${fn.name}' creates a subscription or billing record without first checking ` +
            `the plan exists and is active. Subscriptions may reference deleted plans.`;
        } else {
          breakType = 'DATA_WORKSPACE_NO_OWNER';
          description = `Financial write without validation in ${fileName}`;
          detail =
            `Function '${fn.name}' in ${fileName} performs write operation(s) without ` +
            `a prior findFirst/findUnique validation. May violate business rule constraints.`;
        }

        breaks.push({
          type: breakType,
          severity: 'high',
          file,
          line: fn.startLine,
          description,
          detail,
        });
      }
    }

    // Check wallet service specifically: withdrawal must validate balance
    if (/wallet/i.test(fileName)) {
      const withdrawFns = functions.filter((fn) => /withdraw|saque|debit|deduct/i.test(fn.name));
      for (const fn of withdrawFns) {
        const hasBalanceCheck =
          /balance|saldo|amount.*<=|>=.*amount|findFirst|findUnique/i.test(fn.body) &&
          /\$transaction|transaction/i.test(fn.body);
        if (!hasBalanceCheck) {
          breaks.push({
            type: 'DATA_ORDER_NO_PAYMENT',
            severity: 'high',
            file,
            line: fn.startLine,
            description: `Withdrawal function '${fn.name}' may not validate balance atomically`,
            detail:
              `wallet.service: '${fn.name}' does not appear to use a Prisma $transaction with balance validation. ` +
              `Race conditions can cause overdraft — two concurrent withdrawals may both pass the balance check.`,
          });
        }
      }
    }

    // Check workspace creation: must create OWNER member record
    if (/workspace.*service/i.test(fileName)) {
      const createFns = functions.filter((fn) => /create/i.test(fn.name));
      for (const fn of createFns) {
        const hasOwnerCreation = /OWNER|role.*owner|owner.*role/i.test(fn.body);
        if (!hasOwnerCreation && fn.body.includes('create(')) {
          breaks.push({
            type: 'DATA_WORKSPACE_NO_OWNER',
            severity: 'high',
            file,
            line: fn.startLine,
            description: `Workspace creation in '${fn.name}' does not create an OWNER member`,
            detail:
              `workspace.service: '${fn.name}' creates a workspace but does not appear to create a ` +
              `WorkspaceMember with role=OWNER. The workspace will be orphaned with no admin.`,
          });
        }
      }
    }
  }

  return breaks;
}
