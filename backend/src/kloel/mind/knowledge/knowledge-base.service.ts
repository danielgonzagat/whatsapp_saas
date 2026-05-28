/**
 * MindKnowledgeBase implementation — canonical Mind/Knowledge service.
 *
 * Physically moved from `backend/src/ai-brain/knowledge-base.service.ts` to its
 * canonical home under `backend/src/kloel/mind/knowledge/` (ADR-0013 Wave M2,
 * 2026-05-27). The legacy `ai-brain/knowledge-base.service.ts` re-export
 * stub was deleted in Wave 51 (zero consumers).
 *
 * Prefer importing as `MindKnowledgeBase` via the
 * `backend/src/kloel/mind/knowledge` barrel.
 *
 * @cluster Mind/Knowledge
 * @canonical backend/src/kloel/mind/knowledge/knowledge-base.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 */
import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import { AuditService } from '../../../audit/audit.service';
import { getTraceHeaders } from '../../../common/trace-headers'; // propagates X-Request-ID
import {
  collectAllowedHosts,
  validateAllowlistedUserUrl,
  validateNoInternalAccess,
} from '../../../common/utils/url-validator';
import { PrismaService } from '../../../prisma/prisma.service';
import { memoryQueue } from '../../../queue/queue';
import { WalletService } from '../../../wallet/wallet.service';
import {
  InsufficientWalletBalanceError,
  UsagePriceNotFoundError,
  WalletNotFoundError,
} from '../../../wallet/wallet.types';
import { VectorService } from './vector.service';
import { OpsAlertService } from '../../../observability/ops-alert.service';
import {
  KnowledgeBaseWalletAccessError,
  type KnowledgeBaseWalletUsagePayload,
  estimateKnowledgeBaseEmbeddingQuote,
  htmlToText,
  knowledgeBaseInsufficientWalletMessage,
} from './knowledge-base.helpers';

/**
 * @cluster whatsapp_saas/backend/kloel/mind/knowledge
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */

// Re-export the pure HTML-to-text helper so existing test imports
// (`import { htmlToText } from './knowledge-base.service'`) keep working
// after the Wave 78 helper extraction.
export { htmlToText } from './knowledge-base.helpers';

/** Knowledge base service. */
@Injectable()
export class KnowledgeBaseService {
  private readonly logger = StructuredLogger.from(KnowledgeBaseService.name);

  constructor(
    private prisma: PrismaService,
    private vectorService: VectorService,
    private readonly auditService: AuditService,
    private readonly prepaidWalletService: WalletService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  /** Create. */
  async create(workspaceId: string, name: string) {
    return this.prisma.knowledgeBase.create({
      data: { workspaceId, name },
    });
  }

  private async chargeUsageIfNeeded(input: {
    workspaceId: string;
    requestId: string;
    quotedCostCents: bigint;
    metadata: Record<string, unknown>;
  }): Promise<boolean> {
    if (input.quotedCostCents <= 0n) {
      return false;
    }

    try {
      await this.prepaidWalletService.chargeForUsage({
        workspaceId: input.workspaceId,
        operation: 'kb_ingestion',
        quotedCostCents: input.quotedCostCents,
        requestId: input.requestId,
        metadata: input.metadata,
      });
      return true;
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'KnowledgeBaseService.chargeForUsage');
      if (error instanceof UsagePriceNotFoundError) {
        this.logger.debug(
          `Skipping prepaid wallet debit for kb_ingestion workspace=${input.workspaceId}: no UsagePrice configured`,
        );
        return false;
      }

      if (error instanceof InsufficientWalletBalanceError || error instanceof WalletNotFoundError) {
        throw new KnowledgeBaseWalletAccessError(knowledgeBaseInsufficientWalletMessage());
      }

      throw error;
    }
  }

  private async refundUsageIfNeeded(
    workspaceId: string,
    requestId: string,
    reason: string,
    metadata: Record<string, unknown>,
  ) {
    try {
      await this.prepaidWalletService.refundUsageCharge({
        workspaceId,
        operation: 'kb_ingestion',
        requestId,
        reason,
        metadata,
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'KnowledgeBaseService.refundUsageCharge');
      this.logger.error(
        `Failed to refund prepaid wallet usage for kb_ingestion workspace=${workspaceId} request=${requestId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Add source. */
  async addSource(
    kbId: string,
    type: 'TEXT' | 'URL' | 'PDF',
    content: string,
    workspaceId?: string,
    options?: { requestId?: string },
  ) {
    const maxBytes = Number.parseInt(process.env.KB_FETCH_MAX_BYTES || '1048576', 10) || 1048576; // 1MB default
    const maxChunks = Number.parseInt(process.env.KB_MAX_CHUNKS || '400', 10) || 400;
    const fetchTimeout = Number.parseInt(process.env.KB_FETCH_TIMEOUT_MS || '8000', 10) || 8000;

    const kb = await this.prisma.knowledgeBase.findUnique({
      where: workspaceId ? { id: kbId, workspaceId } : { id: kbId },
      select: { workspaceId: true },
    });
    if (!kb) {
      throw new BadRequestException('Knowledge Base não encontrada');
    }

    const resolvedWorkspaceId = kb.workspaceId;

    // 0. Se for URL, busca conteúdo remoto e converte para texto simples
    // OBS: Para máxima performance, movemos o FETCH também para o Worker no futuro.
    // Por enquanto, mantemos aqui para validação rápida de erro 404 antes de enfileirar.
    let finalContent = content || '';
    if (type === 'URL') {
      const requestedUrl = String(content || '').trim();
      // Same sanitizer-barrier pattern that pulse.service.ts and crm.service.ts
      // use successfully: invoke validateNoInternalAccess for its throwing side
      // effect, then pass the original string to fetch. CodeQL recognizes this
      // shape as a request-forgery sanitizer.
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
          finalContent = htmlToText(html);
        } finally {
          clearTimeout(timer);
        }
      } catch (err: unknown) {
        void this.opsAlert?.alertOnCriticalError(err, 'KnowledgeBaseService.clearTimeout');
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
    const requestId = options?.requestId || randomUUID();
    const providerQuote = estimateKnowledgeBaseEmbeddingQuote(finalContent, maxChunks);
    const usageMetadata = {
      channel: 'knowledge_base',
      capability: 'source_ingestion',
      knowledgeBaseId: kbId,
      sourceType: type,
      contentLength: finalContent.length,
      fetchedFromUrl: type === 'URL',
      billingRail: providerQuote ? 'provider_quote' : 'free_noop',
      provider: providerQuote ? 'openai' : null,
      model: providerQuote?.billing.model ?? null,
      estimatedInputTokens: providerQuote?.estimatedInputTokens.toString() ?? '0',
    };
    let usageCharged = false;

    if (providerQuote) {
      usageCharged = await this.chargeUsageIfNeeded({
        workspaceId: resolvedWorkspaceId,
        requestId,
        quotedCostCents: providerQuote.estimatedCostCents,
        metadata: usageMetadata,
      });
    }

    // 1. Create Source Record (PENDING)
    const source = await this.prisma.knowledgeSource.create({
      data: {
        knowledgeBaseId: kbId,
        type,
        content: `${finalContent.substring(0, 200)}...`, // Store snippet
        status: 'PENDING', // Async processing
      },
    });
    const walletUsage: KnowledgeBaseWalletUsagePayload | null =
      providerQuote && usageCharged
        ? {
            operation: 'kb_ingestion',
            requestId,
            billing: providerQuote.billing,
          }
        : null;

    try {
      // 2. Dispatch to Worker (Async Ingestion) — deduplicate by sourceId
      await memoryQueue.add(
        'ingest-source',
        {
          workspaceId: resolvedWorkspaceId,
          sourceId: source.id,
          content: finalContent,
          type,
          maxChunks,
          walletUsage,
        },
        { jobId: `ingest-source:${source.id}` },
      );

      return source; // Retorna imediatamente com status PENDING
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'KnowledgeBaseService.add');
      if (usageCharged) {
        await this.refundUsageIfNeeded(
          resolvedWorkspaceId,
          requestId,
          'knowledge_base_ingestion_enqueue_failed',
          usageMetadata,
        );
      }
      this.logger.error(`Error dispatching source ingestion: ${String(error)}`);
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
        FROM "RAC_Vector" v
        JOIN "RAC_KnowledgeSource" s ON v."sourceId" = s.id
        JOIN "RAC_KnowledgeBase" kb ON s."knowledgeBaseId" = kb.id
        WHERE kb."workspaceId" = ${workspaceId}
        ORDER BY distance ASC
        LIMIT 3
      `;

      if (!results || results.length === 0) {
        return '';
      }

      return results.map((r) => r.content).join('\n\n');
    } catch (err: unknown) {
      void this.opsAlert?.alertOnCriticalError(err, 'KnowledgeBaseService.map');
      this.logger.error(`RAG Search Error: ${String(err)}`);
      return '';
    }
  }

  /**
   * Search knowledge base entries by semantic similarity.
   * Returns structured results for mindSignals injection during chat.
   *
   * PI-K17-A: wired into buildMindSignals so the LLM receives knowledge-base
   * context alongside concepts, beliefs, and other cognitive signals.
   */
  async search(
    workspaceId: string,
    query: string,
    limit = 3,
  ): Promise<Array<{ title: string; snippet: string; relevance: number }>> {
    try {
      const { embedding } = await this.vectorService.getEmbedding(query);
      if (!embedding.length) {
        return [];
      }

      const vectorString = `[${embedding.join(',')}]`;

      const results = await this.prisma.$queryRaw<
        { name: string; content: string; distance: number }[]
      >`
        SELECT kb.name, v.content, (v.embedding <=> ${vectorString}::vector) as distance
        FROM "RAC_Vector" v
        JOIN "RAC_KnowledgeSource" s ON v."sourceId" = s.id
        JOIN "RAC_KnowledgeBase" kb ON s."knowledgeBaseId" = kb.id
        WHERE kb."workspaceId" = ${workspaceId}
        ORDER BY distance ASC
        LIMIT ${limit}
      `;

      if (!results || results.length === 0) {
        return [];
      }

      return results.map((r) => ({
        title: r.name || r.content.slice(0, 80),
        snippet: r.content.slice(0, 200),
        relevance: Math.round((1 / (1 + r.distance)) * 100) / 100,
      }));
    } catch (err: unknown) {
      void this.opsAlert?.alertOnCriticalError(err, 'KnowledgeBaseService.search');
      this.logger.warn(`Knowledge base search skipped: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
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
        .catch((err: unknown) => {
          this.logger.warn(
            `Failed to log audit event for deleteVectorsBySource: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }

    return this.prisma.vector.deleteMany({ where: { sourceId } });
  }
}
