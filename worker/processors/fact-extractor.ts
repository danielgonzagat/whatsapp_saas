import { Job } from "bullmq";
import { WorkerLogger } from "../logger";
import { SemanticMemory } from "../providers/semantic-memory";
import { prisma } from "../db";

const log = new WorkerLogger("fact-extractor");

export async function processFactExtraction(job: Job) {
  const { workspaceId, contactId, conversationText } = job.data;
  log.info("start_extraction", { workspaceId, contactId });

  try {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    const apiKey = (workspace?.providerSettings as any)?.openai?.apiKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
        log.warn("missing_api_key", { workspaceId });
        return;
    }

    const memory = new SemanticMemory(apiKey);
    await memory.extractAndStoreFacts(workspaceId, contactId, conversationText);
    
    log.info("extraction_complete", { workspaceId, contactId });
  } catch (err: any) {
    log.error("extraction_failed", { error: err.message });
    throw err;
  }
}
