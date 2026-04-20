import type { Job } from 'bullmq';
import { prisma } from '../db';
import { WorkerLogger } from '../logger';
import { SemanticMemory } from '../providers/semantic-memory';

const log = new WorkerLogger('fact-extractor');

/** Process fact extraction. */
export async function processFactExtraction(job: Job) {
  const { workspaceId, contactId, conversationText } = job.data;
  log.info('start_extraction', { workspaceId, contactId });

  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    const apiKey =
      ((
        (workspace?.providerSettings as Record<string, unknown> | null)?.openai as
          | Record<string, unknown>
          | undefined
      )?.apiKey as string | undefined) || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      log.warn('missing_api_key', { workspaceId });
      return;
    }

    const memory = new SemanticMemory(apiKey);
    await memory.extractAndStoreFacts(workspaceId, contactId, conversationText);

    log.info('extraction_complete', { workspaceId, contactId });
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.error('extraction_failed', { error: errInstanceofError.message });
    throw err;
  }
}
