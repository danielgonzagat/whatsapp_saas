/**
 * Soak observer for `system-payment-reconciliation`.
 *
 * Verifies — by static inspection only — that the backend ships a payment
 * reconciliation cron job and an append-only ledger structure. Soak status
 * passes only when every dependency is present (truthMode: observed).
 */
import { pathExists, readTextFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import {
  allPresent,
  checkPaths,
  summarizeMissing,
  type StructuralCheck,
} from './structural-checks';
import type { SoakScenarioObservation } from './observer';

/** Run the system-payment-reconciliation observer. */
export function observePaymentReconciliation(rootDir: string): SoakScenarioObservation {
  const presenceChecks = checkPaths(rootDir, [
    {
      label: 'connect-ledger-reconciliation service',
      relPath: 'backend/src/payments/ledger/connect-ledger-reconciliation.service.ts',
    },
    {
      label: 'common ledger-reconciliation service',
      relPath: 'backend/src/common/ledger-reconciliation.service.ts',
    },
    {
      label: 'ledger service',
      relPath: 'backend/src/payments/ledger/ledger.service.ts',
    },
    {
      label: 'queue layer',
      relPath: 'backend/src/queue/queue.ts',
    },
    {
      label: 'job-id idempotency util',
      relPath: 'backend/src/queue/job-id.util.ts',
    },
    {
      label: 'stripe webhook processor',
      relPath: 'backend/src/payments/stripe/stripe-webhook.processor.ts',
    },
  ]);
  const cronChecks: StructuralCheck[] = [
    checkFileMatches(rootDir, {
      label: 'connect reconciliation @Cron',
      relPath: 'backend/src/payments/ledger/connect-ledger-reconciliation.service.ts',
      tokens: ['@Cron('],
    }),
    checkFileMatches(rootDir, {
      label: 'common reconciliation @Cron',
      relPath: 'backend/src/common/ledger-reconciliation.service.ts',
      tokens: ['@Cron('],
    }),
    checkFileMatches(rootDir, {
      label: 'queue retries+backoff configured',
      relPath: 'backend/src/queue/queue.ts',
      tokens: ['attempts:', 'backoff:'],
    }),
    checkFileMatches(rootDir, {
      label: 'queue DLQ webhook hook',
      relPath: 'backend/src/queue/queue.ts',
      anyTokenGroups: [['DLQ_WEBHOOK_URL', 'OPS_WEBHOOK_URL'], ['[DLQ]']],
    }),
  ];
  const appendOnlyCheck = checkAppendOnlyLedger(rootDir);
  const checks = [...presenceChecks, ...cronChecks, appendOnlyCheck];
  const passed = allPresent(checks);
  const summary = passed
    ? `Soak observed system-payment-reconciliation: ${checks.length} signals (cron, queue, DLQ, idempotency, append-only ledger).`
    : `Soak observation incomplete for system-payment-reconciliation: ${summarizeMissing(checks)}.`;
  return { passed, summary, checks, truthMode: 'observed' };
}

function checkFileMatches(
  rootDir: string,
  spec: {
    label: string;
    relPath: string;
    tokens?: readonly string[];
    anyTokenGroups?: ReadonlyArray<readonly string[]>;
  },
): StructuralCheck {
  const absolute = safeJoin(rootDir, spec.relPath);
  if (!pathExists(absolute)) {
    return { label: spec.label, path: spec.relPath, present: false };
  }
  let content = '';
  try {
    content = readTextFile(absolute);
  } catch {
    return { label: spec.label, path: spec.relPath, present: false };
  }
  const requiredTokensPresent = (spec.tokens ?? []).every((token) => content.includes(token));
  const groupedTokensPresent = (spec.anyTokenGroups ?? []).every((group) =>
    group.some((token) => content.includes(token)),
  );
  return {
    label: spec.label,
    path: spec.relPath,
    present: requiredTokensPresent && groupedTokensPresent,
  };
}

function checkAppendOnlyLedger(rootDir: string): StructuralCheck {
  const schemaPath = safeJoin(rootDir, 'backend', 'prisma', 'schema.prisma');
  if (!pathExists(schemaPath)) {
    return {
      label: 'schema declares append-only ledger',
      path: 'backend/prisma/schema.prisma',
      present: false,
    };
  }
  let content = '';
  try {
    content = readTextFile(schemaPath);
  } catch {
    return {
      label: 'schema declares append-only ledger',
      path: 'backend/prisma/schema.prisma',
      present: false,
    };
  }
  const hasLedgerModel = content
    .split('\n')
    .some(
      (line) =>
        line.trimStart().startsWith('model ') && line.includes('Ledger') && line.includes('{'),
    );
  const hasAppendOnlyDoc = content.toLowerCase().includes('append-only');
  return {
    label: 'schema declares append-only ledger',
    path: 'backend/prisma/schema.prisma',
    present: hasLedgerModel && hasAppendOnlyDoc,
  };
}
