import { Prisma } from '@prisma/client';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { SmartTimeService } from '../analytics/smart-time/smart-time.service';
import { AuditService } from '../audit/audit.service';
import { forEachSequential } from '../common/async-sequence';
import { createBullMqConnectionOptions } from '../common/redis/redis.util';
import {
  buildListUnsubscribeHeader,
  buildUnsubscribeFooterHtml,
} from '../common/utils/unsubscribe-footer.util';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { CampaignEventEmitterService } from '../kloel/campaign-emitter/campaign-event-emitter.service';
import { MetaWhatsAppService } from '../meta/meta-whatsapp.service';
import { WhatsappMessageDispatcherService } from '../marketing/channels/whatsapp/whatsapp-message-dispatcher.service';
import { isCompliantWhatsappSendEnabled } from '../common/feature-flags/compliant-whatsapp-send.flag';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';

import { NAME_RE } from '../common/regex';
import {
  buildCampaignDeliveryGap,
  buildVariantFallbackCopy,
  computeCampaignDeliveryReadiness,
  computeSmartTimeDelayMs,
  validateVariantCopy,
} from './campaigns.helpers';
import {
  buildCampaignDefaultStats,
  isCampaignAlreadyProcessed,
  isCampaignPausable,
  scoreCampaignRow,
} from './campaigns.service.helpers';

/** Campaigns service. */
@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);
  private campaignQueue: Queue;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private smartTime: SmartTimeService,
    private campaignEmitter: CampaignEventEmitterService,
    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() private readonly metaWhatsApp?: MetaWhatsAppService,
    @Optional() private readonly whatsappDispatcher?: WhatsappMessageDispatcherService,
  ) {
    const connection = createBullMqConnectionOptions();

    this.campaignQueue = new Queue('campaign-jobs', { connection });
  }

  /**
   * Send one campaign WhatsApp message for the bulk blast.
   *
   * P0-B compliance flag (KLOEL_COMPLIANT_WHATSAPP_SEND): when ON and the
   * canonical {@link WhatsappMessageDispatcherService} is injected, route the
   * send through it so plan-limit enforcement, opt-in enforcement, queue
   * routing and billing metering all apply to the mass blast. Flag OFF
   * (default) → byte-identical legacy raw `metaWhatsApp.sendTextMessage` path.
   *
   * @returns `true` when the message was accepted (queued or sent), mirroring
   *          the legacy `delivered.success` boolean the caller branches on.
   */
  private async sendCampaignWhatsApp(
    workspaceId: string,
    phone: string,
    body: string,
  ): Promise<boolean> {
    if (isCompliantWhatsappSendEnabled() && this.whatsappDispatcher) {
      const result = await this.whatsappDispatcher.sendMessage(workspaceId, phone, body);
      const obj = (result ?? {}) as Record<string, unknown>;
      return obj.ok === true && obj.error !== true;
    }
    if (!this.metaWhatsApp) {
      return false;
    }
    const delivered = await this.metaWhatsApp.sendTextMessage(workspaceId, phone, body);
    return delivered.success === true;
  }

  /** Create. */
  async create(
    workspaceId: string,
    data: {
      name: string;
      messageTemplate?: string;
      scheduledAt?: string;
      aiStrategy?: string;
      parentId?: string;
      filters?: Prisma.InputJsonValue;
      idempotencyKey?: string;
    },
  ) {
    return this.prisma.campaign.create({
      data: {
        ...(data as Prisma.CampaignCreateInput),
        workspace: { connect: { id: workspaceId } },
        status: 'DRAFT',
        stats: buildCampaignDefaultStats(),
      },
    });
  }

  /** Find all. */
  async findAll(workspaceId: string) {
    return this.prisma.campaign.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        status: true,
        stats: true,
        scheduledAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Canonical-name alias of {@link findAll} for the Kloel capability
   * resolver (`CampaignService.list`). Accepts the (workspaceId, args)
   * signature used by `KloelDomainServiceResolver`; args are ignored
   * — listing is workspace-scoped only.
   */
  async list(workspaceId: string) {
    return this.findAll(workspaceId);
  }

  /**
   * Canonical-name alias of {@link create} for the Kloel capability
   * resolver (`CampaignService.createBroadcast`). A broadcast is a
   * one-shot mass campaign — modeled as the same DRAFT campaign row;
   * the dispatch worker fans it out at scheduled time. `args.name` is
   * required; other optional fields pass through unchanged. Delegate-only
   * — no new persistence logic introduced.
   */
  async createBroadcast(
    workspaceId: string,
    args?: {
      name?: string;
      messageTemplate?: string;
      scheduledAt?: string;
      aiStrategy?: string;
      parentId?: string;
      filters?: Prisma.InputJsonValue;
      idempotencyKey?: string;
    },
  ) {
    const name = typeof args?.name === 'string' ? args.name : '';
    if (!name) {
      throw new Error('CampaignsService.createBroadcast: args.name is required');
    }
    const { name: _omit, ...rest } = args ?? {};
    return this.create(workspaceId, { name, ...rest });
  }

  /** Find one. */
  async findOne(workspaceId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, workspaceId },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  /** Launch. */
  async launch(workspaceId: string, id: string, useSmartTime = false) {
    const campaign = await this.findOne(workspaceId, id);

    await this.ensureCampaignDeliveryReady(workspaceId);

    if (isCampaignAlreadyProcessed(campaign.status)) {
      throw new BadRequestException('Campaign already processed');
    }

    let delay = 0;
    if (useSmartTime) {
      const bestTime = await this.smartTime.getBestTime(workspaceId);
      delay = computeSmartTimeDelayMs(new Date(), bestTime.peakHour);
    }

    await this.prisma.campaign.updateMany({
      where: { id, workspaceId },
      data: {
        status: 'SCHEDULED',
        ...((delay > 0
          ? { scheduledAt: new Date(Date.now() + delay) }
          : {}) as Prisma.CampaignUpdateManyMutationInput),
      },
    });

    await this.campaignQueue.add(
      'process-campaign',
      {
        campaignId: id,
        workspaceId,
      },
      { delay, jobId: `process-campaign:${id}` },
    ); // BullMQ delay + deduplication via jobId

    await this.audit.log({
      workspaceId,
      action: 'LAUNCH_CAMPAIGN',
      resource: 'Campaign',
      resourceId: id,
      details: {
        name: campaign.name,
        smartTime: useSmartTime,
        delayHours: delay / 3600000,
      },
    });

    return {
      message: 'Campaign launched successfully',
      campaignId: id,
      scheduledAt: delay > 0 ? new Date(Date.now() + delay) : 'NOW',
    };
  }

  /**
   * Resolver-shaped canonical alias for the capability registry.
   *
   * `KloelDomainServiceResolver` invokes capabilities with the
   * `(workspaceId, args)` signature; this thin shim unpacks the campaign id
   * from the tool args and delegates to {@link launch} without duplicating any
   * launch logic. Used by the `whatsapp.send_campaign` / `email.send_campaign`
   * capabilities.
   *
   * @param workspaceId owning workspace (isolation boundary)
   * @param args        tool arguments: `{ campaignId | id, useSmartTime? }`
   */
  async launchTool(workspaceId: string, args: Record<string, unknown>) {
    const rawCampaignId = args.campaignId ?? args.id;
    const campaignId = (
      typeof rawCampaignId === 'string' || typeof rawCampaignId === 'number'
        ? String(rawCampaignId)
        : ''
    ).trim();
    if (!campaignId) {
      return { success: false, error: 'campaign_id_required' };
    }
    const useSmartTime = args.useSmartTime === true;
    const result = await this.launch(workspaceId, campaignId, useSmartTime);
    return { success: true, ...result };
  }

  /** Process a campaign job from the BullMQ queue */
  async processCampaignJob(job: { data: { campaignId: string; workspaceId: string } }) {
    const { campaignId, workspaceId } = job.data;
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
    });
    if (!campaign) {
      this.logger.warn(`Campaign ${campaignId} not found, skipping job`);
      return;
    }

    await this.prisma.campaign.updateMany({
      where: { id: campaignId, workspaceId },
      data: { status: 'RUNNING' },
    });

    // Resolve audience from campaign filters
    const filters = (campaign.filters as { tags?: string[] } | null) || {};
    const contactWhere: Record<string, unknown> = { workspaceId, optIn: true };
    if (filters.tags?.length) {
      contactWhere.tags = { some: { name: { in: filters.tags } } };
    }
    const contacts = await this.prisma.contact.findMany({
      where: { workspaceId, ...contactWhere },
      select: { id: true, name: true, email: true, phone: true },
      take: 10000,
    });

    let sent = 0;
    let failed = 0;
    const delivery = await this.resolveCampaignDelivery(workspaceId);
    const EmailServiceClass = (await import('../auth/email.service')).EmailService;
    const emailService = new EmailServiceClass();

    await forEachSequential(contacts, async (contact) => {
      try {
        if (delivery.emailReady && contact.email) {
          const bodyHtml = (campaign.messageTemplate || '').replace(
            NAME_RE,
            contact.name || 'Cliente',
          );
          const footerHtml = buildUnsubscribeFooterHtml({
            email: contact.email,
            workspaceId,
            campaignId,
          });
          const htmlWithUnsub = bodyHtml + footerHtml;
          const listUnsubscribe = buildListUnsubscribeHeader({
            email: contact.email,
            workspaceId,
            campaignId,
          });
          const delivered = await emailService.sendEmail({
            to: contact.email,
            subject: campaign.name,
            html: htmlWithUnsub,
            headers: {
              'List-Unsubscribe': listUnsubscribe,
              'List-Unsubscribe-Post': `List-Unsubscribe=One-Click`,
            },
          });
          if (!delivered) {
            failed += 1;
            return;
          }
          sent += 1;
          return;
        }

        if (
          delivery.whatsappReady &&
          contact.phone &&
          (this.metaWhatsApp || this.whatsappDispatcher)
        ) {
          const bodyText = (campaign.messageTemplate || '').replace(
            NAME_RE,
            contact.name || 'Cliente',
          );
          const delivered = await this.sendCampaignWhatsApp(workspaceId, contact.phone, bodyText);
          if (!delivered) {
            failed += 1;
            return;
          }
          sent += 1;
          return;
        }

        this.logger.warn(
          `Campaign ${campaign.name}: no channel available for ${contact.name || contact.id}`,
        );
        failed += 1;
      } catch (e: unknown) {
        void this.opsAlert?.alertOnCriticalError(e, 'CampaignsService.processCampaignJob');
        this.logger.error(`Campaign send failed for contact ${contact.id}: ${String(e)}`);
        failed += 1;
      }
    });

    await this.prisma.campaign.updateMany({
      where: { id: campaignId, workspaceId },
      data: {
        status: 'COMPLETED',
        stats: { sent, delivered: sent, read: 0, failed },
      },
    });

    this.campaignEmitter.emitAudienceReached({
      workspaceId,
      campaignId,
      metric: 'sent',
      value: sent,
    });

    this.logger.log(
      `Campaign ${campaign.name} (${campaignId}) completed — sent: ${sent}, failed: ${failed}`,
    );
  }

  async getDeliveryReadiness(workspaceId: string): Promise<{
    emailReady: boolean;
    whatsappReady: boolean;
    ready: boolean;
    missing: string[];
    message: string | null;
  }> {
    const delivery = await this.resolveCampaignDelivery(workspaceId);
    const gap = buildCampaignDeliveryGap(delivery);
    return {
      ...delivery,
      ready: gap === null,
      missing: gap?.missing || [],
      message: gap?.message || null,
    };
  }

  private async ensureCampaignDeliveryReady(workspaceId: string): Promise<void> {
    const readiness = await this.getDeliveryReadiness(workspaceId);
    if (!readiness.ready) {
      throw new BadRequestException(readiness.message || 'Campanha sem canal de entrega pronto');
    }
  }

  private async resolveCampaignDelivery(workspaceId: string): Promise<{
    emailReady: boolean;
    whatsappReady: boolean;
  }> {
    const [ws, metaConnection] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      }),
      this.prisma.metaConnection.findFirst({
        where: {
          workspaceId,
          channel: 'whatsapp',
        },
        select: { whatsappPhoneNumberId: true, status: true, tokenExpiresAt: true },
      }),
    ]);

    return computeCampaignDeliveryReadiness({
      providerSettings: (ws?.providerSettings ?? null) as Parameters<
        typeof computeCampaignDeliveryReadiness
      >[0]['providerSettings'],
      metaConnection,
      metaWhatsAppAvailable: Boolean(this.metaWhatsApp),
      emailProviderAvailable: Boolean(
        process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY || process.env.SMTP_HOST,
      ),
      now: new Date(),
    });
  }

  /**
   * Cria N variantes de uma campanha (Darwin). Usa IA para mutar copy.
   */
  async createVariants(
    workspaceId: string,
    id: string,
    variants = 3,
  ): Promise<{ created: number; variantIds: string[] }> {
    const base = await this.findOne(workspaceId, id);
    if (!base) {
      throw new NotFoundException('Campaign not found');
    }
    const variantIds: string[] = [];

    await forEachSequential(
      Array.from({ length: Math.max(1, Math.min(variants, 10)) }),
      async (_, i) => {
        const mutatedMessage = await this.mutateCopy(base.messageTemplate, i, workspaceId, base.id);
        const variant = await this.prisma.campaign.create({
          data: {
            name: `${base.name} - Var ${i + 1}`,
            status: 'DRAFT',
            messageTemplate: mutatedMessage,
            filters:
              base.filters === null
                ? Prisma.JsonNull
                : (base.filters as Prisma.InputJsonValue),
            stats: { sent: 0, replied: 0 },
            aiStrategy: base.aiStrategy,
            parentId: base.id,
            workspaceId,
          },
        });
        variantIds.push(variant.id);
      },
    );

    return { created: variantIds.length, variantIds };
  }

  /**
   * Avalia variantes e promove a melhor copy para a campanha pai.
   */
  async evaluateDarwin(workspaceId: string, id: string) {
    const parent = await this.findOne(workspaceId, id);
    const variants = await this.prisma.campaign.findMany({
      take: 20,
      where: { parentId: id, workspaceId },
      select: {
        id: true,
        name: true,
        stats: true,
        status: true,
        parentId: true,
        messageTemplate: true,
        aiStrategy: true,
      },
    });
    if (!variants.length) {
      throw new BadRequestException('No variants to evaluate');
    }

    let best = {
      id: parent.id,
      messageTemplate: parent.messageTemplate,
      aiStrategy: parent.aiStrategy,
      stats: parent.stats,
    };
    let bestScore = scoreCampaignRow(parent);
    for (const v of variants) {
      const score = scoreCampaignRow(v);
      if (score > bestScore) {
        best = v;
        bestScore = score;
      }
    }

    // Promove mensagem vencedora para pai e pausa perdedores
    const bestMessageTemplate =
      best.messageTemplate != null ? String(best.messageTemplate) : undefined;
    const bestAiStrategy = best.aiStrategy != null ? String(best.aiStrategy) : undefined;
    const bestId = best.id != null ? String(best.id) : undefined;

    await this.prisma.campaign.updateMany({
      where: { id: parent.id, workspaceId },
      data: {
        ...(bestMessageTemplate ? { messageTemplate: bestMessageTemplate } : {}),
        ...(bestAiStrategy ? { aiStrategy: bestAiStrategy } : {}),
      },
    });
    await this.prisma.campaign.updateMany({
      where: { workspaceId, parentId: parent.id, ...(bestId ? { NOT: { id: bestId } } : {}) },
      data: { status: 'PAUSED' },
    });

    if (bestId && bestId !== parent.id) {
      this.campaignEmitter.emitCreativeSwapped({
        workspaceId,
        campaignId: parent.id,
        fromCreativeId: parent.id,
        toCreativeId: bestId,
        swappedBy: 'darwin',
      });
    }

    return {
      winner: bestId,
      score: bestScore,
      promotedTo: parent.id,
    };
  }

  /**
   * Gera mutação simples da copy via OpenAI; fallback embaralha CTA.
   */
  private async mutateCopy(
    base: string,
    idx: number,
    workspaceId?: string,
    campaignId?: string,
  ): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || !base) {
      return buildVariantFallbackCopy(base, idx);
    }
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey });
    const prompt = `
Reescreva a mensagem abaixo para WhatsApp, mantendo intenção mas testando variação ${
      idx + 1
    } de copy. Seja conciso, amigável e inclua CTA direto.
Mensagem original: """${base}"""
Retorne apenas a nova mensagem.`;
    const model = resolveBackendOpenAIModel('writer');
    // Per WAVE3_LLM_PROMPT_AUDIT critical gap #7: cap output + log decision.
    const completion = await chatCompletionWithRetry(client, {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400, // single WhatsApp message variant
    });
    const variant = completion.choices[0]?.message?.content?.trim() || base;
    const validated = validateVariantCopy(base, variant);
    // Structured decision log (no PII; just lengths + token usage).
    this.logger.log('Campaign copy variant generated', {
      context: 'CampaignsService.mutateCopy',
      ...(workspaceId ? { workspaceId } : {}),
      ...(campaignId ? { campaignId } : {}),
      idx,
      model,
      baseLength: base.length,
      variantLength: variant.length,
      validatedLength: validated.length,
      validatedFallback: validated !== variant,
      tokensTotal: completion?.usage?.total_tokens ?? null,
    });
    return validated;
  }

  /** Pause. */
  async pause(workspaceId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, workspaceId },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    if (!isCampaignPausable(campaign.status)) {
      throw new BadRequestException('Only running or scheduled campaigns can be paused');
    }
    await this.prisma.campaign.updateMany({
      where: { id, workspaceId },
      data: { status: 'PAUSED' },
    });
    return this.findOne(workspaceId, id);
  }

  /** Get stats. */
  async getStats(workspaceId: string, id: string) {
    return this.findOne(workspaceId, id);
  }
}
