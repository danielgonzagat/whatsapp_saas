import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VectorService } from './vector.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { memoryQueue } from '../queue/queue';

@Injectable()
export class KnowledgeBaseService {
  constructor(
    private prisma: PrismaService,
    private vectorService: VectorService,
    private planLimits: PlanLimitsService,
  ) {}

  async create(workspaceId: string, name: string) {
    return this.prisma.knowledgeBase.create({
      data: { workspaceId, name },
    });
  }

  async addSource(
    kbId: string,
    type: 'TEXT' | 'URL' | 'PDF',
    content: string,
  ) {
    const maxBytes =
      parseInt(process.env.KB_FETCH_MAX_BYTES || '1048576', 10) || 1048576; // 1MB default
    const maxChunks =
      parseInt(process.env.KB_MAX_CHUNKS || '400', 10) || 400;
    const fetchTimeout =
      parseInt(process.env.KB_FETCH_TIMEOUT_MS || '8000', 10) || 8000;

    const kb = await this.prisma.knowledgeBase.findUnique({
      where: { id: kbId },
      select: { workspaceId: true },
    });
    if (!kb) {
      throw new BadRequestException('Knowledge Base não encontrada');
    }

    const workspaceId = kb.workspaceId;

    // 0. Se for URL, busca conteúdo remoto e converte para texto simples
    // OBS: Para máxima performance, movemos o FETCH também para o Worker no futuro.
    // Por enquanto, mantemos aqui para validação rápida de erro 404 antes de enfileirar.
    let finalContent = content || '';
    if (type === 'URL') {
      this.enforceUrlAllowlist(content);
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), fetchTimeout);

        const res = await fetch(content, { method: 'GET', signal: controller.signal });
        clearTimeout(timer);

        if (!res.ok) {
          throw new BadRequestException('Falha ao buscar URL para ingestão');
        }

        const lenHeader = res.headers.get('content-length');
        if (lenHeader && Number(lenHeader) > maxBytes) {
          throw new BadRequestException('Conteúdo remoto excede limite de tamanho');
        }

        const buf = await res.arrayBuffer();
        if (buf.byteLength > maxBytes) {
          throw new BadRequestException('Conteúdo remoto excede limite de tamanho');
        }

        const html = new TextDecoder('utf-8').decode(new Uint8Array(buf));
        finalContent = this.htmlToText(html);
      } catch (err) {
        console.warn('[KB] Falha ao buscar URL ou timeout', err);
        if (err instanceof BadRequestException) throw err;
        // Se falhar o fetch, não adianta enfileirar.
        throw new BadRequestException('Erro ao acessar URL: ' + (err as any)?.message);
      }
    }

    // Limita tamanho para evitar estouro no payload do Redis/BullMQ
    finalContent = (finalContent || '').slice(0, 200_000);

    // 1. Create Source Record (PENDING)
    const source = await this.prisma.knowledgeSource.create({
      data: {
        knowledgeBaseId: kbId,
        type,
        content: finalContent.substring(0, 200) + '...', // Store snippet
        status: 'PENDING', // Async processing
      },
    });

    try {
      // 2. Dispatch to Worker (Async Ingestion)
      await memoryQueue.add('ingest-source', {
        workspaceId,
        sourceId: source.id,
        content: finalContent,
        type,
        maxChunks
      });

      return source; // Retorna imediatamente com status PENDING
    } catch (error) {
      console.error('Error dispatching source ingestion:', error);
      await this.prisma.knowledgeSource.update({
        where: { id: source.id },
        data: { status: 'FAILED' },
      });
      throw error;
    }
  }

  async list(workspaceId: string) {
    return this.prisma.knowledgeBase.findMany({
      where: { workspaceId },
      include: { sources: true },
    });
  }

  async listSources(kbId: string, workspaceId: string) {
    return this.prisma.knowledgeSource.findMany({
      where: { knowledgeBaseId: kbId, knowledgeBase: { workspaceId } },
    });
  }

  async getContext(workspaceId: string, query: string): Promise<string> {
    try {
      const { embedding } = await this.vectorService.getEmbedding(query);
      if (!embedding.length) return '';

      const vectorString = `[${embedding.join(',')}]`;

      // Perform Similarity Search
      // Join tables to ensure we only search vectors belonging to this workspace
      const results = await this.prisma.$queryRaw<any[]>`
        SELECT v.content, (v.embedding <=> ${vectorString}::vector) as distance
        FROM "Vector" v
        JOIN "KnowledgeSource" s ON v."sourceId" = s.id
        JOIN "KnowledgeBase" kb ON s."knowledgeBaseId" = kb.id
        WHERE kb."workspaceId" = ${workspaceId}
        ORDER BY distance ASC
        LIMIT 3
      `;

      if (!results || results.length === 0) return '';

      return results.map((r: any) => r.content).join('\n\n');
    } catch (err) {
      console.error('RAG Search Error:', err);
      return '';
    }
  }

  /**
   * Divide texto em chunks respeitando sentenças quando possível; fallback por palavras.
   * Exposta via casting em testes.
   */
  private splitText(text: string, maxLen = 500, overlap = 50): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/(?<=[.!?])\s+/);

    let buffer = '';
    for (const sentence of sentences) {
      if ((buffer + ' ' + sentence).trim().length <= maxLen) {
        buffer = (buffer + ' ' + sentence).trim();
      } else {
        if (buffer) chunks.push(buffer);
        buffer = sentence.trim();
      }
    }
    if (buffer) chunks.push(buffer);

    if (chunks.length === 0) {
      // Fallback por palavras
      const words = text.split(/\s+/);
      buffer = '';
      for (const word of words) {
        if ((buffer + ' ' + word).trim().length <= maxLen) {
          buffer = (buffer + ' ' + word).trim();
        } else {
          if (buffer) chunks.push(buffer);
          buffer = word;
        }
      }
      if (buffer) chunks.push(buffer);
    }

    // Adiciona overlap simples
    if (overlap > 0 && chunks.length > 1) {
      const overlapped: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const current = chunks[i];
        if (i === 0) {
          overlapped.push(current);
        } else {
          const prev = chunks[i - 1];
          const tail = prev.slice(-overlap);
          overlapped.push(`${tail} ${current}`.trim());
        }
      }
      return overlapped;
    }

    return chunks;
  }

  private htmlToText(html: string): string {
    if (!html) return '';
    // Remove scripts/styles and strip tags
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(p|div|br|li|h1|h2|h3|h4|h5|h6)>/gi, '$1. ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Bloqueia SSRF e destinos privados; se KB_URL_ALLOWLIST estiver definido, só permite prefixos listados.
   */
  private enforceUrlAllowlist(rawUrl: string) {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new BadRequestException('URL inválida para ingestão');
    }

    const allowlist =
      process.env.KB_URL_ALLOWLIST?.split(',').map((u) => u.trim()).filter(Boolean) ||
      [];

    if (allowlist.length > 0) {
      const allowed = allowlist.some((prefix) => rawUrl.startsWith(prefix));
      if (!allowed) {
        throw new BadRequestException('URL não permitida pela allowlist');
      }
      return;
    }

    const host = parsed.hostname;
    const forbidden = [
      'localhost',
      '127.',
      '0.0.0.0',
      '::1',
      '10.',
      '192.168.',
      '172.16.',
      '172.17.',
      '172.18.',
      '172.19.',
      '172.20.',
      '172.21.',
      '172.22.',
      '172.23.',
      '172.24.',
      '172.25.',
      '172.26.',
      '172.27.',
      '172.28.',
      '172.29.',
      '172.30.',
      '172.31.',
      '169.254.',
    ];

    if (forbidden.some((prefix) => host.startsWith(prefix))) {
      throw new BadRequestException('URL bloqueada (rede interna/desautorizada)');
    }
  }
}
