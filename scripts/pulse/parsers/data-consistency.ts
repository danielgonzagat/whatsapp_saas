/**
 * PULSE Parser 63: Data Consistency
 * Layer 7: Database Health
 * Mode: STATIC (source code pattern analysis — no DB access needed)
 *
 * CHECKS:
 * Verify business rule consistency enforcement in critical mutating service code.
 * These are rules that foreign keys cannot enforce — they require application-level logic.
 * This static checker looks for the ABSENCE of validation guards before critical mutations.
 *
 * Critical rules:
 * 1. Every amount-bearing write must validate its referenced entity first.
 * 2. Every balance-decreasing operation must validate balance atomically.
 * 3. Every tenant/owner write must validate ownership before mutation.
 *
 * STATIC APPROACH:
 * Look for the pattern: critical .create() / .update() WITHOUT a prior .findFirst() / .findUnique()
 * in the same function body. This indicates an operation that does not validate existence first.
 *
 * BREAK TYPES:
 * - DATA_PRODUCT_NO_PLAN (high) — money-like record created without validated reference
 * - DATA_ORDER_NO_PAYMENT (high) — amount/balance mutation without atomic validation
 * - DATA_WORKSPACE_NO_OWNER (high) — tenant owner/member mutation lacks validation
 */

import * as path from 'path';
import { walkFiles, readFileSafe } from './utils';
import type { Break, PulseConfig } from '../types';

const CREATE_OPERATION_TOKENS = ['.create(', '.createMany(', '.upsert('];
const MUTATION_OPERATION_RE =
  /prisma\.[A-Za-z_$][\w$]*\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;
const MONEY_STATE_RE =
  /\b(?:amount|amountCents|total|subtotal|price|priceCents|currency|balance|saldo|fee|commission|refund|charge|ledger|transaction)\b/i;
const TENANT_OWNER_STATE_RE = /\b(?:workspaceId|tenantId|ownerId|memberId|role|OWNER)\b/;

// Keywords that indicate existence validation before create
const VALIDATION_READS = ['findFirst(', 'findUnique(', 'findMany(', 'count('];

function isConsistencyCriticalService(content: string): boolean {
  return (
    MUTATION_OPERATION_RE.test(content) &&
    (MONEY_STATE_RE.test(content) || TENANT_OWNER_STATE_RE.test(content))
  );
}

function mutatesMoneyLikeState(content: string): boolean {
  return MONEY_STATE_RE.test(content);
}

function mutatesTenantOwnerState(content: string): boolean {
  return TENANT_OWNER_STATE_RE.test(content);
}

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
  const criticalServiceFiles = backendFiles.filter((file) => {
    if (!file.endsWith('.service.ts') || file.includes('.spec.') || file.includes('.test.')) {
      return false;
    }
    const content = readFileSafe(file);
    return isConsistencyCriticalService(content);
  });

  for (const file of criticalServiceFiles) {
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

      // Check for create without prior findFirst/findUnique in critical mutation context.
      // (updates are excluded — they usually already have a validated ID from the request)
      if (hasWriteWithoutValidation(fn.body, VALIDATION_READS)) {
        // Determine the most specific break type based on file
        let breakType: 'DATA_PRODUCT_NO_PLAN' | 'DATA_ORDER_NO_PAYMENT' | 'DATA_WORKSPACE_NO_OWNER';
        let description: string;
        let detail: string;

        if (mutatesMoneyLikeState(fn.body)) {
          breakType = 'DATA_PRODUCT_NO_PLAN';
          description = `Money-like creation without prior existence validation in ${fileName}`;
          detail =
            `Function '${fn.name}' performs a write operation without a findFirst/findUnique guard. ` +
            `A money-like record could be created for a non-existent, inactive, or unauthorized reference.`;
        } else if (mutatesTenantOwnerState(fn.body)) {
          breakType = 'DATA_WORKSPACE_NO_OWNER';
          description = `Tenant/owner mutation without prior validation in ${fileName}`;
          detail =
            `Function '${fn.name}' mutates tenant/owner state without first validating the referenced ` +
            `workspace, tenant, member, or owner exists.`;
        } else {
          breakType = 'DATA_WORKSPACE_NO_OWNER';
          description = `Critical write without validation in ${fileName}`;
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

    // Check balance-decreasing functions specifically: must validate balance atomically.
    if (MONEY_STATE_RE.test(content)) {
      const balanceDecreaseFns = functions.filter((fn) =>
        /debit|deduct|decrement|amount|balance/i.test(fn.name),
      );
      for (const fn of balanceDecreaseFns) {
        const hasBalanceCheck =
          /balance|saldo|amount.*<=|>=.*amount|findFirst|findUnique/i.test(fn.body) &&
          /\$transaction|transaction/i.test(fn.body);
        if (!hasBalanceCheck) {
          breaks.push({
            type: 'DATA_ORDER_NO_PAYMENT',
            severity: 'high',
            file,
            line: fn.startLine,
            description: `Balance-decreasing function '${fn.name}' may not validate balance atomically`,
            detail:
              `${fileName}: '${fn.name}' does not appear to use a Prisma $transaction with balance validation. ` +
              `Race conditions can cause negative balance — two concurrent decrements may both pass the balance check.`,
          });
        }
      }
    }

    // Check tenant creation: must create OWNER member record
    if (TENANT_OWNER_STATE_RE.test(content)) {
      const createFns = functions.filter((fn) => /create/i.test(fn.name));
      for (const fn of createFns) {
        const hasOwnerCreation = /OWNER|role.*owner|owner.*role/i.test(fn.body);
        if (!hasOwnerCreation && fn.body.includes('create(')) {
          breaks.push({
            type: 'DATA_WORKSPACE_NO_OWNER',
            severity: 'high',
            file,
            line: fn.startLine,
            description: `Tenant creation in '${fn.name}' does not create an OWNER member`,
            detail:
              `${fileName}: '${fn.name}' creates tenant-like state but does not appear to create a ` +
              `member with role=OWNER. The tenant can be orphaned with no admin.`,
          });
        }
      }
    }
  }

  return breaks;
}
