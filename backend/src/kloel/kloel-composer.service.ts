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
import { KloelComposerE2EGuard, KLOEL_COMPOSER_E2E_GUARD } from './kloel-composer-e2e-guard';
import { callOpenAIWithRetry } from './openai-wrapper';
import {
  ANTHROPIC_SITE_MAX_RETRIES,
  ANTHROPIC_SITE_TIMEOUT_MS,
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

  constructor(
    private readonly planLimits: PlanLimitsService,
    private readonly storageService: StorageService,
    @Inject(KLOEL_COMPOSER_E2E_GUARD) private readonly e2EGuard: KloelComposerE2EGuard,
  ) {
    this.openai = process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
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
        await this.planLimits.trackAiUsage(workspaceId, usageTokens).catch(() => {});
      }
      return {
        content,
        metadata: { capability, webSources: digest.sources },
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
        await this.planLimits.trackAiUsage(workspaceId, usageTokens).catch(() => {});
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
            const errorText = await response.text().catch(() => '');
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
        await this.planLimits.trackAiUsage(workspaceId, usageTokens).catch(() => {});
      }
      return {
        content: 'Site gerado e pronto para revisão.',
        metadata: { capability, generatedSiteHtml: html },
        estimatedTokens: shouldTrackTokenUsage(usageTokens) ? usageTokens : 0,
      };
    }

    throw new BadRequestException(ERR_UNSUPPORTED_CAPABILITY);
  }
}
