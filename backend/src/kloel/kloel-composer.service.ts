import {
  BadRequestException,
  Injectable,
  Inject,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import type { ImagesResponse, ImageGenerateParamsNonStreaming } from 'openai/resources/images';
import OpenAI from 'openai';
import { Prisma } from '@prisma/client';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { StorageService } from '../common/storage/storage.service';
import { getTraceHeaders } from '../common/trace-headers';
import { validateNoInternalAccess } from '../common/utils/url-validator';
import { extractComposerMetadata } from './kloel.service.composer.helpers';
import {
  buildConvertedMarkdownFilename,
  convertedMarkdownStorageFolder,
  docxBufferToMarkdown,
  htmlToMarkdown,
  pickConvertibleDocumentAttachment,
  plainTextToMarkdown,
  resolveConvertibleDocumentFormat,
  type ConvertibleDocumentFormat,
} from './kloel-composer.document.helpers';
import { createTextLlmClient } from '../lib/llm-provider';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { KloelComposerE2EGuard, KLOEL_COMPOSER_E2E_GUARD } from './kloel-composer-e2e-guard';
import { callOpenAIWithRetry } from './openai-wrapper';
import {
  ANTHROPIC_SITE_MAX_RETRIES,
  ANTHROPIC_SITE_TIMEOUT_MS,
  DOCUMENT_DOWNLOAD_TIMEOUT_MS,
  ERR_DOCUMENT_ATTACHMENT_MISSING,
  ERR_DOCUMENT_CONVERSION_FAILED,
  ERR_DOCUMENT_DOWNLOAD_FAILED,
  ERR_DOCUMENT_NO_TEXT,
  ERR_IMAGE_API_KEY_MISSING,
  ERR_IMAGE_GENERATION_FAILED,
  ERR_IMAGE_GENERATION_RETRY,
  ERR_SITE_API_KEY_MISSING,
  ERR_SITE_EMPTY_HTML,
  ERR_UNSUPPORTED_CAPABILITY,
  KLOEL_IMAGE_MODEL,
  KLOEL_SEARCH_WEB_MODEL,
  asUnknownRecord,
  buildAnthropicSiteBody,
  buildCapabilityPrompt,
  buildGeneratedImageFilename,
  buildRefinementPrompt,
  codeNativeRefinementResponse,
  codeNativeSearchWeb,
  composeAbortSignal,
  computeRetryDelayMs,
  extractAnthropicHtml,
  extractAnthropicUsageTokens,
  extractImageUrlFromResponse,
  extractTotalTokens,
  formatSearchDigestAsMarkdown,
  formatSiteRetryExhaustedMessage,
  generatedImageStorageFolder,
  isModelInvalidError,
  normalizeRefinementMarkdown,
  normalizeWebSearchSources,
  shouldRetryAnthropicStatus,
  shouldTrackTokenUsage,
  type AnthropicSiteResult,
  type CapabilityExecutionResult,
  type ComposerCapability,
  type WebSearchDigest,
} from './kloel-composer.service.helpers';

export type { CapabilityExecutionResult, ComposerCapability, WebSearchDigest };

/** Handles composer capabilities: web search, image generation, site generation. */
@Injectable()
export class KloelComposerService {
  private readonly logger = StructuredLogger.from(KloelComposerService.name);
  private readonly openai: OpenAI | null;
  private readonly textLlm: OpenAI | null;

  constructor(
    private readonly planLimits: PlanLimitsService,
    private readonly storageService: StorageService,
    @Inject(KLOEL_COMPOSER_E2E_GUARD) private readonly e2EGuard: KloelComposerE2EGuard,
  ) {
    this.openai = process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
    this.textLlm = createTextLlmClient(undefined, { timeout: 60_000, maxRetries: 0 });
  }

  private formatUnknownError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    try {
      const serialized: unknown = JSON.stringify(error);
      if (typeof serialized === 'string') {
        return serialized;
      }
    } catch {
      // fall through to Object.prototype.toString
    }
    const fallback: unknown = Object.prototype.toString.call(error);
    return typeof fallback === 'string' ? fallback : 'unknown error';
  }

  buildCapabilityPrompt(message: string, composerContext?: string): string {
    return buildCapabilityPrompt(message, composerContext);
  }

  formatSearchDigestAsMarkdown(digest: WebSearchDigest): string {
    return formatSearchDigestAsMarkdown(digest);
  }

  codeNativeSearchWeb(query: string): WebSearchDigest {
    return codeNativeSearchWeb(query);
  }

  async searchWeb(query: string): Promise<WebSearchDigest> {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) {
      return { answer: '', sources: [] };
    }

    // E2E test harness: must check the guard before the openai
    // null-guard because tests run without an OPENAI_API_KEY and
    // openai is null in that environment.
    if (this.e2EGuard.isEnabled()) {
      return this.e2EGuard.buildSearchResult(normalizedQuery);
    }

    const openai = this.openai;
    if (!openai) {
      this.logger.warn('searchWeb falling back to code-native — no OpenAI client');
      return this.codeNativeSearchWeb(normalizedQuery);
    }

    // Per WAVE3_LLM_PROMPT_AUDIT critical gap #8: wrap in retry helper to
    // survive transient 429 / 5xx / network blips from the responses API.
    const response = await callOpenAIWithRetry(() =>
      openai.responses.create({
        model: KLOEL_SEARCH_WEB_MODEL,
        input: normalizedQuery,
        tools: [
          {
            type: 'web_search_preview',
            search_context_size: 'medium',
            user_location: {
              type: 'approximate',
              country: 'BR',
              region: 'São Paulo',
              timezone: 'America/Sao_Paulo',
            },
          },
        ],
        include: ['web_search_call.action.sources'],
      }),
    );

    const outputText = String(response.output_text || '').trim();
    const sources = normalizeWebSearchSources(response.output);
    const responseUsage = response as { usage?: { total_tokens?: number | null } };
    return {
      answer: outputText,
      sources,
      totalTokens: extractTotalTokens(responseUsage.usage),
    };
  }

  private async persistGeneratedImageAsset(params: {
    response: ImagesResponse;
    workspaceId?: string;
    filename: string;
  }): Promise<string | null> {
    const { response, workspaceId, filename } = params;
    const folder = generatedImageStorageFolder(workspaceId);
    const imageBase64 = String(response?.data?.[0]?.b64_json || '').trim();
    if (imageBase64) {
      const stored = await this.storageService.upload(Buffer.from(imageBase64, 'base64'), {
        filename,
        mimeType: 'image/png',
        folder,
        ...(workspaceId !== undefined ? { workspaceId } : {}),
      });
      return stored.url;
    }
    const remoteImageUrl = String(response?.data?.[0]?.url || '').trim();
    if (!remoteImageUrl) {
      return null;
    }
    const stored = await this.storageService.uploadFromUrl(remoteImageUrl, {
      filename,
      mimeType: 'image/png',
      folder,
      ...(workspaceId !== undefined ? { workspaceId } : {}),
    });
    return stored.url;
  }

  private async trackCapabilityAiUsage(
    workspaceId: string,
    usageTokens: number,
    capability: ComposerCapability,
  ): Promise<void> {
    try {
      await this.planLimits.trackAiUsage(workspaceId, usageTokens);
    } catch (error: unknown) {
      const reason = this.formatUnknownError(error);
      this.logger.warn(
        `Falha ao registrar uso de IA do composer capability=${capability} ws=${workspaceId} tokens=${usageTokens}: ${reason}`,
      );
    }
  }

  async executeComposerCapability(input: {
    capability: ComposerCapability;
    message: string;
    workspaceId?: string;
    metadata?: Prisma.InputJsonValue | Prisma.JsonValue | null;
    composerContext?: string;
    signal?: AbortSignal;
  }): Promise<CapabilityExecutionResult> {
    const { capability, message, workspaceId, composerContext, signal } = input;
    const prompt = this.buildCapabilityPrompt(message, composerContext);

    if (capability === 'search_web') {
      if (workspaceId) {
        await this.planLimits.ensureTokenBudget(workspaceId);
      }
      const digest = await this.searchWeb(prompt);
      const content = this.formatSearchDigestAsMarkdown(digest);
      const usageTokens = Number(digest.totalTokens || 0);
      if (workspaceId && shouldTrackTokenUsage(usageTokens)) {
        await this.trackCapabilityAiUsage(workspaceId, usageTokens, capability);
      }
      return {
        content,
        metadata: { capability, webSources: digest.sources },
        estimatedTokens: shouldTrackTokenUsage(usageTokens) ? usageTokens : 0,
      };
    }

    if (capability === 'refine_response') {
      if (workspaceId) {
        await this.planLimits.ensureTokenBudget(workspaceId);
      }

      const textLlm = this.textLlm;
      if (!textLlm) {
        return {
          content: codeNativeRefinementResponse(message),
          metadata: { capability, refinementUnavailable: true },
          estimatedTokens: 0,
        };
      }

      const refinementPrompt = buildRefinementPrompt(message, composerContext);
      const requestOptions: OpenAI.RequestOptions | undefined = signal ? { signal } : undefined;
      const response = await callOpenAIWithRetry(() =>
        requestOptions
          ? textLlm.chat.completions.create(
              {
                model: resolveBackendOpenAIModel('writer'),
                messages: [{ role: 'user', content: refinementPrompt }],
                temperature: 0.3,
              },
              requestOptions,
            )
          : textLlm.chat.completions.create({
              model: resolveBackendOpenAIModel('writer'),
              messages: [{ role: 'user', content: refinementPrompt }],
              temperature: 0.3,
            }),
      );
      const rawContent =
        String(response.choices?.[0]?.message?.content || '').trim() ||
        'Não consegui gerar uma mesa de refinamento útil agora. Ajuste o pedido e tente novamente.';
      const content = normalizeRefinementMarkdown(rawContent);
      const usageTokens = extractTotalTokens(response.usage);
      if (workspaceId && shouldTrackTokenUsage(usageTokens)) {
        await this.trackCapabilityAiUsage(workspaceId, usageTokens, capability);
      }
      return {
        content,
        metadata: { capability, refinementMode: 'response_table' },
        estimatedTokens: shouldTrackTokenUsage(usageTokens) ? usageTokens : 0,
      };
    }

    if (capability === 'create_image') {
      if (this.e2EGuard.isEnabled()) {
        return this.e2EGuard.buildImageResult();
      }
      const openai = this.openai;
      if (!openai) {
        throw new Error(ERR_IMAGE_API_KEY_MISSING);
      }
      if (!process.env.OPENAI_API_KEY) {
        throw new NotFoundException(ERR_IMAGE_API_KEY_MISSING);
      }
      if (workspaceId) {
        await this.planLimits.ensureTokenBudget(workspaceId);
      }
      let response: ImagesResponse;
      try {
        const imageRequest: ImageGenerateParamsNonStreaming = {
          model: KLOEL_IMAGE_MODEL,
          prompt,
          size: '1024x1024',
          n: 1,
        };
        const requestOptions: OpenAI.RequestOptions | undefined = signal ? { signal } : undefined;
        // Per WAVE3_LLM_PROMPT_AUDIT critical gap #8: wrap in retry helper
        // so transient 429/5xx don't fail the user's image-generation request.
        response = await callOpenAIWithRetry(() =>
          openai.images.generate(imageRequest, requestOptions),
        );
      } catch (error: unknown) {
        const errorRecord = asUnknownRecord(error);
        const errorMessage = typeof errorRecord?.message === 'string' ? errorRecord.message : '';
        const errorCode = typeof errorRecord?.code === 'string' ? errorRecord.code : '';
        this.logger.warn(`Falha ao gerar imagem no composer: ${errorMessage || errorCode}`);
        if (isModelInvalidError(errorMessage, errorCode)) {
          throw new InternalServerErrorException(ERR_IMAGE_GENERATION_RETRY);
        }
        throw new InternalServerErrorException(ERR_IMAGE_GENERATION_FAILED);
      }

      const rawImageUrl = extractImageUrlFromResponse(response);
      if (!rawImageUrl) {
        throw new InternalServerErrorException(ERR_IMAGE_GENERATION_FAILED);
      }

      const generatedImageFilename = buildGeneratedImageFilename(workspaceId);
      let imageUrl = rawImageUrl;
      try {
        const persistedImageUrl = await this.persistGeneratedImageAsset({
          response,
          ...(workspaceId !== undefined ? { workspaceId } : {}),
          filename: generatedImageFilename,
        });
        if (persistedImageUrl) {
          imageUrl = persistedImageUrl;
        }
      } catch (error: unknown) {
        const reason =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'unknown storage error';
        this.logger.warn(`Falha ao persistir imagem gerada no storage: ${reason}`);
      }

      const usageTokens = Number(response?.usage?.total_tokens || 0);
      if (workspaceId && shouldTrackTokenUsage(usageTokens)) {
        await this.trackCapabilityAiUsage(workspaceId, usageTokens, capability);
      }
      return {
        content: 'Imagem gerada e pronta para revisão.',
        metadata: { capability, generatedImageUrl: imageUrl, generatedImageFilename },
        estimatedTokens: shouldTrackTokenUsage(usageTokens) ? usageTokens : 0,
      };
    }

    if (capability === 'create_site') {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new NotFoundException(ERR_SITE_API_KEY_MISSING);
      }
      if (workspaceId) {
        await this.planLimits.ensureTokenBudget(workspaceId);
      }

      // Anthropic site generation with retry (WAVE3_LLM_PROMPT_AUDIT WARNING fix):
      // direct fetch had zero retry on transient failures.
      const anthropicBody = buildAnthropicSiteBody({
        prompt,
        ...(composerContext !== undefined ? { composerContext } : {}),
      });

      const maxRetries = ANTHROPIC_SITE_MAX_RETRIES;
      let lastError: unknown;
      let result: AnthropicSiteResult | undefined;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const timeoutSignal = AbortSignal.timeout(ANTHROPIC_SITE_TIMEOUT_MS);
          const requestSignal = composeAbortSignal(signal, timeoutSignal);
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            signal: requestSignal,
            headers: {
              ...getTraceHeaders(),
              'Content-Type': 'application/json',
              'x-api-key': process.env.ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
            },
            body: anthropicBody,
          });

          if (!response.ok) {
            let errorText = '';
            try {
              errorText = await response.text();
            } catch (error: unknown) {
              this.logger.warn(`Falha ao ler erro da Anthropic: ${this.formatUnknownError(error)}`);
            }
            const status = response.status;
            if (shouldRetryAnthropicStatus(status)) {
              lastError = new Error(`Anthropic ${status}: ${errorText}`);
              this.logger.warn(
                `Anthropic site gen attempt ${attempt + 1}/${maxRetries} failed (${status}), retrying...`,
              );
              await new Promise((r) => setTimeout(r, computeRetryDelayMs(attempt)));
              continue;
            }
            throw new InternalServerErrorException(`Anthropic API error ${status}: ${errorText}`);
          }

          result = (await response.json()) as AnthropicSiteResult;
          break;
        } catch (err: unknown) {
          if (err instanceof InternalServerErrorException) {
            throw err;
          }
          lastError = err;
          if (attempt < maxRetries - 1) {
            this.logger.warn(
              `Anthropic site gen attempt ${attempt + 1}/${maxRetries} network error, retrying...`,
            );
            await new Promise((r) => setTimeout(r, computeRetryDelayMs(attempt)));
          }
        }
      }

      if (!result) {
        throw new InternalServerErrorException(
          formatSiteRetryExhaustedMessage(maxRetries, lastError),
        );
      }
      const html = extractAnthropicHtml(result);
      if (!html) {
        throw new InternalServerErrorException(ERR_SITE_EMPTY_HTML);
      }

      const usageTokens = extractAnthropicUsageTokens(result);
      if (workspaceId && shouldTrackTokenUsage(usageTokens)) {
        await this.trackCapabilityAiUsage(workspaceId, usageTokens, capability);
      }
      return {
        content: 'Site gerado e pronto para revisão.',
        metadata: { capability, generatedSiteHtml: html },
        estimatedTokens: shouldTrackTokenUsage(usageTokens) ? usageTokens : 0,
      };
    }

    if (capability === 'document_to_markdown') {
      return this.convertAttachedDocumentToMarkdown({
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        ...(workspaceId !== undefined ? { workspaceId } : {}),
        ...(signal !== undefined ? { signal } : {}),
      });
    }

    throw new BadRequestException(ERR_UNSUPPORTED_CAPABILITY);
  }

  /** Path shape of our own signed storage access URLs. */
  private readonly storageAccessPathRe = /^\/storage\/(?:local|access)\/([^/]+)$/;

  /**
   * Resolve a signed storage access URL (`/storage/local/<token>` or
   * `/storage/access/<token>`) back to its storage-relative path, or null
   * when the URL is not one of our own signed storage URLs.
   */
  private resolveStorageAccessRelativePath(sourceUrl: string): string | null {
    let pathname = '';
    try {
      pathname = new URL(String(sourceUrl || '').trim()).pathname;
    } catch (error: unknown) {
      this.logger.warn(`URL de documento anexado inválida: ${this.formatUnknownError(error)}`);
      return null;
    }
    const token = this.storageAccessPathRe.exec(pathname)?.[1];
    if (!token) {
      return null;
    }
    try {
      return this.storageService.resolveLocalAccessToken(decodeURIComponent(token)).relativePath;
    } catch (error: unknown) {
      this.logger.warn(
        `Token de acesso ao storage do documento anexado inválido: ${this.formatUnknownError(error)}`,
      );
      return null;
    }
  }

  /**
   * Load the attached document bytes: prefer reading our own storage directly
   * (signed access URL), falling back to an SSRF-validated download for
   * public storage/CDN URLs.
   */
  private async resolveAttachedDocumentBuffer(
    sourceUrl: string,
    signal: AbortSignal | undefined,
  ): Promise<Buffer> {
    const relativePath = this.resolveStorageAccessRelativePath(sourceUrl);
    if (relativePath) {
      const stored = await this.storageService.readAccessFile(relativePath);
      if (stored) {
        return stored.buffer;
      }
      throw new InternalServerErrorException(ERR_DOCUMENT_DOWNLOAD_FAILED);
    }
    validateNoInternalAccess(sourceUrl);
    try {
      const timeoutSignal = AbortSignal.timeout(DOCUMENT_DOWNLOAD_TIMEOUT_MS);
      const response = await fetch(sourceUrl, {
        headers: getTraceHeaders(),
        signal: composeAbortSignal(signal, timeoutSignal),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error: unknown) {
      this.logger.warn(`Falha ao baixar documento anexado: ${this.formatUnknownError(error)}`);
      throw new InternalServerErrorException(ERR_DOCUMENT_DOWNLOAD_FAILED);
    }
  }

  /** Convert a PDF buffer to markdown via the in-repo `pdf-parse` engine. */
  private async convertPdfBufferToMarkdown(buffer: Buffer): Promise<string> {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      return plainTextToMarkdown(String(parsed.text || ''));
    } finally {
      await parser.destroy();
    }
  }

  /** Convert the attached document bytes into markdown for its format. */
  private async convertDocumentBufferToMarkdown(
    format: ConvertibleDocumentFormat,
    buffer: Buffer,
  ): Promise<string> {
    if (format === 'html') {
      return htmlToMarkdown(buffer.toString('utf-8'));
    }
    if (format === 'text') {
      return plainTextToMarkdown(buffer.toString('utf-8'));
    }
    try {
      if (format === 'pdf') {
        return await this.convertPdfBufferToMarkdown(buffer);
      }
      const markdown = docxBufferToMarkdown(buffer);
      if (markdown === null) {
        throw new Error('DOCX container ilegível');
      }
      return markdown;
    } catch (error: unknown) {
      this.logger.warn(
        `Falha ao converter documento anexado (${format}): ${this.formatUnknownError(error)}`,
      );
      throw new InternalServerErrorException(ERR_DOCUMENT_CONVERSION_FAILED);
    }
  }

  /**
   * Silent document→markdown capability: load the attached document, convert
   * it locally (no LLM call, no provider spend) and persist the resulting
   * `.md` so the chat can deliver a downloadable file card. The full markdown
   * travels in `metadata.convertedMarkdown` for the file card and is redacted
   * from the public trace by the thinker branch.
   */
  private async convertAttachedDocumentToMarkdown(input: {
    metadata?: Prisma.InputJsonValue | Prisma.JsonValue | null;
    workspaceId?: string;
    signal?: AbortSignal;
  }): Promise<CapabilityExecutionResult> {
    const { metadata, workspaceId, signal } = input;
    const attachment = pickConvertibleDocumentAttachment(
      extractComposerMetadata(metadata).attachments,
    );
    const sourceUrl = typeof attachment?.url === 'string' ? attachment.url.trim() : '';
    if (!attachment || !sourceUrl) {
      throw new BadRequestException(ERR_DOCUMENT_ATTACHMENT_MISSING);
    }
    const format = resolveConvertibleDocumentFormat(attachment.name, attachment.mimeType);
    if (!format) {
      throw new BadRequestException(ERR_DOCUMENT_ATTACHMENT_MISSING);
    }
    const buffer = await this.resolveAttachedDocumentBuffer(sourceUrl, signal);
    const markdown = await this.convertDocumentBufferToMarkdown(format, buffer);
    if (!markdown.trim()) {
      throw new InternalServerErrorException(ERR_DOCUMENT_NO_TEXT);
    }
    const convertedDocumentFilename = buildConvertedMarkdownFilename(attachment.name);
    let convertedDocumentUrl: string | null = null;
    try {
      const stored = await this.storageService.upload(Buffer.from(markdown, 'utf-8'), {
        filename: convertedDocumentFilename,
        mimeType: 'text/markdown',
        folder: convertedMarkdownStorageFolder(workspaceId),
        ...(workspaceId !== undefined ? { workspaceId } : {}),
      });
      convertedDocumentUrl = stored.url;
    } catch (error: unknown) {
      // Best-effort persistence: the markdown still reaches the user through
      // the file card content even when the storage write fails.
      this.logger.warn(
        `Falha ao persistir markdown convertido no storage: ${this.formatUnknownError(error)}`,
      );
    }
    const sourceDocumentName = String(attachment.name || '').trim() || convertedDocumentFilename;
    return {
      content: `Documento "${sourceDocumentName}" convertido para markdown e pronto para download.`,
      metadata: {
        capability: 'document_to_markdown',
        convertedMarkdown: markdown,
        convertedDocumentFilename,
        ...(convertedDocumentUrl ? { convertedDocumentUrl } : {}),
        sourceDocumentName,
        sourceDocumentFormat: format,
      },
      estimatedTokens: 0,
    };
  }
}
