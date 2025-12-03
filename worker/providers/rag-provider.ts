import OpenAI from "openai";
import { prisma } from "../db";

/**
 * RAG provider — busca contexto real via pgvector.
 * Se falhar (sem chave ou sem dados), retorna string vazia para não quebrar fluxo.
 */
export class RAGProvider {
  static async getContext(
    workspaceId: string,
    query: string,
    topK: number = 3
  ): Promise<string> {
    if (!workspaceId || !query) return "";

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return "";

    const client = new OpenAI({ apiKey });

    try {
      // 1) Embedding da query
      const embeddingRes = await client.embeddings.create({
        model: "text-embedding-3-small",
        input: query.slice(0, 2000),
      });
      const vector = embeddingRes.data[0]?.embedding;
      if (!vector || vector.length === 0) return "";

      const vectorString = `[${vector.join(",")}]`;

      // 2) Busca vetorial filtrada pelo workspace (JOIN em KnowledgeBase)
      const rows: Array<{ content: string; distance: number }> =
        await prisma.$queryRawUnsafe(
          `
          SELECT v.content, (v.embedding <=> ${vectorString}::vector) AS distance
          FROM "Vector" v
          JOIN "KnowledgeSource" s ON v."sourceId" = s.id
          JOIN "KnowledgeBase" kb ON s."knowledgeBaseId" = kb.id
          WHERE kb."workspaceId" = $1
          ORDER BY distance ASC
          LIMIT $2
        `,
          workspaceId,
          Math.max(1, Math.min(topK, 10))
        );

      if (!rows || rows.length === 0) return "";

      // 3) Concatena contexto
      return rows
        .map((r, idx) => `#${idx + 1} (dist=${r.distance?.toFixed?.(3) ?? ""})\n${r.content}`)
        .join("\n\n");
    } catch (err: any) {
      console.warn("[RAG] Context fetch failed:", err?.message || err);
      return "";
    }
  }
}
