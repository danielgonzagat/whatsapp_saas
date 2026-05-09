import { type Job, Worker } from 'bullmq';
import { AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB } from '../contracts/autopilot-jobs';
import { autopilotDecisionCounter } from '../metrics';
import { buildQueueOptions } from '../queue';
import { WorkerError, isRetryableError } from '../src/utils/error-handler';
import { WorkerLogger } from '../logger';
import { checkIdempotent, endJob, logError, markCompleted, startJob } from '../processor-base';
import { SHOULD_RUN_AUTOPILOT_WORKER } from './autopilot/shared';
import { runSweepUnreadConversations } from './autopilot/sweep';
import { runScanContact } from './autopilot/scan';
import { runFollowupContact } from './autopilot/followup';
import { runCatalogContacts } from './autopilot/catalog';
import { runScoreContact } from './autopilot/score';
import { runCiaCycleAll, runCiaCycleWorkspace } from './autopilot/cia-cycle';
import { runCiaAction } from './autopilot/cia-action';
import { runCiaSelfImproveAll, runCiaSelfImproveWorkspace, runCiaGlobalLearningAll } from './autopilot/cia-learn';
import { runCycleAll, runCycleWorkspace } from './autopilot/cycle';

const autopilotLog = new WorkerLogger('autopilot-worker');

/** Autopilot worker. */
export const autopilotWorker = SHOULD_RUN_AUTOPILOT_WORKER
  ? new Worker(
      'autopilot-jobs',
      async (job: Job) => {
        const meta = startJob(job, autopilotLog);
        const ctxLog = autopilotLog.withContext(meta.correlationId, meta.workspaceId);

        try {
          const dedup = await checkIdempotent(job);
          if (dedup) {
            ctxLog.info('job_skipped_idempotent', { jobId: job.id });
            endJob(meta, ctxLog, job.name, 'skipped');
            return { ok: true, skipped: true, reason: 'idempotent' };
          }

          await job.updateProgress(10);

          if (job.name === 'cycle-all') {
            await runCycleAll();
            await markCompleted(job);
            endJob(meta, ctxLog, job.name, 'completed');
            return;
          }

          if (job.name === 'cia-cycle-all') {
            await runCiaCycleAll();
            await markCompleted(job);
            endJob(meta, ctxLog, job.name, 'completed');
            return;
          }

          if (job.name === 'cycle-workspace') {
            const workspaceId = job.data?.workspaceId;
            if (workspaceId) {
              await runCycleWorkspace(workspaceId);
            }
            await markCompleted(job);
            endJob(meta, ctxLog, job.name, 'completed');
            return;
          }

          if (job.name === 'cia-cycle-workspace') {
            const workspaceId = job.data?.workspaceId;
            if (workspaceId) {
              await runCiaCycleWorkspace(workspaceId);
            }
            await markCompleted(job);
            endJob(meta, ctxLog, job.name, 'completed');
            return;
          }

          if (job.name === 'followup-contact') {
            await runFollowupContact(job.data);
            await markCompleted(job);
            endJob(meta, ctxLog, job.name, 'completed');
            return;
          }

          if (job.name === 'scan-contact') {
            await runScanContact(job.data);
            await markCompleted(job);
            endJob(meta, ctxLog, job.name, 'completed');
            return;
          }

          if (job.name === AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB) {
            await runSweepUnreadConversations(job.data);
            await markCompleted(job);
            endJob(meta, ctxLog, job.name, 'completed');
            return;
          }

          if (job.name === 'catalog-contacts-30d') {
            await runCatalogContacts(job.data);
            await markCompleted(job);
            endJob(meta, ctxLog, job.name, 'completed');
            return;
          }

          if (job.name === 'score-contact') {
            await runScoreContact(job.data);
            await markCompleted(job);
            endJob(meta, ctxLog, job.name, 'completed');
            return;
          }

          if (job.name === 'cia-action') {
            await runCiaAction(job.data);
            await markCompleted(job);
            endJob(meta, ctxLog, job.name, 'completed');
            return;
          }

          if (job.name === 'cia-self-improve') {
            const workspaceId = job.data?.workspaceId;
            if (workspaceId) {
              await runCiaSelfImproveWorkspace(workspaceId);
            } else {
              await runCiaSelfImproveAll();
            }
            await markCompleted(job);
            endJob(meta, ctxLog, job.name, 'completed');
            return;
          }

          if (job.name === 'cia-global-learn') {
            await runCiaGlobalLearningAll();
            await markCompleted(job);
            endJob(meta, ctxLog, job.name, 'completed');
            return;
          }

          await job.updateProgress(90);
          await runScanContact(job.data);
          await markCompleted(job);
          endJob(meta, ctxLog, job.name, 'completed');
          return;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logError(meta, ctxLog, err, job.name);
          autopilotDecisionCounter.inc({
            workspaceId: job.data?.workspaceId || 'unknown',
            intent: 'ERROR',
            action: 'NONE',
            result: 'error',
          });

          if (!isRetryableError(err)) {
            throw new WorkerError(msg, 'AUTOPILOT_PERMANENT', false);
          }

          throw err;
        }
      },
      { ...buildQueueOptions(), concurrency: 4, lockDuration: 60000 },
    )
  : null;

export {
  runCatalogContacts,
  runCiaAction,
  runCiaCycleWorkspace,
  runCiaGlobalLearningAll,
  runCycleWorkspace,
  runFollowupContact,
  runScanContact,
  runScoreContact,
  runSweepUnreadConversations,
};
