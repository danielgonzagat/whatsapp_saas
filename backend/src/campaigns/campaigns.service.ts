import { Prisma } from '@prisma/client';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { SmartTimeService } from '../analytics/smart-time/smart-time.service';
import { AuditService } from '../audit/audit.service';
import { forEachSequential } from '../common/async-sequence';
import { createRedisClient } from '../common/redis/redis.util';
import {
  buildListUnsubscribeHeader,
  buildUnsubscribeFooterHtml,
} from '../common/utils/unsubscribe-footer.util';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { CampaignEventEmitterService } from '../kloel/campaign-emitter/campaign-event-emitter.service';
import { MetaWhatsAppService } from '../meta/meta-whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';

import { NAME_RE } from '../common/regex';

/** Campaigns service. */
@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);
  private campaignQueue: Queue;
  private campaignWorker: Worker;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private smartTime: SmartTimeService,
    private campaignEmitter: CampaignEventEmitterService,
    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() private readonly metaWhatsApp?: MetaWhatsAppService,
  ) {
    const connection = createRedisClient();

    this.campaignQueue = new Queue('campaign-jobs', { connection });

    // Worker that processes campaign jobs from the queue
    this.campaignWorker = new Worker(
      'campaign-jobs',
      async (job) => {
        if (job.name === 'process-campaign') {
          await this.processCampaignJob(job);
        }
      },
      { connection: createRedisClient() },
    );

    this.campaignWorker.on('failed', (job, err) => {
      this.logger.error(`Campaign job ${job?.id} failed: ${err.message}`);
    });
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
        stats: { sent: 0, delivered: 0, read: 0, failed: 0 },
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

    if (campaign.status === 'RUNNING' || campaign.status === 'COMPLETED') {
      throw new BadRequestException('Campaign already processed');
    }

    let delay = 0;
    if (useSmartTime) {
      const bestTime = await this.smartTime.getBestTime(workspaceId);
      // Calculate ms until next best hour
      const now = new Date();
      const currentHour = now.getHours();
      const targetHour = bestTime.peakHour;

      let hoursToAdd = targetHour - currentHour;
      if (hoursToAdd <= 0) {
        hoursToAdd += 24;
      }

      delay = hoursToAdd * 60 * 60 * 1000;
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

        if (delivery.whatsappReady && contact.phone && this.metaWhatsApp) {
          const bodyText = (campaign.messageTemplate || '').replace(
            NAME_RE,
            contact.name || 'Cliente',
          );
          const delivered = await this.metaWhatsApp.sendTextMessage(
            workspaceId,
            contact.phone,
            bodyText,
          );
          if (!delivered.success) {
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

  private async ensureCampaignDeliveryReady(workspaceId: string): Promise<void> {
    const delivery = await this.resolveCampaignDelivery(workspaceId);
    const missing: string[] = [];

    if (!delivery.emailReady && !delivery.whatsappReady) {
      if (!delivery.emailReady) {
        missing.push('email.enabled=true com provider configurado');
      }
      if (!delivery.whatsappReady) {
        missing.push('whatsappApiSession.status=connected');
      }
    }

    if (missing.length) {
      throw new BadRequestException(
        `Conecte um canal de entrega antes de lançar campanha. Faltando: ${missing.join(', ')}`,
      );
    }
  }

  private async resolveCampaignDelivery(workspaceId: string): Promise<{
    emailReady: boolean;
    whatsappReady: boolean;
  }> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const settings =
      (ws?.providerSettings as {
        email?: { enabled?: boolean };
        whatsappApiSession?: { status?: string };
      } | null) || {};

    const emailProviderReady = Boolean(
      process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY || process.env.SMTP_HOST,
    );
    const emailReady = Boolean(settings.email?.enabled && emailProviderReady);
    const whatsappReady = Boolean(
      this.metaWhatsApp && settings?.whatsappApiSession?.status === 'connected',
    );

    return { emailReady, whatsappReady };
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
            filters: base.filters as Prisma.InputJsonValue,
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
    let bestScore = this.scoreCampaign(parent);
    for (const v of variants) {
      const score = this.scoreCampaign(v);
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

  private scoreCampaign(c: Record<string, unknown>): number {
    const stats = (c?.stats || {}) as Record<string, number>;
    const sent = stats.sent || 0;
    const replied = stats.replied || 0;
    if (!sent) {
      return 0;
    }
    const conv = replied / sent;
    return conv;
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
      return `${base || ''} [variante ${idx + 1} com CTA: responda SIM agora]`;
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
    // Output validation: refuse outputs that grew >3x original or come back empty —
    // model hallucinated a long block instead of a single message.
    const validated =
      variant.length > 0 && variant.length <= Math.max(base.length * 3, 280) ? variant : base;
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
    if (campaign.status !== 'RUNNING' && campaign.status !== 'SCHEDULED') {
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
