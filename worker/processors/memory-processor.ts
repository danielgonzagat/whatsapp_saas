import { type Job, Worker } from 'bullmq';
import OpenAI from 'openai';
import { prisma } from '../db';
import { WorkerLogger } from '../logger';
import { LeadScorer } from '../providers/lead-scorer';
import { connection } from '../queue';
import { forEachSequential } from '../utils/async-sequence';
import { processFactExtraction } from './fact-extractor';
import {
  type SerializedInputTokenBillingDescriptor,
  quoteSerializedInputTokenCostCents,
  settleQuotedUsageCharge,
} from './prepaid-wallet-settlement';
import { WorkerError } from '../src/utils/error-handler';

const WHITESPACE_RE = /\s+/g;
const SENTENCE_ENDINGS = ['. ', '? ', '! '];
const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 200;
const DEFAULT_MAX_CHUNKS = 400;
const SPLIT_BIAS_NUMERATOR = 1;
const SPLIT_BIAS_DENOMINATOR = 2;
const NO_SPLIT_INDEX = -1;
const MIN_OFFSET = 1;
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
 *
 * @param openai - Provider client.
 * @param chunk - Text chunk to embed.
 * @param sourceId - Knowledge source identifier.
 * @returns Total tokens billed for the embedding call.
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
 *
 * @param input - Settlement input bundle.
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
const processIngestSource = async (job: Job): Promise<void> => {
  const data = job.data as IIngestSourceJobData;
  const { workspaceId, sourceId, content, type: sourceType, maxChunks, walletUsage } = data;
  log.info('ingest_source_start', { sourceId, type: sourceType });

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
    processed++;
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
  log.info('ingest_source_complete', {
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
const dispatchMemoryJob = async (job: Job): Promise<void> => {
  switch (job.name) {
    // PULSE:OK - extract-facts is enqueued by unified-agent and inbound-processor via memory queue
    case 'extract-facts':
      await processFactExtraction(job);

      return;

    // PULSE:OK - analyze-contact is enqueued by whatsapp.service via memory queue
    case 'analyze-contact':
      await LeadScorer.analyze(job.data.workspaceId, job.data.contactId);

      return;

    case 'ingest-source':
      await processIngestSource(job);

      return;

    default:
      log.warn('unknown_memory_job', { name: job.name });
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
const handleMemoryJobFailure = async (job: Job, err: unknown): Promise<void> => {
  const errInstance = toError(err);
  log.error('memory_job_failed', { error: errInstance.message, jobId: job.id });

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
    log.info('memory_job_start', { jobId: job.id, name: job.name });
    try {
      await dispatchMemoryJob(job);
    } catch (err: unknown) {
      await handleMemoryJobFailure(job, err);
      throw err;
    }
  },
  { concurrency: WORKER_CONCURRENCY, connection, lockDuration: 300_000 },
);

/**
 * Decide whether `idx` is a better split candidate than the current best.
 *
 * @param idx - Candidate sentence-ending index.
 * @param startIndex - Lower bound of the current chunk.
 * @param endIndex - Upper bound of the current chunk.
 * @param splitIndex - Best split index found so far.
 * @returns `true` when `idx` should replace `splitIndex`.
 */
const isSplitCandidate = (
  idx: number,
  startIndex: number,
  endIndex: number,
  splitIndex: number,
): boolean => {
  const halfwayIndex =
    startIndex + ((endIndex - startIndex) * SPLIT_BIAS_NUMERATOR) / SPLIT_BIAS_DENOMINATOR;

  return idx > halfwayIndex && idx > splitIndex;
};

/**
 * Locate the best sentence-ending split position within `[startIndex, endIndex]`.
 *
 * @param cleanText - Whitespace-normalised text.
 * @param startIndex - Lower bound (inclusive).
 * @param endIndex - Upper bound (inclusive).
 * @returns Split position (>=0) or `NO_SPLIT_INDEX` when no candidate exists.
 */
const findSentenceSplit = (cleanText: string, startIndex: number, endIndex: number): number => {
  let splitIndex = NO_SPLIT_INDEX;
  for (const ending of SENTENCE_ENDINGS) {
    const idx = cleanText.lastIndexOf(ending, endIndex);
    if (isSplitCandidate(idx, startIndex, endIndex, splitIndex)) {
      splitIndex = idx + 1;
    }
  }

  return splitIndex;
};

/**
 * Find the optimal end index for a chunk starting at `startIndex`.
 *
 * Prefers sentence boundaries; falls back to the last word boundary; finally
 * uses the hard `chunkSize` cut.
 *
 * @param cleanText - Whitespace-normalised text.
 * @param startIndex - Chunk start index.
 * @param chunkSize - Target chunk size in characters.
 * @returns Exclusive end index for the chunk.
 */
const findChunkEnd = (cleanText: string, startIndex: number, chunkSize: number): number => {
  const endIndex = startIndex + chunkSize;
  if (endIndex >= cleanText.length) {
    return endIndex;
  }

  const splitIndex = findSentenceSplit(cleanText, startIndex, endIndex);
  if (splitIndex !== NO_SPLIT_INDEX) {
    return splitIndex;
  }

  const lastSpace = cleanText.lastIndexOf(' ', endIndex);
  if (lastSpace > startIndex) {
    return lastSpace;
  }

  return endIndex;
};

/**
 * Compute the next chunk start, applying the configured overlap while
 * guaranteeing forward progress (>=1 character per iteration).
 *
 * @param startIndex - Current chunk start.
 * @param endIndex - Current chunk end.
 * @param chunkOverlap - Desired overlap in characters.
 * @returns Next chunk start index.
 */
const nextStartIndex = (startIndex: number, endIndex: number, chunkOverlap: number): number =>
  Math.max(startIndex + MIN_OFFSET, endIndex - chunkOverlap);

/**
 * Append `chunk` to `chunks` if it carries any non-whitespace content.
 *
 * @param chunks - Mutable accumulator of chunks built so far.
 * @param chunk - Candidate chunk.
 */
const pushIfNonEmpty = (chunks: string[], chunk: string): void => {
  const trimmed = chunk.trim();
  if (trimmed) {
    chunks.push(trimmed);
  }
};

/**
 * Split `text` into overlapping chunks suitable for vector embedding.
 *
 * Algorithm preserves sentence boundaries when possible and never produces an
 * empty chunk. The whitespace-normalised result is deterministic for the
 * given inputs.
 *
 * @param text - Source text.
 * @param chunkSize - Target chunk size in characters.
 * @param chunkOverlap - Overlap between consecutive chunks (default 200).
 * @returns Ordered list of non-empty chunks.
 */
const splitText = (
  text: string,
  chunkSize: number,
  chunkOverlap: number = DEFAULT_CHUNK_OVERLAP,
): string[] => {
  if (!text) {
    return [];
  }
  const cleanText = text.replace(WHITESPACE_RE, ' ').trim();
  if (cleanText.length <= chunkSize) {
    return [cleanText];
  }

  const chunks: string[] = [];
  let startIndex = 0;
  while (startIndex < cleanText.length) {
    const endIndex = findChunkEnd(cleanText, startIndex, chunkSize);
    pushIfNonEmpty(chunks, cleanText.substring(startIndex, endIndex));
    if (endIndex >= cleanText.length) {
      break;
    }
    startIndex = nextStartIndex(startIndex, endIndex, chunkOverlap);
  }

  return chunks;
};
