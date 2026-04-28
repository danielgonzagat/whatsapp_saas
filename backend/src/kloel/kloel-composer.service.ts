import { Injectable, Logger } from '@nestjs/common';
import type { ImagesResponse, ImageGenerateParamsNonStreaming } from 'openai/resources/images';
import OpenAI from 'openai';
import { Prisma } from '@prisma/client';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { StorageService } from '../common/storage/storage.service';
import { getTraceHeaders } from '../common/trace-headers';
import { resolveKloelCapabilityModel } from '../lib/ai-models';
import {
  buildComposerImageE2EStub,
  buildComposerWebSearchE2EStub,
  isComposerWebSearchE2EStubEnabled,
} from './kloel-composer-web-search-e2e-stub';

const MODEL_RE = /model/i;
const INVALID_RE = /invalid/i;

const KLOEL_SEARCH_WEB_MODEL = resolveKloelCapabilityModel('search_web');
const KLOEL_IMAGE_MODEL = resolveKloelCapabilityModel('create_image');
function composeAbortSignal(
  signal: AbortSignal | undefined,
  timeoutSignal: AbortSignal,
): AbortSignal {
  if (!signal) return timeoutSignal;
  const controller = new AbortController();
  const abortFrom = (source: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(source.reason);
  };
  for (const source of [signal, timeoutSignal]) {
    if (source.aborted) abortFrom(source);
    else source.addEventListener('abort', () => abortFrom(source), { once: true });
  }
  return controller.signal;
}

const KLOEL_SITE_MODEL = resolveKloelCapabilityModel('create_site');

const ERR_UNSUPPORTED_CAPABILITY = 'Capacidade do composer não suportada.';
const ERR_IMAGE_API_KEY_MISSING = 'OPENAI_API_KEY não configurada para criar imagens.';
const ERR_IMAGE_GENERATION_RETRY = 'Não foi possível gerar a imagem agora. Tente novamente.';
const ERR_IMAGE_GENERATION_FAILED = 'Não foi possível gerar a imagem. Tente novamente.';
const ERR_SITE_API_KEY_MISSING = 'ANTHROPIC_API_KEY não configurada para criar sites.';
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
  private readonly logger = new Logger(KloelComposerService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly planLimits: PlanLimitsService,
    private readonly storageService: StorageService,
  ) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  buildCapabilityPrompt(message: string, composerContext?: string): string {
    return [String(message || '').trim(), composerContext?.trim()].filter(Boolean).join('\n\n');
  }

  formatSearchDigestAsMarkdown(digest: WebSearchDigest): string {
    const body = String(digest.answer || '').trim() || 'Nenhum resultado confiável foi encontrado.';
    if (!Array.isArray(digest.sources) || digest.sources.length === 0) return body;
    const sourcesBlock = digest.sources
      .map((source, index) => `- [${index + 1}] ${source.title || source.url} — ${source.url}`)
      .join('\n');
    return `${body}\n\nFontes:\n${sourcesBlock}`;
  }

  async searchWeb(query: string): Promise<WebSearchDigest> {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) return { answer: '', sources: [] };

    // E2E test harness: the workflow runs with OPENAI_API_KEY=e2e-dummy-key
    // so any real OpenAI Responses API call fails. The chat composer e2e
    // spec `kloel-chat-composer-real.spec.ts:289` exercises the web-search
    // capability and asserts the assistant message exposes
    // metadata.webSources plus content matching /openai\.com/i. Returning
    // a deterministic digest keeps the rest of the pipeline (capability
    // dispatcher, token accounting, message metadata) intact.
    // Production never reaches this branch — guarded by NODE_ENV.
    if (isComposerWebSearchE2EStubEnabled()) {
      return buildComposerWebSearchE2EStub(normalizedQuery);
    }

    // PULSE:OK — callers enforce PlanLimitsService.ensureTokenBudget() before calling searchWeb
    const response = await this.openai.responses.create({
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
    });

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
        if (seen.has(source.url)) return false;
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
        workspaceId,
      });
      return stored.url;
    }
    const remoteImageUrl = String(response?.data?.[0]?.url || '').trim();
    if (!remoteImageUrl) return null;
    const stored = await this.storageService.uploadFromUrl(remoteImageUrl, {
      filename,
      mimeType: 'image/png',
      folder,
      workspaceId,
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
      if (workspaceId) await this.planLimits.ensureTokenBudget(workspaceId);
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
      if (isComposerWebSearchE2EStubEnabled()) {
        return buildComposerImageE2EStub();
      }
      if (!process.env.OPENAI_API_KEY) {
        throw new Error(ERR_IMAGE_API_KEY_MISSING);
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
        response = await this.openai.images.generate(imageRequest, requestOptions);
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
          throw new Error(ERR_IMAGE_GENERATION_RETRY);
        }
        throw new Error(ERR_IMAGE_GENERATION_FAILED);
      }

      const rawImageUrl = String(
        response?.data?.[0]?.url ||
          (response?.data?.[0]?.b64_json
            ? `data:image/png;base64,${response.data[0].b64_json}`
            : ''),
      ).trim();
      if (!rawImageUrl) {
        throw new Error(ERR_IMAGE_GENERATION_FAILED);
      }

      const generatedImageFilename = `kloel-image-${workspaceId || 'workspace'}-${Date.now()}.png`;
      let imageUrl = rawImageUrl;
      try {
        const persistedImageUrl = await this.persistGeneratedImageAsset({
          response,
          workspaceId,
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
        throw new Error(ERR_SITE_API_KEY_MISSING);
      }
      if (workspaceId) {
        await this.planLimits.ensureTokenBudget(workspaceId);
      }

      const timeoutSignal = AbortSignal.timeout(60_000);
      const requestSignal = composeAbortSignal(signal, timeoutSignal);

      // Not SSRF: hardcoded Anthropic API endpoint
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: requestSignal,
        headers: {
          ...getTraceHeaders(),
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
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
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      const html = String(result?.content?.[0]?.text || '').trim();
      if (!html) {
        throw new Error(ERR_SITE_EMPTY_HTML);
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

    throw new Error(ERR_UNSUPPORTED_CAPABILITY);
  }
}
