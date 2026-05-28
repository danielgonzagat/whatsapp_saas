import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { resolveWorkerOpenAIModel } from './openai-models';
import { forEachSequential } from '../utils/async-sequence';

const prisma = new PrismaClient();

/** Semantic memory. */
export class SemanticMemory {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Extract facts from a conversation and store them as vectors.
   *
   * Hardened 2026-05-26 per WAVE3_LLM_PROMPT_AUDIT critical gap #3:
   * previously had no max_tokens cap, swallowed JSON parse failures
   * silently, and let OpenAI failures bubble up to crash the worker job.
   * Now caps tokens, logs parse failures, and degrades gracefully on
   * transient OpenAI errors.
   */
  async extractAndStoreFacts(workspaceId: string, contactId: string, conversationText: string) {
    // 1. Extract Facts using LLM
    let extraction;
    try {
      extraction = await this.openai.chat.completions.create({
        model: resolveWorkerOpenAIModel('brain'),
        messages: [
          {
            role: 'system',
            content: `You are a Memory Manager. Extract key facts about the user from the conversation.
            Focus on: Preferences, Personal Details (Name, Job, Family), Buying Intent, Constraints.
            Return a JSON object with shape {"facts": ["fact 1", "fact 2"]}. Example: {"facts":["User likes red shoes","User has a dog named Rex"]}`,
          },
          { role: 'user', content: conversationText },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 600,
      });
    } catch (err) {
      console.warn(
        `[semantic-memory] fact extraction LLM call failed for workspace=${workspaceId} contact=${contactId}:`,
        err instanceof Error ? err.message : String(err),
      );
      return;
    }

    const content = extraction.choices[0]?.message?.content;
    if (!content) {
      console.warn(
        `[semantic-memory] empty LLM content for workspace=${workspaceId} contact=${contactId}`,
      );
      return;
    }

    let factsData: unknown = {};
    try {
      factsData = JSON.parse(content);
    } catch (err) {
      console.warn(
        `[semantic-memory] invalid JSON from model for workspace=${workspaceId} contact=${contactId}:`,
        err instanceof Error ? err.message : String(err),
      );
      return;
    }
    const parsed = factsData as Record<string, unknown>;
    const facts: string[] = Array.isArray(parsed?.facts) ? (parsed.facts as string[]) : [];

    // 2. Store Facts in KnowledgeBase (using a special "User Memory" KB or tagging source)
    // Since we don't have a dedicated "UserFact" table with vectors in the schema yet,
    // we will leverage the existing 'KnowledgeSource' and 'Vector' tables.
    // We can create a KnowledgeBase per Contact or a global one with metadata.
    // For MVP/Top 1 Level without schema change: We use a specific naming convention for the Source.

    // Find or Create a "Memory" Knowledge Base for this Workspace
    let kb = await prisma.knowledgeBase.findFirst({
      where: { workspaceId, name: 'User Memory' },
    });

    if (!kb) {
      kb = await prisma.knowledgeBase.create({
        data: { workspaceId, name: 'User Memory', description: 'Long-term memory of user facts' },
      });
    }

    await forEachSequential(facts, async (fact) => {
      // Generate Embedding
      const embeddingResponse = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: fact,
      });
      const embedding = embeddingResponse.data[0].embedding;

      // Create Source (representing the fact)
      // We store the contactId in the content or metadata to filter later?
      // The schema for KnowledgeSource is simple. We can prefix content with `[Contact:${contactId}]`.
      const factContent = `[Contact:${contactId}] ${fact}`;

      const source = await prisma.knowledgeSource.create({
        data: {
          knowledgeBaseId: kb.id,
          type: 'TEXT',
          content: factContent,
          status: 'INDEXED',
        },
      });

      // Store Vector (using raw query for pgvector if Prisma doesn't support it fully yet in this version,
      // but schema says Unsupported("vector"). We usually need raw SQL to insert vectors).

      // Construct vector string '[0.1, 0.2, ...]'
      const vectorStr = `[${embedding.join(',')}]`;

      await prisma.$executeRaw`
            INSERT INTO "RAC_Vector" ("id", "content", "embedding", "sourceId")
            VALUES (gen_random_uuid(), ${fact}, ${vectorStr}::vector, ${source.id});
        `;
    });
  }

  /**
   * Retrieve relevant facts for a user
   */
  async recall(workspaceId: string, contactId: string, query: string): Promise<string[]> {
    // 1. Embed Query
    const embeddingResponse = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });
    const embedding = embeddingResponse.data[0].embedding;
    const vectorStr = `[${embedding.join(',')}]`;

    // 2. Search Vector Store (Hybrid Search: Filter by ContactId AND Semantic Similarity)
    // We look for sources that start with `[Contact:${contactId}]`

    const results = (await prisma.$queryRaw`
        SELECT v.content, 1 - (v.embedding <=> ${vectorStr}::vector) as similarity
        FROM "RAC_Vector" v
        JOIN "RAC_KnowledgeSource" s ON v."sourceId" = s.id
        JOIN "RAC_KnowledgeBase" kb ON s."knowledgeBaseId" = kb.id
        WHERE kb."workspaceId" = ${workspaceId}
        AND kb."name" = 'User Memory'
        AND s.content LIKE ${`[Contact:${contactId}]%`}
        ORDER BY similarity DESC
        LIMIT 5;
    `) as Array<{ content: string }>;

    return results.map((r) => r.content.replace(`[Contact:${contactId}] `, ''));
  }
}
