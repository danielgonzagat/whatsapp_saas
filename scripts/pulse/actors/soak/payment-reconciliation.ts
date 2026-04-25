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
  checkFileMatches,
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
      patterns: [/@Cron\(/],
    }),
    checkFileMatches(rootDir, {
      label: 'common reconciliation @Cron',
      relPath: 'backend/src/common/ledger-reconciliation.service.ts',
      patterns: [/@Cron\(/],
    }),
    checkFileMatches(rootDir, {
      label: 'queue retries+backoff configured',
      relPath: 'backend/src/queue/queue.ts',
      patterns: [/attempts:/, /backoff:/],
    }),
    checkFileMatches(rootDir, {
      label: 'queue DLQ webhook hook',
      relPath: 'backend/src/queue/queue.ts',
      patterns: [/DLQ_WEBHOOK_URL|OPS_WEBHOOK_URL/, /\[DLQ\]/],
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
  // The schema must (1) define a Ledger model and (2) document append-only
  // semantics either in a comment near the model or generally in the file.
  const hasLedgerModel = /model\s+\w*Ledger\w*\s*\{/.test(content);
  const hasAppendOnlyDoc = /append-only/i.test(content);
  return {
    label: 'schema declares append-only ledger',
    path: 'backend/prisma/schema.prisma',
    present: hasLedgerModel && hasAppendOnlyDoc,
  };
}
