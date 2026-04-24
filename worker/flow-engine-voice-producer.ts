import { voiceQueue } from './queue';

/**
 * Tenant-scoped producer for the BullMQ voice-generation queue.
 *
 * Emits a `generate-audio` job whose payload always carries the
 * originating workspaceId. The consumer in `worker/voice-processor.ts`
 * filters every prisma lookup by `{ id, workspaceId }`, which means the
 * producer MUST propagate the workspace context — a missing or
 * wrong-workspace job id would silently return null on findFirst and
 * the handler would drop the work instead of leaking cross-tenant
 * state. Routing that invariant through this single entry point keeps
 * the tenant-isolation contract expressible without touching the
 * monolithic flow engine.
 */
export async function enqueueVoiceJob(
  jobId: string,
  workspaceId: string,
  text: string,
  profileId: string,
): Promise<void> {
  await voiceQueue.add('generate-audio', { jobId, workspaceId, text, profileId });
}
