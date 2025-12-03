import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";

const prisma = new PrismaClient();

export class SemanticMemory {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Extract facts from a conversation and store them as vectors
   */
  async extractAndStoreFacts(workspaceId: string, contactId: string, conversationText: string) {
    // 1. Extract Facts using LLM
    const extraction = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a Memory Manager. Extract key facts about the user from the conversation.
          Focus on: Preferences, Personal Details (Name, Job, Family), Buying Intent, Constraints.
          Return a JSON array of strings. Example: ["User likes red shoes", "User has a dog named Rex"]`
        },
        { role: "user", content: conversationText }
      ],
      response_format: { type: "json_object" }
    });

    const content = extraction.choices[0].message.content;
    if (!content) return;
    
    const facts = JSON.parse(content).facts || [];

    // 2. Store Facts in KnowledgeBase (using a special "User Memory" KB or tagging source)
    // Since we don't have a dedicated "UserFact" table with vectors in the schema yet,
    // we will leverage the existing 'KnowledgeSource' and 'Vector' tables.
    // We can create a KnowledgeBase per Contact or a global one with metadata.
    // For MVP/Top 1 Level without schema change: We use a specific naming convention for the Source.

    // Find or Create a "Memory" Knowledge Base for this Workspace
    let kb = await prisma.knowledgeBase.findFirst({
        where: { workspaceId, name: "User Memory" }
    });

    if (!kb) {
        kb = await prisma.knowledgeBase.create({
            data: { workspaceId, name: "User Memory", description: "Long-term memory of user facts" }
        });
    }

    for (const fact of facts) {
        // Generate Embedding
        const embeddingResponse = await this.openai.embeddings.create({
            model: "text-embedding-3-small",
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
                type: "TEXT",
                content: factContent,
                status: "INDEXED"
            }
        });

        // Store Vector (using raw query for pgvector if Prisma doesn't support it fully yet in this version, 
        // but schema says Unsupported("vector"). We usually need raw SQL to insert vectors).
        
        // Construct vector string '[0.1, 0.2, ...]'
        const vectorStr = `[${embedding.join(",")}]`;
        
        await prisma.$executeRaw`
            INSERT INTO "Vector" ("id", "content", "embedding", "sourceId")
            VALUES (gen_random_uuid(), ${fact}, ${vectorStr}::vector, ${source.id});
        `;
    }
  }

  /**
   * Retrieve relevant facts for a user
   */
  async recall(workspaceId: string, contactId: string, query: string): Promise<string[]> {
    // 1. Embed Query
    const embeddingResponse = await this.openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query,
    });
    const embedding = embeddingResponse.data[0].embedding;
    const vectorStr = `[${embedding.join(",")}]`;

    // 2. Search Vector Store (Hybrid Search: Filter by ContactId AND Semantic Similarity)
    // We look for sources that start with `[Contact:${contactId}]`
    
    const results = await prisma.$queryRaw`
        SELECT v.content, 1 - (v.embedding <=> ${vectorStr}::vector) as similarity
        FROM "Vector" v
        JOIN "KnowledgeSource" s ON v."sourceId" = s.id
        JOIN "KnowledgeBase" kb ON s."knowledgeBaseId" = kb.id
        WHERE kb."workspaceId" = ${workspaceId}
        AND kb."name" = 'User Memory'
        AND s.content LIKE ${`[Contact:${contactId}]%`}
        ORDER BY similarity DESC
        LIMIT 5;
    ` as any[];

    return results.map(r => r.content.replace(`[Contact:${contactId}] `, ""));
  }
}
