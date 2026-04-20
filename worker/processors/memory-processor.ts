import { type Job, Worker } from 'bullmq';
import OpenAI from 'openai';
import { prisma } from '../db';
import { WorkerLogger } from '../logger';
import { LeadScorer } from '../providers/lead-scorer';
import { connection } from '../queue';
import { forEachSequential } from '../utils/async-sequence';
import { processFactExtraction } from './fact-extractor';

const S_RE = /\s+/g;
const SENTENCE_ENDINGS = ['. ', '? ', '! '];

const log = new WorkerLogger('memory-worker');

function resolveOpenAIKey(workspace: { providerSettings: unknown } | null): string | undefined {
  const providerSettings = workspace?.providerSettings as Record<string, unknown> | null;
  const openai = providerSettings?.openai as Record<string, unknown> | undefined;
  const fromWorkspace = openai?.apiKey as string | undefined;
  return fromWorkspace || process.env.OPENAI_API_KEY;
}

async function insertChunkVector(openai: OpenAI, chunk: string, sourceId: string): Promise<void> {
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: chunk,
  });
  const vector = embeddingResponse.data[0].embedding;
  const vectorStr = `[${vector.join(',')}]`;

  await prisma.$executeRaw`
    INSERT INTO "Vector" ("id", "content", "embedding", "sourceId")
    VALUES (gen_random_uuid(), ${chunk}, ${vectorStr}::vector, ${sourceId});
  `;
}

async function processIngestSource(job: Job): Promise<void> {
  const { workspaceId, sourceId, content, type, maxChunks } = job.data;
  log.info('ingest_source_start', { sourceId, type });

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  const apiKey = resolveOpenAIKey(workspace);

  if (!apiKey) {
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: 'FAILED' },
    });
    throw new Error('No OpenAI Key for embedding');
  }

  const openai = new OpenAI({ apiKey });
  const chunks = splitText(content, 1000, 200).slice(0, maxChunks || 400);

  await forEachSequential(chunks, async (chunk) => {
    await insertChunkVector(openai, chunk, sourceId);
  });

  await prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: { status: 'INDEXED' },
  });
  log.info('ingest_source_complete', { sourceId, chunks: chunks.length });
}

async function dispatchMemoryJob(job: Job): Promise<void> {
  switch (job.name) {
    // PULSE:OK — extract-facts is enqueued by unified-agent and inbound-processor via memory queue
    case 'extract-facts':
      await processFactExtraction(job);
      return;

    // PULSE:OK — analyze-contact is enqueued by whatsapp.service via memory queue
    case 'analyze-contact':
      await LeadScorer.analyze(job.data.workspaceId, job.data.contactId);
      return;

    case 'ingest-source':
      await processIngestSource(job);
      return;

    default:
      log.warn('unknown_memory_job', { name: job.name });
  }
}

async function handleMemoryJobFailure(job: Job, err: unknown): Promise<void> {
  const errInstanceofError =
    err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
  log.error('memory_job_failed', { jobId: job.id, error: errInstanceofError.message });

  if (job.name === 'ingest-source' && job.data.sourceId) {
    await prisma.knowledgeSource
      .update({
        where: { id: job.data.sourceId },
        data: { status: 'FAILED' },
      })
      .catch((updateErr) =>
        log.warn?.('mark_source_failed_error', {
          error: errInstanceofError?.message || String(updateErr),
        }),
      );
  }
}

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
  { connection, concurrency: 5 },
);

const isSplitCandidate = (
  idx: number,
  startIndex: number,
  endIndex: number,
  splitIndex: number,
): boolean => idx > startIndex + (endIndex - startIndex) * 0.5 && idx > splitIndex;

const findSentenceSplit = (cleanText: string, startIndex: number, endIndex: number): number => {
  let splitIndex = -1;
  for (const ending of SENTENCE_ENDINGS) {
    const idx = cleanText.lastIndexOf(ending, endIndex);
    if (isSplitCandidate(idx, startIndex, endIndex, splitIndex)) {
      splitIndex = idx + 1;
    }
  }
  return splitIndex;
};

const findChunkEnd = (cleanText: string, startIndex: number, chunkSize: number): number => {
  const endIndex = startIndex + chunkSize;
  if (endIndex >= cleanText.length) {
    return endIndex;
  }

  const splitIndex = findSentenceSplit(cleanText, startIndex, endIndex);
  if (splitIndex !== -1) {
    return splitIndex;
  }

  const lastSpace = cleanText.lastIndexOf(' ', endIndex);
  if (lastSpace > startIndex) {
    return lastSpace;
  }
  return endIndex;
};

const splitText = (text: string, chunkSize: number, chunkOverlap = 200): string[] => {
  if (!text) {
    return [];
  }
  const cleanText = text.replace(S_RE, ' ').trim();
  if (cleanText.length <= chunkSize) {
    return [cleanText];
  }

  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < cleanText.length) {
    const endIndex = findChunkEnd(cleanText, startIndex, chunkSize);
    const chunk = cleanText.substring(startIndex, endIndex).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    if (endIndex >= cleanText.length) {
      break;
    }
    startIndex = Math.max(startIndex + 1, endIndex - chunkOverlap);
  }
  return chunks;
};
