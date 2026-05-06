import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Request,
  ServiceUnavailableException,
  UseGuards,
  Optional,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { getTraceHeaders } from '../common/trace-headers';
import { resolveKloelCapabilityModel } from '../lib/ai-models';
import { PrismaService } from '../prisma/prisma.service';
import {
  estimateAnthropicMessageQuoteCostCents,
  estimateOpenAiChatQuoteCostCents,
  quoteAnthropicMessageActualCostCents,
  quoteOpenAiChatActualCostCents,
} from '../wallet/provider-llm-billing';
import { UnknownProviderPricingModelError } from '../wallet/provider-pricing';
import { WalletService } from '../wallet/wallet.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import {
  InsufficientWalletBalanceError,
  UsagePriceNotFoundError,
  WalletNotFoundError,
} from '../wallet/wallet.types';

const U0300__U036F_RE = /[\u0300-\u036f]/g;
const A_Z0_9_RE = /[^a-z0-9]+/g;
const PATTERN_RE = /^-|-$/g;
const SITE_GENERATION_MAX_OUTPUT_TOKENS = 4096;

type SiteProvider = 'openai' | 'anthropic';

/** Site controller. */
@UseGuards(JwtAuthGuard)
@Controller('kloel/site')
export class SiteController {
  private readonly logger = new Logger(SiteController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly prepaidWalletService: WalletService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  private insufficientWalletMessage() {
    return 'Saldo insuficiente na wallet prepaid para gerar o site. Recarregue via PIX ou aguarde a auto-recarga antes de tentar novamente.';
  }

  private estimateSiteGenerationQuote(input: {
    providerPreference: SiteProvider;
    model: string;
    systemPrompt: string;
    prompt: string;
  }): bigint | undefined {
    try {
      if (input.providerPreference === 'openai') {
        return estimateOpenAiChatQuoteCostCents({
          model: input.model,
          messages: [
            { role: 'system', content: input.systemPrompt },
            { role: 'user', content: input.prompt },
          ],
          maxOutputTokens: SITE_GENERATION_MAX_OUTPUT_TOKENS,
        });
      }

      return estimateAnthropicMessageQuoteCostCents({
        model: input.model,
        system: input.systemPrompt,
        messages: [{ role: 'user', content: input.prompt }],
        maxOutputTokens: SITE_GENERATION_MAX_OUTPUT_TOKENS,
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'SiteController.estimateAnthropicMessageQuoteCostCents',
      );
      if (error instanceof UnknownProviderPricingModelError) {
        return undefined;
      }
      throw error;
    }
  }

  private async chargeSiteGenerationIfNeeded(input: {
    workspaceId: string | undefined;
    requestId: string;
    prompt: string;
    providerPreference: SiteProvider;
    model: string;
    estimatedCostCents?: bigint;
  }) {
    if (!input.workspaceId) {
      return false;
    }

    try {
      await this.prepaidWalletService.chargeForUsage({
        workspaceId: input.workspaceId,
        operation: 'ai_message',
        ...(input.estimatedCostCents !== undefined
          ? { quotedCostCents: input.estimatedCostCents }
          : { units: 1 }),
        requestId: input.requestId,
        metadata: {
          channel: 'kloel_site',
          capability: 'site_generation',
          provider: input.providerPreference,
          model: input.model,
          promptLength: input.prompt.length,
          billingRail:
            input.estimatedCostCents !== undefined ? 'provider_quote' : 'catalog_fallback',
        },
      });
      return true;
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'SiteController.chargeForUsage');
      if (error instanceof UsagePriceNotFoundError) {
        return false;
      }
      if (error instanceof InsufficientWalletBalanceError || error instanceof WalletNotFoundError) {
        throw new HttpException(this.insufficientWalletMessage(), HttpStatus.PAYMENT_REQUIRED);
      }
      throw error;
    }
  }

  private async settleSiteGenerationIfNeeded(input: {
    workspaceId: string | undefined;
    requestId: string;
    providerPreference: SiteProvider;
    model: string;
    usage: unknown;
  }) {
    if (!input.workspaceId) {
      return;
    }

    try {
      const actualCostCents =
        input.providerPreference === 'openai'
          ? quoteOpenAiChatActualCostCents({
              model: input.model,
              usage: input.usage as {
                prompt_tokens?: number | null;
                completion_tokens?: number | null;
                prompt_tokens_details?: { cached_tokens?: number | null } | null;
              },
            })
          : quoteAnthropicMessageActualCostCents({
              model: input.model,
              usage: input.usage as {
                input_tokens?: number | null;
                output_tokens?: number | null;
                cache_read_input_tokens?: number | null;
                cache_creation_input_tokens?: number | null;
              },
            });

      await this.prepaidWalletService.settleUsageCharge({
        workspaceId: input.workspaceId,
        operation: 'ai_message',
        requestId: input.requestId,
        actualCostCents,
        reason: 'site_generation_provider_usage',
        metadata: {
          channel: 'kloel_site',
          capability: 'site_generation',
          provider: input.providerPreference,
          model: input.model,
        },
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'SiteController.settleUsageCharge');
      if (!(error instanceof UnknownProviderPricingModelError)) {
        throw error;
      }
    }
  }

  private async refundSiteGenerationIfNeeded(
    workspaceId: string | undefined,
    requestId: string,
    reason: string,
  ) {
    if (!workspaceId) {
      return;
    }

    try {
      await this.prepaidWalletService.refundUsageCharge({
        workspaceId,
        operation: 'ai_message',
        requestId,
        reason,
        metadata: {
          channel: 'kloel_site',
          capability: 'site_generation',
        },
      });
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'SiteController.refundUsageCharge');
      this.logger.error(
        `Failed to refund site_generation workspace=${workspaceId} request=${requestId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // GET /kloel/site/list — list sites for workspace
  @Get('list')
  async listSites(@Request() req: AuthenticatedRequest) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) {
      return { sites: [], count: 0 };
    }
    const sites = await this.prisma.kloelSite.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    });
    return { sites, count: sites.length };
  }

  // POST /kloel/site/generate — generate site HTML (proxy to AI)
  @Post('generate')
  async generateSite(
    @Request() req: AuthenticatedRequest,
    @Body() dto: { prompt: string; currentHtml?: string; idempotencyKey?: string },
  ) {
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const workspaceId = req.user?.workspaceId;
    const requestId =
      typeof dto.idempotencyKey === 'string' && dto.idempotencyKey.trim().length > 0
        ? dto.idempotencyKey.trim()
        : randomUUID();

    if (!openaiKey && !anthropicKey) {
      throw new ServiceUnavailableException(
        'AI site generation is not available. Configure OPENAI_API_KEY or ANTHROPIC_API_KEY.',
      );
    }

    const systemPrompt = [
      'You are a landing page generator. Return ONLY valid HTML (no markdown, no code fences).',
      'The HTML must be a complete, self-contained page with inline CSS.',
      'Use modern design: dark background (#0A0A0C), light text (#E0DDD8), accent (#E85D30).',
      dto.currentHtml
        ? `The user wants to edit an existing page. Here is the current HTML:\n${dto.currentHtml}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
    const providerPreference: SiteProvider = openaiKey ? 'openai' : 'anthropic';
    const model = resolveKloelCapabilityModel(
      providerPreference === 'openai' ? 'generate_site_openai' : 'generate_site_anthropic',
    );
    const estimatedCostCents = this.estimateSiteGenerationQuote({
      providerPreference,
      model,
      systemPrompt,
      prompt: dto.prompt,
    });
    const usageCharged = await this.chargeSiteGenerationIfNeeded({
      workspaceId,
      requestId,
      prompt: dto.prompt,
      providerPreference,
      model,
      estimatedCostCents,
    });

    try {
      // tokenBudget: site generation is a one-shot action; budget enforced at plan level
      if (openaiKey) {
        const openAiRequestBody = {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: dto.prompt },
          ],
          max_tokens: SITE_GENERATION_MAX_OUTPUT_TOKENS,
          temperature: 0.7,
        };

        // Not SSRF: hardcoded OpenAI API endpoint
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            ...getTraceHeaders(),
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify(openAiRequestBody),
          signal: AbortSignal.timeout(60000),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`OpenAI API error ${response.status}: ${err}`);
        }

        const result = (await response.json()) as {
          choices?: Array<{ message?: { content?: string | null } | null }>;
          usage?: {
            prompt_tokens?: number | null;
            completion_tokens?: number | null;
            prompt_tokens_details?: { cached_tokens?: number | null } | null;
          } | null;
        };
        if (estimatedCostCents !== undefined && usageCharged) {
          await this.settleSiteGenerationIfNeeded({
            workspaceId,
            requestId,
            providerPreference,
            model,
            usage: result.usage,
          });
        }
        const html = result.choices?.[0]?.message?.content?.trim() || null;
        return { success: true, html, message: 'Generated via OpenAI' };
      }

      // tokenBudget: site generation is a one-shot action; budget enforced at plan level
      // Fallback to Anthropic
      const anthropicRequestBody = {
        model,
        max_tokens: SITE_GENERATION_MAX_OUTPUT_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: dto.prompt }],
      };

      // Not SSRF: hardcoded Anthropic API endpoint
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          ...getTraceHeaders(),
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(anthropicRequestBody),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${err}`);
      }

      const result = (await response.json()) as {
        content?: Array<{ text?: string | null }>;
        usage?: {
          input_tokens?: number | null;
          output_tokens?: number | null;
          cache_read_input_tokens?: number | null;
          cache_creation_input_tokens?: number | null;
        } | null;
      };
      if (estimatedCostCents !== undefined && usageCharged) {
        await this.settleSiteGenerationIfNeeded({
          workspaceId,
          requestId,
          providerPreference,
          model,
          usage: result.usage,
        });
      }
      const html = result.content?.[0]?.text?.trim() || null;
      return { success: true, html, message: 'Generated via Anthropic' };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'SiteController.generateSite');
      if (usageCharged) {
        await this.refundSiteGenerationIfNeeded(
          workspaceId,
          requestId,
          'site_generation_provider_exception',
        );
      }
      throw new ServiceUnavailableException(
        `AI generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // POST /kloel/site/save — save site draft
  @Post('save')
  async saveSite(
    @Request() req: AuthenticatedRequest,
    @Body()
    dto: { name?: string; htmlContent: string; productId?: string; idempotencyKey?: string },
  ) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) {
      throw new NotFoundException('Workspace not found');
    }
    const site = await this.prisma.kloelSite.create({
      data: {
        workspaceId,
        name: dto.name || 'Site sem titulo',
        htmlContent: dto.htmlContent,
        productId: dto.productId || null,
      },
    });
    return { site, success: true };
  }

  // PUT /kloel/site/:id — update site
  @Put(':id')
  async updateSite(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
  ) {
    const workspaceId = req.user?.workspaceId;
    const existing = await this.prisma.kloelSite.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) {
      throw new NotFoundException('Site not found');
    }
    const { id: _, workspaceId: __, ...data } = dto;
    await this.prisma.kloelSite.updateMany({ where: { id, workspaceId }, data });
    return { site: { ...existing, ...data }, success: true };
  }

  // POST /kloel/site/:id/publish — publish site with slug
  @Post(':id/publish')
  async publishSite(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const existing = await this.prisma.kloelSite.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) {
      throw new NotFoundException('Site not found');
    }

    const baseSlug = (existing.name || 'site')
      .toLowerCase()
      .normalize('NFD')
      .replace(U0300__U036F_RE, '')
      .replace(A_Z0_9_RE, '-')
      .replace(PATTERN_RE, '');
    const slug = `${baseSlug}-${id.slice(0, 6)}`;

    await this.prisma.kloelSite.updateMany({
      where: { id, workspaceId },
      data: { published: true, slug },
    });
    return {
      site: { ...existing, published: true, slug },
      slug,
      url: `/s/${slug}`,
      success: true,
    };
  }

  // DELETE /kloel/site/:id
  @Delete(':id')
  async deleteSite(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const existing = await this.prisma.kloelSite.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) {
      throw new NotFoundException('Site not found');
    }
    await this.auditService.log({
      workspaceId: workspaceId || 'unknown',
      action: 'DELETE_RECORD',
      resource: 'KloelSite',
      resourceId: id,
      details: { deletedBy: 'user', name: existing.name },
    });
    await this.prisma.kloelSite.deleteMany({ where: { id, workspaceId } });
    return { success: true };
  }
}
