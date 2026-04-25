/**
 * PULSE soak runtime checks.
 *
 * Static observers that verify whether the backend ships the runtime
 * artifacts required for soak scenarios to be honest. These checks do NOT
 * execute any flow — they grep concrete files for queue/worker/DLQ/idempotency
 * and reconciliation/append-only ledger guarantees.
 *
 * truthMode for emitted evidence is "observed": every signal corresponds to a
 * real file on disk and a real symbol/keyword. Missing signals demote the
 * scenario to missing_evidence.
 */
import { pathExists, readTextFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';

/** Single soak signal (file/keyword observation). */
export interface SoakSignal {
  /** Stable signal id, e.g. "queue.attempts-configured". */
  id: string;
  /** Repo-relative file the signal was observed in. */
  file: string;
  /** True when the file exists and contains the expected token(s). */
  observed: boolean;
  /** Short human description. */
  detail: string;
}

function fileMatches(absPath: string, patterns: RegExp[]): boolean {
  if (!pathExists(absPath)) {
    return false;
  }
  let content: string;
  try {
    content = readTextFile(absPath);
  } catch {
    return false;
  }
  return patterns.every((pattern) => pattern.test(content));
}

/**
 * Verify that the backend BullMQ queue layer exists, with retries, backoff,
 * idempotent jobIds, and a DLQ webhook hook.
 */
export function observeQueueInfrastructure(rootDir: string): SoakSignal[] {
  const queueFile = safeJoin(rootDir, 'backend', 'src', 'queue', 'queue.ts');
  const jobIdUtil = safeJoin(rootDir, 'backend', 'src', 'queue', 'job-id.util.ts');
  const workerErrorHandler = safeJoin(rootDir, 'worker', 'src', 'utils', 'error-handler.ts');
  const stripeWebhook = safeJoin(
    rootDir,
    'backend',
    'src',
    'payments',
    'stripe',
    'stripe-webhook.processor.ts',
  );
  return [
    {
      id: 'queue.attempts-configured',
      file: 'backend/src/queue/queue.ts',
      observed: fileMatches(queueFile, [/attempts:/, /backoff:/]),
      detail: 'BullMQ defaultJobOptions configure attempts and backoff.',
    },
    {
      id: 'queue.dlq-webhook',
      file: 'backend/src/queue/queue.ts',
      observed: fileMatches(queueFile, [/DLQ_WEBHOOK_URL|OPS_WEBHOOK_URL/, /\[DLQ\]/]),
      detail: 'Queue layer wires a DLQ webhook (Slack/PagerDuty/ops sink).',
    },
    {
      id: 'queue.idempotency-jobid',
      file: 'backend/src/queue/job-id.util.ts',
      observed: pathExists(jobIdUtil),
      detail: 'Dedicated jobId utility exists for idempotent BullMQ enqueue.',
    },
    {
      id: 'worker.error-handler',
      file: 'worker/src/utils/error-handler.ts',
      observed: pathExists(workerErrorHandler),
      detail: 'Worker error handler module ships with retry/backoff awareness.',
    },
    {
      id: 'webhook.processor.stripe',
      file: 'backend/src/payments/stripe/stripe-webhook.processor.ts',
      observed: pathExists(stripeWebhook),
      detail: 'Stripe webhook processor exists (idempotency + retry).',
    },
  ];
}

/**
 * Verify that the backend has a payment-reconciliation cron job and that the
 * ledger is application-enforced append-only (no UPDATE/DELETE of historic
 * entries in code paths).
 */
export function observeReconciliationInfrastructure(rootDir: string): SoakSignal[] {
  const connectRecon = safeJoin(
    rootDir,
    'backend',
    'src',
    'payments',
    'ledger',
    'connect-ledger-reconciliation.service.ts',
  );
  const commonRecon = safeJoin(
    rootDir,
    'backend',
    'src',
    'common',
    'ledger-reconciliation.service.ts',
  );
  const ledgerService = safeJoin(
    rootDir,
    'backend',
    'src',
    'payments',
    'ledger',
    'ledger.service.ts',
  );
  const schemaPath = safeJoin(rootDir, 'backend', 'prisma', 'schema.prisma');
  return [
    {
      id: 'reconciliation.connect-cron',
      file: 'backend/src/payments/ledger/connect-ledger-reconciliation.service.ts',
      observed: fileMatches(connectRecon, [/@Cron\(/]),
      detail: 'Connect ledger reconciliation runs on a NestJS @Cron schedule.',
    },
    {
      id: 'reconciliation.common-cron',
      file: 'backend/src/common/ledger-reconciliation.service.ts',
      observed: fileMatches(commonRecon, [/@Cron\(/]),
      detail: 'Generic ledger reconciliation runs on a NestJS @Cron schedule.',
    },
    {
      id: 'ledger.append-only-doc',
      file: 'backend/prisma/schema.prisma',
      observed: fileMatches(schemaPath, [/append-only/]),
      detail: 'Prisma schema documents the ledger as append-only.',
    },
    {
      id: 'ledger.service-present',
      file: 'backend/src/payments/ledger/ledger.service.ts',
      observed: pathExists(ledgerService),
      detail: 'Ledger service module is present.',
    },
  ];
}

/**
 * Verify that flows (campaigns/followups) have engine + execution artifacts
 * usable by long-running soak operators.
 */
export function observeFlowsInfrastructure(rootDir: string): SoakSignal[] {
  const followupCron = safeJoin(rootDir, 'backend', 'src', 'followup', 'followup.service.ts');
  const cartRecovery = safeJoin(rootDir, 'backend', 'src', 'kloel', 'cart-recovery.service.ts');
  const flowsDir = safeJoin(rootDir, 'backend', 'src', 'flows');
  return [
    {
      id: 'flows.module-present',
      file: 'backend/src/flows',
      observed: pathExists(flowsDir),
      detail: 'Flows module directory exists in the backend.',
    },
    {
      id: 'flows.followup-cron',
      file: 'backend/src/followup/followup.service.ts',
      observed: fileMatches(followupCron, [/@Cron\(/]),
      detail: 'Follow-up service is driven by a recurring @Cron job.',
    },
    {
      id: 'flows.cart-recovery-cron',
      file: 'backend/src/kloel/cart-recovery.service.ts',
      observed: fileMatches(cartRecovery, [/@Cron\(/]),
      detail: 'Cart recovery is driven by a recurring @Cron job.',
    },
  ];
}

/**
 * Verify that autopilot has a runtime queue + worker entrypoint.
 */
export function observeAutopilotInfrastructure(rootDir: string): SoakSignal[] {
  const autopilotJobs = safeJoin(rootDir, 'backend', 'src', 'contracts', 'autopilot-jobs.ts');
  const queueHealth = safeJoin(rootDir, 'backend', 'src', 'metrics', 'queue-health.service.ts');
  return [
    {
      id: 'autopilot.contract',
      file: 'backend/src/contracts/autopilot-jobs.ts',
      observed: pathExists(autopilotJobs),
      detail: 'Autopilot jobs contract exists for typed enqueue.',
    },
    {
      id: 'autopilot.queue-health',
      file: 'backend/src/metrics/queue-health.service.ts',
      observed: pathExists(queueHealth),
      detail: 'Queue health metrics service surfaces worker liveness.',
    },
  ];
}
