/**
 * ARCHITECTURAL COHESION: This file is the Memory Processing Worker.
 * It hosts the BullMQ worker for the `memory-jobs` queue, dispatching
 * `ingest-source`, `extract-facts`, and `analyze-contact` jobs. The text
 * splitting algorithm is extracted to memory-text-splitter.ts. What remains
 * is the embedding pipeline (chunk → vector → wallet settlement), the job
 * dispatch switch, and the failure cleanup — all tied to the memory worker's
 * BullMQ lifecycle.
 */

import { type Job, Worker } from 'bullmq';
import OpenAI from 'openai';
import { prisma } from '../db';
import { WorkerLogger } from '../logger';
import { LeadScorer } from '../providers/lead-scorer';
import { buildQueueOptions } from '../queue';
import { forEachSequential } from '../utils/async-sequence';
import { processFactExtraction } from './fact-extractor';
import {
  type SerializedInputTokenBillingDescriptor,
  quoteSerializedInputTokenCostCents,
  settleQuotedUsageCharge,
} from './prepaid-wallet-settlement';
import { WorkerError } from '../src/utils/error-handler';
import { checkIdempotent, endJob, logError, markCompleted, startJob } from '../processor-base';
import { DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE, splitText } from './memory-text-splitter';

const DEFAULT_MAX_CHUNKS = 400;
const WORKER_CONCURRENCY = 5;

const log = new WorkerLogger('memory-worker');

/** Wallet usage descriptor attached to ingest-source jobs. */
interface IIngestSourceWalletUsage {
  /** Operation tag (always `kb_ingestion`). */
  operation: 'kb_ingestion';
  /** Idempotency key shared with the original USAGE transaction. */
  requestId: string;
  /** Billing descriptor used to quote actual cost after embedding completes. */
  billing: SerializedInputTokenBillingDescriptor;
}

/** Job payload shape for the `ingest-source` BullMQ job. */
interface IIngestSourceJobData {
  /** Workspace identifier owning the knowledge source. */
  workspaceId: string;
  /** Knowledge source identifier. */
  sourceId: string;
  /** Raw text content to chunk and embed. */
  content: string;
  /** Source type tag (free-form, used only for logging). */
  type: string;
  /** Optional cap on the number of chunks to embed. */
  maxChunks?: number;
  /** Optional wallet settlement descriptor. */
  walletUsage?: IIngestSourceWalletUsage | null;
}

/**
 * Resolve the OpenAI key for a workspace, falling back to the env var.
 *
 * @param workspace - Workspace record (or `null` if not found).
 * @returns API key when one is configured, otherwise `undefined`.
 */
const resolveOpenAIKey = (workspace: { providerSettings: unknown } | null): string | undefined => {
  const providerSettings = workspace?.providerSettings as Record<string, unknown> | null;
  const openaiSettings = providerSettings?.openai as Record<string, unknown> | undefined;
  const fromWorkspace = openaiSettings?.apiKey as string | undefined;

  return fromWorkspace || process.env.OPENAI_API_KEY;
};

/**
 * Embed a single chunk and persist its vector. Returns the token count
 * reported by the provider, or `0` if the response omits usage info.
 */
const insertChunkVector = async (
  openai: OpenAI,
  chunk: string,
  sourceId: string,
): Promise<number> => {
  const embeddingResponse = await openai.embeddings.create({
    input: chunk,
    model: 'text-embedding-3-small',
  });
  const firstEmbedding = embeddingResponse.data[0];
  const vector = firstEmbedding.embedding;
  const vectorStr = `[${vector.join(',')}]`;

  await prisma.$executeRaw`
    INSERT INTO "RAC_Vector" ("id", "content", "embedding", "sourceId")
    VALUES (gen_random_uuid(), ${chunk}, ${vectorStr}::vector, ${sourceId});
  `;

  const responseWithUsage = embeddingResponse as { usage?: { total_tokens?: number } };

  return responseWithUsage.usage?.total_tokens ?? 0;
};

/**
 * Settle the wallet usage that was quoted before embedding started.
 */
const settleIngestUsage = async (input: {
  workspaceId: string;
  sourceId: string;
  walletUsage: IIngestSourceWalletUsage;
  actualInputTokens: bigint;
  chunkCount: number;
}): Promise<void> => {
  const { workspaceId, sourceId, walletUsage, actualInputTokens, chunkCount } = input;

  await settleQuotedUsageCharge({
    actualCostCents: quoteSerializedInputTokenCostCents({
      billing: walletUsage.billing,
      inputTokens: actualInputTokens,
    }),
    metadata: {
      actualInputTokens: actualInputTokens.toString(),
      capability: 'source_ingestion',
      channel: 'knowledge_base',
      chunkCount,
      model: walletUsage.billing.model,
      sourceId,
    },
    operation: walletUsage.operation,
    reason: 'knowledge_base_embedding_provider_usage',
    requestId: walletUsage.requestId,
    workspaceId,
  });
};

/**
 * Mark a knowledge source as failed. Failures are swallowed: this is best
 * effort cleanup invoked from error paths.
 *
 * @param sourceId - Knowledge source identifier.
 */
const markSourceFailed = async (sourceId: string): Promise<void> => {
  await prisma.knowledgeSource.update({
    data: { status: 'FAILED' },
    where: { id: sourceId },
  });
};

/**
 * Process an `ingest-source` job: fetch workspace, embed chunks, settle the
 * wallet, and mark the source as `INDEXED`.
 *
 * @param job - BullMQ job instance.
 */
const processIngestSource = async (job: Job, ctxLog: WorkerLogger): Promise<void> => {
  const data = job.data as IIngestSourceJobData;
  const { workspaceId, sourceId, content, type: sourceType, maxChunks, walletUsage } = data;
  ctxLog.info('ingest_source_start', { sourceId, type: sourceType });

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  const apiKey = resolveOpenAIKey(workspace);

  if (!apiKey) {
    await markSourceFailed(sourceId);
    throw new WorkerError('No OpenAI Key for embedding', 'MEMORY_NO_API_KEY', false);
  }

  const openai = new OpenAI({ apiKey });
  const chunks = splitText(content, DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP).slice(
    0,
    maxChunks || DEFAULT_MAX_CHUNKS,
  );
  let actualInputTokens = BigInt(0);

  await job.updateProgress(10);
  let processed = 0;
  await forEachSequential(chunks, async (chunk) => {
    actualInputTokens += BigInt(await insertChunkVector(openai, chunk, sourceId));
    processed += 1;
    if (chunks.length > 0) {
      await job.updateProgress(10 + Math.floor((80 * processed) / chunks.length));
    }
  });

  if (walletUsage) {
    await settleIngestUsage({
      actualInputTokens,
      chunkCount: chunks.length,
      sourceId,
      walletUsage,
      workspaceId,
    });
  }

  await job.updateProgress(90);
  await prisma.knowledgeSource.update({
    data: { status: 'INDEXED' },
    where: { id: sourceId },
  });
  await job.updateProgress(100);
  ctxLog.info('ingest_source_complete', {
    actualInputTokens: actualInputTokens.toString(),
    chunks: chunks.length,
    sourceId,
  });
};

/**
 * Dispatch a memory job to its handler. Unknown job names are logged and
 * dropped (BullMQ marks the job complete) to avoid a poison-message loop.
 *
 * @param job - BullMQ job instance.
 */
const dispatchMemoryJob = async (job: Job, ctxLog: WorkerLogger): Promise<void> => {
  switch (job.name) {
    case 'extract-facts':
      await processFactExtraction(job);

      return;

    case 'analyze-contact':
      await LeadScorer.analyze(job.data.workspaceId, job.data.contactId);

      return;

    case 'ingest-source':
      await processIngestSource(job, ctxLog);

      return;

    default:
      ctxLog.warn('unknown_memory_job', { name: job.name });
  }
};

/**
 * Best-effort cleanup of partial vectors when an `ingest-source` job fails.
 * Failures during cleanup are logged but do not propagate (the original error
 * is what BullMQ surfaces).
 *
 * @param sourceId - Knowledge source identifier.
 * @param errMessage - Original error message (used for the failure log entry).
 */
const cleanupFailedIngest = async (sourceId: string, errMessage: string): Promise<void> => {
  await prisma.vector.deleteMany({ where: { sourceId } }).catch((deleteErr) => {
    log.warn?.('cleanup_source_vectors_failed', {
      error: deleteErr instanceof Error ? deleteErr.message : String(deleteErr),
      sourceId,
    });
  });
  await prisma.knowledgeSource
    .update({ data: { status: 'FAILED' }, where: { id: sourceId } })
    .catch((updateErr) => {
      log.warn?.('mark_source_failed_error', {
        error: errMessage || String(updateErr),
      });
    });
};

/**
 * Convert an unknown thrown value into an `Error` instance.
 *
 * @param err - Raw thrown value.
 * @returns An Error with a stable shape for logging.
 */
const toError = (err: unknown): Error => {
  if (err instanceof Error) {
    return err;
  }

  return new Error(typeof err === 'string' ? err : 'unknown error');
};

/**
 * Job-level failure handler. Logs the error and runs handler-specific cleanup
 * for `ingest-source` jobs. The error is re-thrown by the worker callback so
 * BullMQ can apply its retry policy.
 *
 * @param job - BullMQ job instance.
 * @param err - Error thrown by the dispatcher.
 */
const handleMemoryJobFailure = async (
  job: Job,
  err: unknown,
  ctxLog: WorkerLogger,
): Promise<void> => {
  const errInstance = toError(err);
  ctxLog.error('memory_job_failed', { error: errInstance.message, jobId: job.id });

  if (job.name === 'ingest-source' && job.data.sourceId) {
    await cleanupFailedIngest(String(job.data.sourceId), errInstance.message);
  }
};

/** Memory worker. Idempotency relies on per-job semantics:
 *  `extract-facts` and `analyze-contact` are safe to replay; `ingest-source`
 *  uses settleQuotedUsageCharge's `(operation, requestId)` idempotency. */
export const memoryWorker = new Worker(
  'memory-jobs',
  async (job: Job) => {
    const meta = startJob(job, log);
    const ctxLog = log.withContext(meta.correlationId, meta.workspaceId);

    try {
      const dedup = await checkIdempotent(job);
      if (dedup) {
        ctxLog.info('job_skipped_idempotent', { jobId: job.id });
        endJob(meta, ctxLog, job.name, 'skipped');
        return;
      }

      await dispatchMemoryJob(job, ctxLog);
      await markCompleted(job);
      endJob(meta, ctxLog, job.name, 'completed');
    } catch (err: unknown) {
      logError(meta, ctxLog, err, job.name);
      await handleMemoryJobFailure(job, err, ctxLog);
      throw err;
    }
  },
  { concurrency: WORKER_CONCURRENCY, ...buildQueueOptions(), lockDuration: 300_000 },
);
