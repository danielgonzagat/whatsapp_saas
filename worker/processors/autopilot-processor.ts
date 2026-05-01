import { type Job, Worker } from 'bullmq';
import { AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB } from '../contracts/autopilot-jobs';
import { autopilotDecisionCounter } from '../metrics';
import { connection } from '../queue';
import {
  log,
  SHOULD_RUN_AUTOPILOT_WORKER,
  runCatalogContacts,
  runCiaAction,
  runCiaCycleAll,
  runCiaCycleWorkspace,
  runCiaGlobalLearningAll,
  runCiaSelfImproveAll,
  runCiaSelfImproveWorkspace,
  runCycleAll,
  runCycleWorkspace,
  runFollowupContact,
  runScanContact,
  runScoreContact,
  runSweepUnreadConversations,
} from './__companions__/autopilot-core.companion';

/** Autopilot worker. */
export const autopilotWorker = SHOULD_RUN_AUTOPILOT_WORKER
  ? new Worker(
      'autopilot-jobs',
      async (job: Job) => {
        try {
          if (job.name === 'cycle-all') {
            return await runCycleAll();
          }

          if (job.name === 'cia-cycle-all') {
            return await runCiaCycleAll();
          }

          if (job.name === 'cycle-workspace') {
            const workspaceId = job.data?.workspaceId;
            if (workspaceId) {
              return await runCycleWorkspace(workspaceId);
            }
            return;
          }

          if (job.name === 'cia-cycle-workspace') {
            const workspaceId = job.data?.workspaceId;
            if (workspaceId) {
              return await runCiaCycleWorkspace(workspaceId);
            }
            return;
          }

          if (job.name === 'followup-contact') {
            return await runFollowupContact(job.data);
          }

          if (job.name === 'scan-contact') {
            return await runScanContact(job.data);
          }

          if (job.name === AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB) {
            return await runSweepUnreadConversations(job.data);
          }

          if (job.name === 'catalog-contacts-30d') {
            return await runCatalogContacts(job.data);
          }

          if (job.name === 'score-contact') {
            return await runScoreContact(job.data);
          }

          if (job.name === 'cia-action') {
            return await runCiaAction(job.data);
          }

          if (job.name === 'cia-self-improve') {
            const workspaceId = job.data?.workspaceId;
            if (workspaceId) {
              return await runCiaSelfImproveWorkspace(workspaceId);
            }
            return await runCiaSelfImproveAll();
          }

          if (job.name === 'cia-global-learn') {
            return await runCiaGlobalLearningAll();
          }

          return await runScanContact(job.data);
        } catch (err: unknown) {
          const errInstanceofError =
            err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
          log.error('autopilot_error', { error: errInstanceofError.message });
          autopilotDecisionCounter.inc({
            workspaceId: job.data?.workspaceId || 'unknown',
            intent: 'ERROR',
            action: 'NONE',
            result: 'error',
          });
        }
      },
      { connection, concurrency: 4, lockDuration: 60000 },
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
