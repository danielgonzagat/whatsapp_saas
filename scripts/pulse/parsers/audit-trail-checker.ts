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
 *   Emits evidence gaps with source/truth-mode metadata. Syntax/token matches are
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
  sourceKind: 'syntax-heuristic' | 'schema-static';
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

function splitIdentifier(value: string): Set<string> {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .toLowerCase();
  return new Set(spaced.split(/\s+/).filter(Boolean));
}

function hasTokenPrefix(tokens: Set<string>, prefix: string): boolean {
  return [...tokens].some((token) => token.startsWith(prefix));
}

function hasMutationSignal(value: string): boolean {
  const tokens = splitIdentifier(value);
  return (
    tokens.has('create') ||
    tokens.has('process') ||
    tokens.has('update') ||
    tokens.has('adjust') ||
    tokens.has('transfer') ||
    tokens.has('debit') ||
    tokens.has('credit') ||
    tokens.has('charge') ||
    tokens.has('refund') ||
    tokens.has('delete') ||
    tokens.has('anonymize') ||
    tokens.has('erase')
  );
}

function hasValueCarrierSignal(value: string): boolean {
  const tokens = splitIdentifier(value);
  return (
    tokens.has('amount') ||
    tokens.has('total') ||
    tokens.has('balance') ||
    tokens.has('currency') ||
    tokens.has('fee') ||
    tokens.has('commission') ||
    tokens.has('transaction') ||
    tokens.has('charge') ||
    tokens.has('refund')
  );
}

function hasAppendOnlyAuditEvidence(value: string): boolean {
  const tokens = splitIdentifier(value);
  return (
    tokens.has('audit') &&
    (tokens.has('log') ||
      tokens.has('append') ||
      tokens.has('write') ||
      tokens.has('entry') ||
      tokens.has('event') ||
      tokens.has('record'))
  );
}

function hasTransactionEvidence(value: string): boolean {
  const tokens = splitIdentifier(value);
  return tokens.has('transaction') || value.includes('$transaction');
}

function hasPrivilegedActionSignal(value: string): boolean {
  const tokens = splitIdentifier(value);
  return (
    tokens.has('admin') ||
    tokens.has('sudo') ||
    tokens.has('override') ||
    tokens.has('bypass') ||
    tokens.has('impersonate') ||
    tokens.has('suspend') ||
    hasTokenPrefix(tokens, 'privileg')
  );
}

function hasSensitiveSubjectSignal(value: string): boolean {
  const tokens = splitIdentifier(value);
  return (
    tokens.has('password') ||
    tokens.has('token') ||
    tokens.has('secret') ||
    tokens.has('personal') ||
    tokens.has('pii') ||
    tokens.has('identity') ||
    tokens.has('credential')
  );
}

function hasSensitiveDeletion(content: string): boolean {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!hasMutationSignal(lines[i])) {
      continue;
    }
    const context = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 4)).join('\n');
    if (splitIdentifier(context).has('permission')) {
      continue;
    }
    if (hasSensitiveSubjectSignal(context)) {
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

    if (hasMutationSignal(content) && hasAppendOnlyAuditEvidence(content)) {
      breaks.push(
        buildAuditTrailDiagnostic({
          predicateKinds: ['audit_log_delete_signal'],
          severity: 'critical',
          file: relFile,
          line: 0,
          description: 'AuditLog deletion signal observed; append-only audit behavior needs proof.',
          detail:
            'Syntax-only weak signal; confirm whether the mutation path targets audit records before treating this as operationally blocking.',
          sourceKind: 'syntax-heuristic',
          truthMode: 'weak_signal',
        }),
      );
    }
  }

  // CHECK 1: Financial operations without AuditLog
  const mutationCarrierFiles = backendFiles.filter((f) => splitIdentifier(f).has('service'));

  for (const file of mutationCarrierFiles) {
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

    const hasValueMutation = hasMutationSignal(content) && hasValueCarrierSignal(content);
    const hasAuditLog = hasAppendOnlyAuditEvidence(content);
    const hasTransaction = hasTransactionEvidence(content);

    if (hasValueMutation && !hasAuditLog) {
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
          sourceKind: 'syntax-heuristic',
          truthMode: 'weak_signal',
        }),
      );
    }

    // CHECK 5: AuditLog inside transaction
    if (hasValueMutation && hasAuditLog && !hasTransaction) {
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
          sourceKind: 'syntax-heuristic',
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

    if (hasSensitiveSubjectSignal(content) && hasAppendOnlyAuditEvidence(content)) {
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
          sourceKind: 'syntax-heuristic',
          truthMode: 'weak_signal',
        }),
      );
    }
  }

  // CHECK 2: Data deletion audit
  for (const file of backendFiles) {
    if (
      file.endsWith('.spec.ts') ||
      splitIdentifier(file).has('migration') ||
      splitIdentifier(file).has('seed')
    ) {
      continue;
    }
    if (!splitIdentifier(file).has('service')) {
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
      if (!hasAppendOnlyAuditEvidence(content)) {
        breaks.push(
          buildAuditTrailDiagnostic({
            predicateKinds: ['sensitive_deletion_signal', 'audit_write_not_observed'],
            severity: 'high',
            file: relFile,
            line: 0,
            description:
              'Sensitive deletion/anonymization signal observed without nearby audit evidence.',
            detail:
              'Syntax/token-only weak signal; confirm deletion semantics and audit append behavior before treating this as final truth.',
            sourceKind: 'syntax-heuristic',
            truthMode: 'weak_signal',
          }),
        );
      }
    }
  }

  // CHECK 3: Admin actions audit
  for (const file of backendFiles) {
    if (
      file.endsWith('.spec.ts') ||
      splitIdentifier(file).has('migration') ||
      splitIdentifier(file).has('seed')
    ) {
      continue;
    }

    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);

    const hasPrivilegedOp = hasPrivilegedActionSignal(content);
    if (hasPrivilegedOp && !hasAppendOnlyAuditEvidence(content)) {
      breaks.push(
        buildAuditTrailDiagnostic({
          predicateKinds: ['admin_action_signal', 'audit_write_not_observed'],
          severity: 'high',
          file: relFile,
          line: 0,
          description: 'Privileged action signal observed without nearby audit evidence.',
          detail:
            'Regex/list-only weak signal; confirm privileged semantics and audit append behavior before treating this as final truth.',
          sourceKind: 'syntax-heuristic',
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
