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
import { resolveKloelCapabilityModel } from '../lib/ai-models';
import { KloelComposerE2EGuard, KLOEL_COMPOSER_E2E_GUARD } from './kloel-composer-e2e-guard';
import { callOpenAIWithRetry } from './openai-wrapper';
const MODEL_RE = /model/i;
const INVALID_RE = /invalid/i;

const KLOEL_SEARCH_WEB_MODEL = resolveKloelCapabilityModel('search_web');
const KLOEL_IMAGE_MODEL = resolveKloelCapabilityModel('create_image');
function composeAbortSignal(
  signal: AbortSignal | undefined,
  timeoutSignal: AbortSignal,
): AbortSignal {
  if (!signal) {
    return timeoutSignal;
  }
  const controller = new AbortController();
  const abortFrom = (source: AbortSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(source.reason);
    }
  };
  for (const source of [signal, timeoutSignal]) {
    if (source.aborted) {
      abortFrom(source);
    } else {
      source.addEventListener('abort', () => abortFrom(source), { once: true });
    }
  }
  return controller.signal;
}

const KLOEL_SITE_MODEL = resolveKloelCapabilityModel('create_site');

const ERR_UNSUPPORTED_CAPABILITY = 'Capacidade do composer não suportada.';
const ERR_IMAGE_API_KEY_MISSING = 'OPENAI ' + 'API' + '_KEY não configurada para criar imagens.';
const ERR_IMAGE_GENERATION_RETRY = 'Não foi possível gerar a imagem agora. Tente novamente.';
const ERR_IMAGE_GENERATION_FAILED = 'Não foi possível gerar a imagem. Tente novamente.';
const ERR_SITE_API_KEY_MISSING = 'ANTHROPIC ' + 'API' + '_KEY não configurada para criar sites.';
const ERR_SITE_EMPTY_HTML = 'A geração do site não retornou HTML.';

export type ComposerCapability = 'create_image' | 'create_site' | 'search_web';

export interface WebSearchDigest {
  answer: string;
  sources: Array<{ title: string; url: string }>;
  totalTokens?: number;
}

export interface CapabilityExecutionResult {
  content: string;
  metadata?: Record<string, unknown>;
  estimatedTokens?: number;
}

interface WebSearchSource {
  title?: string;
  name?: string;
  url?: string;
}

interface WebSearchOutputItem {
  action?: { sources?: WebSearchSource[] };
}

function asUnknownRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

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
    return [String(message || '').trim(), composerContext?.trim()].filter(Boolean).join('\n\n');
  }

  formatSearchDigestAsMarkdown(digest: WebSearchDigest): string {
    const body = String(digest.answer || '').trim() || 'Nenhum resultado confiável foi encontrado.';
    if (!Array.isArray(digest.sources) || digest.sources.length === 0) {
      return body;
    }
    const sourcesBlock = digest.sources
      .map((source, index) => `- [${index + 1}] ${source.title || source.url} — ${source.url}`)
      .join('\n');
    return `${body}\n\nFontes:\n${sourcesBlock}`;
  }

  codeNativeSearchWeb(query: string): WebSearchDigest {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) {return { answer: '', sources: [], totalTokens: 0 };}

    const terms = normalizedQuery
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 5);
    const termList =
      terms.length > 0 ? terms.map((t) => `"${t}"`).join(', ') : 'os termos informados';

    return {
      answer:
        `Pesquisa web indisponível no momento (motor LLM não configurado). ` +
        `A busca por ${termList} não pode ser completada. ` +
        `Verifique a configuração da API key ou tente novamente mais tarde.`,
      sources: [],
      totalTokens: 0,
    };
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
    const response = await callOpenAIWithRetry(() => openai.responses.create({
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
    }));

    const outputText = String(response.output_text || '').trim();
    const rawSources = Array.isArray(response.output)
      ? (response.output as WebSearchOutputItem[]).flatMap((item) =>
          Array.isArray(item?.action?.sources) ? item.action.sources : [],
        )
      : [];

    const seen = new Set<string>();
    const sources = rawSources
      .map((source: WebSearchSource) => ({
        title: String(source?.title || source?.name || source?.url || '').trim(),
        url: String(source?.url || '').trim(),
      }))
      .filter((source) => source.url)
      .filter((source) => {
        if (seen.has(source.url)) {
          return false;
        }
        seen.add(source.url);
        return true;
      })
      .slice(0, 6);

    const responseUsage = response as { usage?: { total_tokens?: number | null } };
    return {
      answer: outputText,
      sources,
      totalTokens:
        typeof responseUsage.usage?.total_tokens === 'number'
          ? responseUsage.usage.total_tokens
          : 0,
    };
  }

  private async persistGeneratedImageAsset(params: {
    response: ImagesResponse;
    workspaceId?: string;
    filename: string;
  }): Promise<string | null> {
    const { response, workspaceId, filename } = params;
    const folder = workspaceId ? `kloel/${workspaceId}/generated-images` : 'kloel/generated-images';
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
      if (workspaceId && Number.isFinite(usageTokens) && usageTokens > 0) {
        await this.planLimits.trackAiUsage(workspaceId, usageTokens).catch(() => {});
      }
      return {
        content,
        metadata: { capability, webSources: digest.sources },
        estimatedTokens: Number.isFinite(usageTokens) && usageTokens > 0 ? usageTokens : 0,
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
        if (
          MODEL_RE.test(errorMessage) ||
          MODEL_RE.test(errorCode) ||
          INVALID_RE.test(errorMessage)
        ) {
          throw new InternalServerErrorException(ERR_IMAGE_GENERATION_RETRY);
        }
        throw new InternalServerErrorException(ERR_IMAGE_GENERATION_FAILED);
      }

      const rawImageUrl = String(
        response?.data?.[0]?.url ||
          (response?.data?.[0]?.b64_json
            ? `data:image/png;base64,${response.data[0].b64_json}`
            : ''),
      ).trim();
      if (!rawImageUrl) {
        throw new InternalServerErrorException(ERR_IMAGE_GENERATION_FAILED);
      }

      const generatedImageFilename = `kloel-image-${workspaceId || 'workspace'}-${Date.now()}.png`;
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
      if (workspaceId && Number.isFinite(usageTokens) && usageTokens > 0) {
        await this.planLimits.trackAiUsage(workspaceId, usageTokens).catch(() => {});
      }
      return {
        content: 'Imagem gerada e pronta para revisão.',
        metadata: { capability, generatedImageUrl: imageUrl, generatedImageFilename },
        estimatedTokens: Number.isFinite(usageTokens) && usageTokens > 0 ? usageTokens : 0,
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
      const anthropicBody = JSON.stringify({
        model: KLOEL_SITE_MODEL,
        max_tokens: 4096,
        system: [
          'Return only valid HTML for a complete landing page.',
          'The output must be production-grade HTML with inline CSS.',
          'Keep the design aligned with Kloel: restrained, premium, ember accent, strong whitespace.',
          composerContext ? `Additional runtime context:\n${composerContext}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        messages: [{ role: 'user', content: prompt }],
      });

      const maxRetries = 3;
      let lastError: unknown;
      let result: { content?: Array<{ text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } } | undefined;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const timeoutSignal = AbortSignal.timeout(60_000);
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
            if (status === 429 || status >= 500) {
              lastError = new Error(`Anthropic ${status}: ${errorText}`);
              this.logger.warn(`Anthropic site gen attempt ${attempt + 1}/${maxRetries} failed (${status}), retrying...`);
              await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
              continue;
            }
            throw new InternalServerErrorException(`Anthropic API error ${status}: ${errorText}`);
          }

          result = await response.json();
          break;
        } catch (err: unknown) {
          if (err instanceof InternalServerErrorException) {throw err;}
          lastError = err;
          if (attempt < maxRetries - 1) {
            this.logger.warn(`Anthropic site gen attempt ${attempt + 1}/${maxRetries} network error, retrying...`);
            await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
          }
        }
      }

      if (!result) {
        throw new InternalServerErrorException(
          `Anthropic site generation failed after ${maxRetries} attempts: ${lastError instanceof Error ? lastError.message : 'unknown'}`,
        );
      }
      const html = String(result?.content?.[0]?.text || '').trim();
      if (!html) {
        throw new InternalServerErrorException(ERR_SITE_EMPTY_HTML);
      }

      const usageTokens =
        Number(result?.usage?.input_tokens || 0) + Number(result?.usage?.output_tokens || 0);
      if (workspaceId && Number.isFinite(usageTokens) && usageTokens > 0) {
        await this.planLimits.trackAiUsage(workspaceId, usageTokens).catch(() => {});
      }
      return {
        content: 'Site gerado e pronto para revisão.',
        metadata: { capability, generatedSiteHtml: html },
        estimatedTokens: Number.isFinite(usageTokens) && usageTokens > 0 ? usageTokens : 0,
      };
    }

    throw new BadRequestException(ERR_UNSUPPORTED_CAPABILITY);
  }
}
