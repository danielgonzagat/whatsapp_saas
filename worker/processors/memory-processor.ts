import { type Job, Worker } from 'bullmq';
import OpenAI from 'openai';
import { prisma } from '../db';
import { WorkerLogger } from '../logger';
import { LeadScorer } from '../providers/lead-scorer';
import { connection } from '../queue';
import { processFactExtraction } from './fact-extractor';

const S_RE = /\s+/g;

const log = new WorkerLogger('memory-worker');

export const memoryWorker = new Worker(
  'memory-jobs',
  async (job: Job) => {
    log.info('memory_job_start', { jobId: job.id, name: job.name });
    try {
      switch (job.name) {
        // PULSE:OK — extract-facts is enqueued by unified-agent and inbound-processor via memory queue
        case 'extract-facts':
          await processFactExtraction(job);
          break;

        // PULSE:OK — analyze-contact is enqueued by whatsapp.service via memory queue
        case 'analyze-contact':
          await LeadScorer.analyze(job.data.workspaceId, job.data.contactId);
          break;

        case 'ingest-source': {
          const { workspaceId, sourceId, content, type, maxChunks } = job.data;
          log.info('ingest_source_start', { sourceId, type });

          const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
          const apiKey =
            ((
              (workspace?.providerSettings as Record<string, unknown> | null)?.openai as
                | Record<string, unknown>
                | undefined
            )?.apiKey as string | undefined) || process.env.OPENAI_API_KEY;

          if (!apiKey) {
            await prisma.knowledgeSource.update({
              where: { id: sourceId },
              data: { status: 'FAILED' },
            });
            throw new Error('No OpenAI Key for embedding');
          }

          const openai = new OpenAI({ apiKey });

          // Chunking Logic
          const chunks = splitText(content, 1000, 200).slice(0, maxChunks || 400);

          // biome-ignore lint/performance/noAwaitInLoops: sequential chunk processing
          for (const chunk of chunks) {
            const embeddingResponse = await openai.embeddings.create({
              model: 'text-embedding-3-small',
              input: chunk,
            });
            const vector = embeddingResponse.data[0].embedding;
            const vectorStr = `[${vector.join(',')}]`;

            // Raw Query for Vector Insert
            await prisma.$executeRaw`
                     INSERT INTO "Vector" ("id", "content", "embedding", "sourceId")
                     VALUES (gen_random_uuid(), ${chunk}, ${vectorStr}::vector, ${sourceId});
                 `;
          }

          await prisma.knowledgeSource.update({
            where: { id: sourceId },
            data: { status: 'INDEXED' },
          });
          log.info('ingest_source_complete', { sourceId, chunks: chunks.length });
          break;
        }

        default:
          log.warn('unknown_memory_job', { name: job.name });
      }
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      log.error('memory_job_failed', { jobId: job.id, error: errInstanceofError.message });

      if (job.name === 'ingest-source' && job.data.sourceId) {
        await prisma.knowledgeSource
          .update({
            where: { id: job.data.sourceId },
            data: { status: 'FAILED' },
          })
          .catch((err) =>
            log.warn?.('mark_source_failed_error', {
              error: errInstanceofError?.message || String(err),
            }),
          );
      }
      throw err;
    }
  },
  { connection, concurrency: 5 },
);

function splitText(text: string, chunkSize: number, chunkOverlap = 200): string[] {
  if (!text) return [];
  const cleanText = text.replace(S_RE, ' ').trim();
  if (cleanText.length <= chunkSize) return [cleanText];

  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < cleanText.length) {
    let endIndex = startIndex + chunkSize;
    if (endIndex < cleanText.length) {
      let splitIndex = -1;
      const sentenceEndings = ['. ', '? ', '! '];
      for (const ending of sentenceEndings) {
        const idx = cleanText.lastIndexOf(ending, endIndex);
        if (idx > startIndex + chunkSize * 0.5 && idx > splitIndex) {
          splitIndex = idx + 1;
        }
      }
      if (splitIndex !== -1) endIndex = splitIndex;
      else {
        const lastSpace = cleanText.lastIndexOf(' ', endIndex);
        if (lastSpace > startIndex) endIndex = lastSpace;
      }
    }
    const chunk = cleanText.substring(startIndex, endIndex).trim();
    if (chunk) chunks.push(chunk);
    if (endIndex >= cleanText.length) break;
    startIndex = Math.max(startIndex + 1, endIndex - chunkOverlap);
  }
  return chunks;
}
