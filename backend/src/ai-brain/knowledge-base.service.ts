import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
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
import {
  buildSerializedOpenAiEmbeddingBillingDescriptor,
  type SerializedInputTokenBillingDescriptor,
  quoteOpenAiEmbeddingCostCents,
} from '../wallet/provider-pricing';
import { WalletService } from '../wallet/wallet.service';
import {
  InsufficientWalletBalanceError,
  UsagePriceNotFoundError,
  WalletNotFoundError,
} from '../wallet/wallet.types';
import { VectorService } from './vector.service';
import { OpsAlertService } from '../observability/ops-alert.service';

const S_RE = /\s+/g;
const SENTENCE_ENDINGS = ['. ', '? ', '! '];
const KNOWLEDGE_BASE_EMBEDDING_MODEL = 'text-embedding-3-small';
const KNOWLEDGE_BASE_CHUNK_SIZE = 1000;
const KNOWLEDGE_BASE_CHUNK_OVERLAP = 200;

type KnowledgeBaseWalletUsagePayload = {
  operation: 'kb_ingestion';
  requestId: string;
  billing: SerializedInputTokenBillingDescriptor;
};

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

// Keep this aligned with worker/processors/memory-processor.ts so the
// pre-charge uses the same chunk boundaries as async ingestion.
const splitKnowledgeBaseText = (
  text: string,
  chunkSize: number,
  chunkOverlap = KNOWLEDGE_BASE_CHUNK_OVERLAP,
): string[] => {
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

/** Knowledge-base wallet access error. */
class KnowledgeBaseWalletAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeBaseWalletAccessError';
  }
}

/** Knowledge base service. */
@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    private prisma: PrismaService,
    private vectorService: VectorService,
    private readonly auditService: AuditService,
    private readonly prepaidWalletService: WalletService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  /** Create. */
  // PULSE_OK: workspaceId validated by caller guard
  async create(workspaceId: string, name: string) {
    return this.prisma.knowledgeBase.create({
      data: { workspaceId, name },
    });
  }

  /** Add source. */
  private insufficientWalletMessage() {
    return 'Saldo insuficiente na wallet prepaid para indexar conteudo na base de conhecimento. Recarregue via PIX ou aguarde a auto-recarga antes de tentar novamente.';
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
        throw new KnowledgeBaseWalletAccessError(this.insufficientWalletMessage());
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

  private estimateEmbeddingQuote(
    content: string,
    maxChunks: number,
  ): {
    billing: SerializedInputTokenBillingDescriptor;
    estimatedCostCents: bigint;
    estimatedInputTokens: bigint;
  } | null {
    const chunks = splitKnowledgeBaseText(
      content,
      KNOWLEDGE_BASE_CHUNK_SIZE,
      KNOWLEDGE_BASE_CHUNK_OVERLAP,
    ).slice(0, maxChunks);
    const estimatedInputTokens = chunks.reduce(
      (total, chunk) => total + BigInt(Buffer.byteLength(chunk, 'utf8')),
      0n,
    );

    if (estimatedInputTokens <= 0n) {
      return null;
    }

    return {
      billing: buildSerializedOpenAiEmbeddingBillingDescriptor(KNOWLEDGE_BASE_EMBEDDING_MODEL),
      estimatedCostCents: quoteOpenAiEmbeddingCostCents({
        model: KNOWLEDGE_BASE_EMBEDDING_MODEL,
        inputTokens: estimatedInputTokens,
      }),
      estimatedInputTokens,
    };
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
          finalContent = this.htmlToText(html);
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
    const providerQuote = this.estimateEmbeddingQuote(finalContent, maxChunks);
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
        .catch((err: unknown) => {
          this.logger.warn(
            `Failed to log audit event for deleteVectorsBySource: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }

    return this.prisma.vector.deleteMany({ where: { sourceId } });
  }
}
