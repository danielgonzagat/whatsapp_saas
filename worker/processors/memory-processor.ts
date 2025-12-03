import { Worker, Job } from "bullmq";
import { connection } from "../queue";
import { WorkerLogger } from "../logger";
import { processFactExtraction } from "./fact-extractor";
import { LeadScorer } from "../providers/lead-scorer";
import { prisma } from "../db";
import OpenAI from "openai";

const log = new WorkerLogger("memory-worker");

export const memoryWorker = new Worker(
  "memory-jobs",
  async (job: Job) => {
    log.info("memory_job_start", { jobId: job.id, name: job.name });
    try {
      switch (job.name) {
        case "extract-facts":
          await processFactExtraction(job);
          break;

        case "analyze-contact":
          await LeadScorer.analyze(job.data.workspaceId, job.data.contactId);
          break;

        case "ingest-source": {
            const { workspaceId, sourceId, content, type, maxChunks } = job.data;
            log.info("ingest_source_start", { sourceId, type });

            const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
            const apiKey = (workspace?.providerSettings as any)?.openai?.apiKey || process.env.OPENAI_API_KEY;

            if (!apiKey) {
                 await prisma.knowledgeSource.update({
                    where: { id: sourceId },
                    data: { status: "FAILED" }
                 });
                 throw new Error("No OpenAI Key for embedding");
            }

            const openai = new OpenAI({ apiKey });

            // Chunking Logic
            const chunks = splitText(content, 1000, 200).slice(0, maxChunks || 400);
            
            for (const chunk of chunks) {
                 const embeddingResponse = await openai.embeddings.create({
                     model: "text-embedding-3-small",
                     input: chunk
                 });
                 const vector = embeddingResponse.data[0].embedding;
                 const vectorStr = `[${vector.join(",")}]`;
                 
                 // Raw Query for Vector Insert
                 await prisma.$executeRaw`
                     INSERT INTO "Vector" ("id", "content", "embedding", "sourceId")
                     VALUES (gen_random_uuid(), ${chunk}, ${vectorStr}::vector, ${sourceId});
                 `;
            }
            
            await prisma.knowledgeSource.update({
                where: { id: sourceId },
                data: { status: "INDEXED" }
            });
            log.info("ingest_source_complete", { sourceId, chunks: chunks.length });
            break;
        }

        default:
          log.warn("unknown_memory_job", { name: job.name });
      }
    } catch (err: any) {
      log.error("memory_job_failed", { jobId: job.id, error: err.message });
      
      if (job.name === "ingest-source" && job.data.sourceId) {
           await prisma.knowledgeSource.update({
               where: { id: job.data.sourceId },
               data: { status: "FAILED" }
           }).catch(() => {});
      }
      throw err;
    }
  },
  { connection, concurrency: 5 }
);

function splitText(text: string, chunkSize: number, chunkOverlap = 200): string[] {
    if (!text) return [];
    const cleanText = text.replace(/\s+/g, ' ').trim();
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
