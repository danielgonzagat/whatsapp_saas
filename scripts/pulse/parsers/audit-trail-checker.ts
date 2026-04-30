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
 * DIAGNOSTICS:
 *   Emits evidence gaps with source/truth-mode metadata. Regex/list matches are
 *   weak sensors, not final authority.
 */
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

type AuditTrailTruthMode = 'weak_signal' | 'confirmed_static';

type AuditTrailDiagnosticBreak = Break & {
  truthMode: AuditTrailTruthMode;
};

interface AuditTrailDiagnosticInput {
  predicateKinds: string[];
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
  sourceKind: 'regex-heuristic' | 'schema-static';
  truthMode: AuditTrailTruthMode;
}

function buildAuditTrailDiagnostic(input: AuditTrailDiagnosticInput): AuditTrailDiagnosticBreak {
  const predicateToken = input.predicateKinds
    .map((predicate) => predicate.replace(/[^a-z0-9]+/gi, '-').toLowerCase())
    .filter(Boolean)
    .join('+');

  return {
    type: `diagnostic:audit-trail-checker:${predicateToken || 'audit-evidence-observation'}`,
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: `${input.sourceKind}:audit-trail-checker;truthMode=${input.truthMode};predicates=${input.predicateKinds.join(',')}`,
    surface: 'audit-trail',
    truthMode: input.truthMode,
  };
}

const FINANCIAL_OPERATION_SIGNAL_RE = [
  /createPayment|processPayment|chargeCustomer/i,
  /initiateWithdrawal|processWithdrawal|createWithdrawal/i,
  /createRefund|processRefund|issueRefund/i,
  /createTransaction|debitWallet|creditWallet/i,
  /updateBalance|adjustBalance|transferBalance/i,
  /createCommission|processCommission|payCommission/i,
];

const APPEND_ONLY_AUDIT_EVIDENCE_RE =
  /AuditLog|AdminAuditService|auditLog|this\.auditLog|auditService|this\.audit\.append|audit\.append|writeAudit|createAuditEntry/i;
const TRANSACTION_RE = /prisma\.\$transaction|\$transaction\s*\(\s*\[/;

const ADMIN_OPERATION_SIGNAL_RE = [
  /\b(?:impersonat\w*|sudo|actAs|loginAs)\b/i,
  /\b(?:suspendWorkspace|banWorkspace|overridePlan)\b/i,
  /\b(?:forceReset|adminReset|bypassLimit)\b/i,
];

const SENSITIVE_DELETE_SIGNAL_RE =
  /\b(?:user|customer|contact|lead|workspace|agent|account|message|chat|conversation|product|order|payment|transaction|wallet|subscription|file|media|pii|personal)\b/i;

function hasSensitiveDeletion(content: string): boolean {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/\.delete\s*\(|deleteMany|anonymize|erase/i.test(lines[i])) {
      continue;
    }
    const context = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 4)).join('\n');
    if (
      /\b(?:adminPermission|permission|rolePermission)\.(?:delete|deleteMany)\s*\(/i.test(context)
    ) {
      continue;
    }
    if (SENSITIVE_DELETE_SIGNAL_RE.test(context)) {
      return true;
    }
  }
  return false;
}

/** Check audit trail. */
export function checkAuditTrail(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // CHECK 4: AuditLog model in Prisma schema
  let schemaContent = '';
  try {
    schemaContent = readTextFile(config.schemaPath, 'utf8');
  } catch {
    // Schema not readable — skip schema checks
  }

  const hasAuditLogModel = /^model\s+AuditLog\s*\{/m.test(schemaContent);
  if (!hasAuditLogModel) {
    breaks.push(
      buildAuditTrailDiagnostic({
        predicateKinds: ['audit_log_model_not_observed'],
        severity: 'critical',
        file: path.relative(config.rootDir, config.schemaPath),
        line: 0,
        description:
          'AuditLog model not observed in Prisma schema; financial auditability cannot be proven from schema evidence.',
        detail:
          'Schema evidence should expose an append-only audit model with actor, workspace, action, state transition, IP, and timestamp fields.',
        sourceKind: 'schema-static',
        truthMode: 'confirmed_static',
      }),
    );
  }

  // CHECK 6: AuditLog immutability (no delete endpoint for audit logs)
  const backendFiles = walkFiles(config.backendDir, ['.ts']);

  for (const file of backendFiles) {
    if (!/audit/i.test(path.basename(file))) {
      continue;
    }
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }
    const relFile = path.relative(config.rootDir, file);

    if (/@Delete\s*\(|\.delete\s*\(/.test(content) && /auditLog|AuditLog/i.test(content)) {
      breaks.push(
        buildAuditTrailDiagnostic({
          predicateKinds: ['audit_log_delete_signal'],
          severity: 'critical',
          file: relFile,
          line: 0,
          description: 'AuditLog deletion signal observed; append-only audit behavior needs proof.',
          detail:
            'Regex-only weak signal; confirm whether the delete path targets audit records before treating this as operationally blocking.',
          sourceKind: 'regex-heuristic',
          truthMode: 'weak_signal',
        }),
      );
    }
  }

  // CHECK 1: Financial operations without AuditLog
  const financialFiles = backendFiles.filter(
    (f) => /checkout|wallet|billing|payment|commission|kloel/i.test(f) && /service/i.test(f),
  );

  for (const file of financialFiles) {
    if (/\.spec\.ts$|migration|seed/i.test(file)) {
      continue;
    }

    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);

    const hasFinancialOp = FINANCIAL_OPERATION_SIGNAL_RE.some((re) => re.test(content));
    const hasAuditLog = APPEND_ONLY_AUDIT_EVIDENCE_RE.test(content);
    const hasTransaction = TRANSACTION_RE.test(content);

    if (hasFinancialOp && !hasAuditLog) {
      breaks.push(
        buildAuditTrailDiagnostic({
          predicateKinds: ['financial_mutation_signal', 'audit_write_not_observed'],
          severity: 'critical',
          file: relFile,
          line: 0,
          description:
            'Financial mutation signal observed without nearby append-only audit evidence.',
          detail:
            'Regex/list-only weak signal; confirm with AST/dataflow or runtime evidence before treating this as final truth.',
          sourceKind: 'regex-heuristic',
          truthMode: 'weak_signal',
        }),
      );
    }

    // CHECK 5: AuditLog inside transaction
    if (hasFinancialOp && hasAuditLog && !hasTransaction) {
      breaks.push(
        buildAuditTrailDiagnostic({
          predicateKinds: [
            'financial_mutation_signal',
            'audit_write_observed',
            'transaction_not_observed',
          ],
          severity: 'critical',
          file: relFile,
          line: 0,
          description:
            'Audit evidence appears outside transaction context; atomic audit behavior needs proof.',
          detail:
            'Regex-only weak signal; confirm control flow before treating the audit write as non-atomic.',
          sourceKind: 'regex-heuristic',
          truthMode: 'weak_signal',
        }),
      );
    }
  }

  // CHECK 7: Sensitive fields in audit log content
  for (const file of backendFiles) {
    if (!/audit/i.test(path.basename(file))) {
      continue;
    }
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }
    const relFile = path.relative(config.rootDir, file);

    if (
      /password|token|secret|cpf|ssn/i.test(content) &&
      APPEND_ONLY_AUDIT_EVIDENCE_RE.test(content)
    ) {
      breaks.push(
        buildAuditTrailDiagnostic({
          predicateKinds: ['sensitive_field_signal', 'audit_write_observed'],
          severity: 'critical',
          file: relFile,
          line: 0,
          description:
            'Sensitive field token observed near audit evidence; log redaction needs proof.',
          detail:
            'Regex-only weak signal; confirm serialized audit payloads and redaction behavior before treating this as a leak.',
          sourceKind: 'regex-heuristic',
          truthMode: 'weak_signal',
        }),
      );
    }
  }

  // CHECK 2: Data deletion audit
  for (const file of backendFiles) {
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

    if (hasSensitiveDeletion(content)) {
      if (!APPEND_ONLY_AUDIT_EVIDENCE_RE.test(content)) {
        breaks.push(
          buildAuditTrailDiagnostic({
            predicateKinds: ['sensitive_deletion_signal', 'audit_write_not_observed'],
            severity: 'high',
            file: relFile,
            line: 0,
            description:
              'Sensitive deletion/anonymization signal observed without nearby audit evidence.',
            detail:
              'Regex/list-only weak signal; confirm deletion semantics and audit append behavior before treating this as final truth.',
            sourceKind: 'regex-heuristic',
            truthMode: 'weak_signal',
          }),
        );
      }
    }
  }

  // CHECK 3: Admin actions audit
  for (const file of backendFiles) {
    if (/\.spec\.ts$|migration|seed/i.test(file)) {
      continue;
    }

    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);

    const hasAdminOp = ADMIN_OPERATION_SIGNAL_RE.some((re) => re.test(content));
    if (hasAdminOp && !APPEND_ONLY_AUDIT_EVIDENCE_RE.test(content)) {
      breaks.push(
        buildAuditTrailDiagnostic({
          predicateKinds: ['admin_action_signal', 'audit_write_not_observed'],
          severity: 'high',
          file: relFile,
          line: 0,
          description: 'Privileged action signal observed without nearby audit evidence.',
          detail:
            'Regex/list-only weak signal; confirm privileged semantics and audit append behavior before treating this as final truth.',
          sourceKind: 'regex-heuristic',
          truthMode: 'weak_signal',
        }),
      );
    }
  }

  // TODO: Implement when infrastructure available
  // - Query AuditLog table and verify completeness vs. transactions
  // - Verify AuditLog is replicated to immutable storage (S3, WORM bucket)
  // - Alert on AuditLog gaps (missing entries for time window)

  return breaks;
}
