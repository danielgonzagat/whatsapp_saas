/**
 * PULSE Parser 89: Audit Trail Checker
 * Layer 20: Compliance & Auditability
 * Mode: DEEP (requires codebase scan)
 *
 * CHECKS:
 * 1. Financial audit trail: every financial operation (payment, withdrawal, refund,
 *    commission, adjustment) must write an AuditLog record with:
 *    - workspaceId, userId, action, amount, before/after state, timestamp, IP
 * 2. Data deletion audit: when user data is deleted or anonymized, the deletion
 *    event must be logged (who deleted, when, what was deleted — but not the data itself)
 * 3. Admin action audit: when any admin-privileged operation is performed
 *    (impersonation, workspace suspension, plan override), it must be logged
 * 4. Verifies AuditLog model exists in Prisma schema
 * 5. Verifies AuditLog writes are inside the same $transaction as the main operation
 *    (so audit log is atomic with the operation it records)
 * 6. Verifies audit logs are not deletable via normal API (immutability)
 * 7. Checks that sensitive fields (password, token) are never logged in AuditLog
 *
 * REQUIRES: PULSE_DEEP=1
 * BREAK TYPES:
 *   AUDIT_FINANCIAL_NO_TRAIL(critical) — financial operation without AuditLog write
 *   AUDIT_DELETION_NO_LOG(high)        — data deletion without audit record
 *   AUDIT_ADMIN_NO_LOG(high)           — admin action without audit record
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

const FINANCIAL_OPERATIONS = [
  /createPayment|processPayment|chargeCustomer/i,
  /initiateWithdrawal|processWithdrawal|createWithdrawal/i,
  /createRefund|processRefund|issueRefund/i,
  /createTransaction|debitWallet|creditWallet/i,
  /updateBalance|adjustBalance|transferBalance/i,
  /createCommission|processCommission|payCommission/i,
];

const AUDIT_LOG_WRITE_RE = /AuditLog|auditLog|this\.auditLog|auditService|writeAudit|createAuditEntry/i;
const TRANSACTION_RE = /prisma\.\$transaction|\$transaction\s*\(\s*\[/;

const ADMIN_OPERATIONS = [
  /impersonat|sudo|actAs|loginAs/i,
  /suspendWorkspace|banWorkspace|overridePlan/i,
  /forceReset|adminReset|bypassLimit/i,
];

export function checkAuditTrail(config: PulseConfig): Break[] {
  if (!process.env.PULSE_DEEP) return [];
  const breaks: Break[] = [];

  // CHECK 4: AuditLog model in Prisma schema
  let schemaContent = '';
  try {
    schemaContent = fs.readFileSync(config.schemaPath, 'utf8');
  } catch {
    // Schema not readable — skip schema checks
  }

  const hasAuditLogModel = /^model\s+AuditLog\s*\{/m.test(schemaContent);
  if (!hasAuditLogModel) {
    breaks.push({
      type: 'AUDIT_FINANCIAL_NO_TRAIL',
      severity: 'critical',
      file: path.relative(config.rootDir, config.schemaPath),
      line: 0,
      description: 'AuditLog model not found in Prisma schema — financial operations cannot be audited',
      detail: 'Add an AuditLog model with: id, workspaceId, userId, action, amount, before, after, ip, timestamp',
    });
  }

  // CHECK 6: AuditLog immutability (no delete endpoint for audit logs)
  const backendFiles = walkFiles(config.backendDir, ['.ts']);

  for (const file of backendFiles) {
    if (!/audit/i.test(path.basename(file))) continue;
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const relFile = path.relative(config.rootDir, file);

    if (/@Delete\s*\(|\.delete\s*\(/.test(content) && /auditLog|AuditLog/i.test(content)) {
      breaks.push({
        type: 'AUDIT_FINANCIAL_NO_TRAIL',
        severity: 'critical',
        file: relFile,
        line: 0,
        description: 'AuditLog records are deletable — audit trail is not immutable',
        detail: 'Remove any DELETE endpoints or deleteMany calls targeting AuditLog; audit logs must be append-only',
      });
    }
  }

  // CHECK 1: Financial operations without AuditLog
  const financialFiles = backendFiles.filter(f =>
    /checkout|wallet|billing|payment|commission|kloel/i.test(f) && /service/i.test(f)
  );

  for (const file of financialFiles) {
    if (/\.spec\.ts$|migration|seed/i.test(file)) continue;

    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);

    const hasFinancialOp = FINANCIAL_OPERATIONS.some(re => re.test(content));
    const hasAuditLog = AUDIT_LOG_WRITE_RE.test(content);
    const hasTransaction = TRANSACTION_RE.test(content);

    if (hasFinancialOp && !hasAuditLog) {
      breaks.push({
        type: 'AUDIT_FINANCIAL_NO_TRAIL',
        severity: 'critical',
        file: relFile,
        line: 0,
        description: 'Financial operation without AuditLog write — cannot reconstruct transaction history',
        detail: 'Every financial mutation must write an AuditLog entry with before/after state, amount, and actor',
      });
    }

    // CHECK 5: AuditLog inside transaction
    if (hasFinancialOp && hasAuditLog && !hasTransaction) {
      breaks.push({
        type: 'AUDIT_FINANCIAL_NO_TRAIL',
        severity: 'critical',
        file: relFile,
        line: 0,
        description: 'AuditLog written outside $transaction — audit record may exist for a rolled-back operation',
        detail: 'Wrap both the financial operation and the AuditLog.create() inside prisma.$transaction()',
      });
    }
  }

  // CHECK 7: Sensitive fields in audit log content
  for (const file of backendFiles) {
    if (!/audit/i.test(path.basename(file))) continue;
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const relFile = path.relative(config.rootDir, file);

    if (/password|token|secret|cpf|ssn/i.test(content) && AUDIT_LOG_WRITE_RE.test(content)) {
      breaks.push({
        type: 'AUDIT_FINANCIAL_NO_TRAIL',
        severity: 'critical',
        file: relFile,
        line: 0,
        description: 'Potentially sensitive fields (password/token/CPF) may be logged in AuditLog',
        detail: 'Sanitize before logging: omit password, token, secret fields; mask CPF/CNPJ to last 4 digits',
      });
    }
  }

  // CHECK 2: Data deletion audit
  for (const file of backendFiles) {
    if (/\.spec\.ts$|migration|seed/i.test(file)) continue;
    if (!/service/i.test(file)) continue;

    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);

    if (/\.delete\s*\(|deleteMany|anonymize|erase/i.test(content)) {
      if (!AUDIT_LOG_WRITE_RE.test(content)) {
        breaks.push({
          type: 'AUDIT_DELETION_NO_LOG',
          severity: 'high',
          file: relFile,
          line: 0,
          description: 'Data deletion/anonymization without audit log — cannot prove LGPD compliance',
          detail: 'Log every deletion: AuditLog.create({ action: "USER_DATA_DELETED", entityId, requestedBy, timestamp })',
        });
      }
    }
  }

  // CHECK 3: Admin actions audit
  for (const file of backendFiles) {
    if (/\.spec\.ts$|migration|seed/i.test(file)) continue;

    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);

    const hasAdminOp = ADMIN_OPERATIONS.some(re => re.test(content));
    if (hasAdminOp && !AUDIT_LOG_WRITE_RE.test(content)) {
      breaks.push({
        type: 'AUDIT_ADMIN_NO_LOG',
        severity: 'high',
        file: relFile,
        line: 0,
        description: 'Admin operation without audit log — privileged actions are unaccountable',
        detail: 'Log all admin actions with: action, adminUserId, targetId, reason, timestamp, ip',
      });
    }
  }

  // TODO: Implement when infrastructure available
  // - Query AuditLog table and verify completeness vs. transactions
  // - Verify AuditLog is replicated to immutable storage (S3, WORM bucket)
  // - Alert on AuditLog gaps (missing entries for time window)

  return breaks;
}
