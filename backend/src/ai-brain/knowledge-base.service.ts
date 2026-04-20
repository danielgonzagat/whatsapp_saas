import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Parser } from 'htmlparser2';
import { AuditService } from '../audit/audit.service';
import { getTraceHeaders } from '../common/trace-headers'; // propagates X-Request-ID
import {
  collectAllowedHosts,
  validateAllowlistedUserUrl,
  validateNoInternalAccess,
} from '../common/utils/url-validator';
import { PrismaService } from '../prisma/prisma.service';
import { memoryQueue } from '../queue/queue';
import { VectorService } from './vector.service';

const S_RE = /\s+/g;

/** Knowledge base service. */
@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    private prisma: PrismaService,
    private vectorService: VectorService,
    private readonly auditService: AuditService,
  ) {}

  /** Create. */
  async create(workspaceId: string, name: string) {
    return this.prisma.knowledgeBase.create({
      data: { workspaceId, name },
    });
  }

  /** Add source. */
  async addSource(kbId: string, type: 'TEXT' | 'URL' | 'PDF', content: string) {
    const maxBytes = Number.parseInt(process.env.KB_FETCH_MAX_BYTES || '1048576', 10) || 1048576; // 1MB default
    const maxChunks = Number.parseInt(process.env.KB_MAX_CHUNKS || '400', 10) || 400;
    const fetchTimeout = Number.parseInt(process.env.KB_FETCH_TIMEOUT_MS || '8000', 10) || 8000;

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
      const requestedUrl = String(content || '').trim();
      validateNoInternalAccess(requestedUrl);
      this.enforceUrlAllowlist(requestedUrl);

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), fetchTimeout);
        try {
          const res = await fetch(requestedUrl, {
            method: 'GET',
            headers: getTraceHeaders(),
            redirect: 'error',
            signal: controller.signal,
          });

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
        } finally {
          clearTimeout(timer);
        }
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown_error';
        this.logger.warn(`Falha ao buscar URL ou timeout: ${errorMessage}`);
        if (err instanceof BadRequestException) {
          throw err;
        }
        // Se falhar o fetch, não adianta enfileirar.
        throw new BadRequestException(`Erro ao acessar URL: ${errorMessage}`);
      }
    }

    // Limita tamanho para evitar estouro no payload do Redis/BullMQ
    finalContent = (finalContent || '').slice(0, 200_000);

    // 1. Create Source Record (PENDING)
    const source = await this.prisma.knowledgeSource.create({
      data: {
        knowledgeBaseId: kbId,
        type,
        content: `${finalContent.substring(0, 200)}...`, // Store snippet
        status: 'PENDING', // Async processing
      },
    });

    try {
      // 2. Dispatch to Worker (Async Ingestion) — deduplicate by sourceId
      await memoryQueue.add(
        'ingest-source',
        {
          workspaceId,
          sourceId: source.id,
          content: finalContent,
          type,
          maxChunks,
        },
        { jobId: `ingest-source:${source.id}` },
      );

      return source; // Retorna imediatamente com status PENDING
    } catch (error) {
      this.logger.error(`Error dispatching source ingestion: ${error}`);
      await this.prisma.knowledgeSource.update({
        where: { id: source.id },
        data: { status: 'FAILED' },
      });
      throw error;
    }
  }

  /** List. */
  async list(workspaceId: string) {
    return this.prisma.knowledgeBase.findMany({
      where: { workspaceId },
      include: { sources: { take: 100 } },
      take: 50,
    });
  }

  /** List sources. */
  async listSources(kbId: string, workspaceId: string) {
    return this.prisma.knowledgeSource.findMany({
      where: { knowledgeBaseId: kbId, knowledgeBase: { workspaceId } },
      select: {
        id: true,
        knowledgeBaseId: true,
        type: true,
        content: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 100,
    });
  }

  /** Get context. */
  async getContext(workspaceId: string, query: string): Promise<string> {
    try {
      const { embedding } = await this.vectorService.getEmbedding(query);
      if (!embedding.length) {
        return '';
      }

      const vectorString = `[${embedding.join(',')}]`;

      // Perform Similarity Search
      // Join tables to ensure we only search vectors belonging to this workspace
      const results = await this.prisma.$queryRaw<{ content: string; distance: number }[]>`
        SELECT v.content, (v.embedding <=> ${vectorString}::vector) as distance
        FROM "Vector" v
        JOIN "KnowledgeSource" s ON v."sourceId" = s.id
        JOIN "KnowledgeBase" kb ON s."knowledgeBaseId" = kb.id
        WHERE kb."workspaceId" = ${workspaceId}
        ORDER BY distance ASC
        LIMIT 3
      `;

      if (!results || results.length === 0) {
        return '';
      }

      return results.map((r) => r.content).join('\n\n');
    } catch (err) {
      this.logger.error(`RAG Search Error: ${err}`);
      return '';
    }
  }

  private htmlToText(html: string): string {
    if (!html) {
      return '';
    }

    const blockTags = new Set([
      'p',
      'div',
      'br',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'section',
      'article',
      'header',
      'footer',
    ]);
    const ignoredStack: string[] = [];
    const parts: string[] = [];

    const parser = new Parser(
      {
        onopentag: (name) => {
          const lower = name.toLowerCase();
          if (lower === 'script' || lower === 'style') {
            ignoredStack.push(lower);
            return;
          }
          if (blockTags.has(lower)) {
            parts.push(' ');
          }
        },
        ontext: (text) => {
          if (ignoredStack.length === 0) {
            parts.push(text);
          }
        },
        onclosetag: (name) => {
          const lower = name.toLowerCase();
          if (ignoredStack.length > 0 && ignoredStack[ignoredStack.length - 1] === lower) {
            ignoredStack.pop();
            return;
          }
          if (blockTags.has(lower)) {
            parts.push(' ');
          }
        },
      },
      { decodeEntities: true },
    );

    parser.write(html);
    parser.end();

    return parts.join(' ').replace(S_RE, ' ').trim();
  }

  /**
   * Bloqueia SSRF e destinos privados; se KB_URL_ALLOWLIST estiver definido, só permite prefixos listados.
   */
  private enforceUrlAllowlist(rawUrl: string): void {
    const allowedHosts = collectAllowedHosts(
      process.env.KB_URL_ALLOWLIST,
      process.env.CDN_BASE_URL,
      process.env.MEDIA_BASE_URL,
      process.env.FRONTEND_URL,
    );

    if (allowedHosts.size === 0) {
      throw new BadRequestException('KB_URL_ALLOWLIST não configurado');
    }

    validateAllowlistedUserUrl(rawUrl, allowedHosts);
  }

  // ── Vector Management ──

  async countVectors(sourceId: string): Promise<number> {
    return this.prisma.vector.count({ where: { sourceId } });
  }

  /** Delete vectors by source. */
  async deleteVectorsBySource(sourceId: string) {
    // Resolve workspaceId for audit trail
    const source = await this.prisma.knowledgeSource.findUnique({
      where: { id: sourceId },
      select: { knowledgeBase: { select: { workspaceId: true } } },
    });
    const workspaceId = source?.knowledgeBase?.workspaceId;

    if (workspaceId) {
      await this.auditService
        .log({
          workspaceId,
          action: 'DELETE_VECTORS_BY_SOURCE',
          resource: 'Vector',
          resourceId: sourceId,
          details: { sourceId },
        })
        .catch(() => {});
    }

    return this.prisma.vector.deleteMany({ where: { sourceId } });
  }
}
