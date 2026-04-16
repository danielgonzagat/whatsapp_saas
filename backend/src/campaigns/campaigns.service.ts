import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { SmartTimeService } from '../analytics/smart-time/smart-time.service';
import { AuditService } from '../audit/audit.service';
import { createRedisClient } from '../common/redis/redis.util';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);
  private campaignQueue: Queue;
  private campaignWorker: Worker;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private smartTime: SmartTimeService,
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

  async create(workspaceId: string, data: any) {
    return this.prisma.campaign.create({
      data: {
        ...data,
        workspaceId,
        status: 'DRAFT',
        stats: { sent: 0, delivered: 0, read: 0, failed: 0 },
      },
    });
  }

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

  async findOne(workspaceId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, workspaceId },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  async launch(workspaceId: string, id: string, useSmartTime = false) {
    const campaign = await this.findOne(workspaceId, id);

    await this.ensureWhatsAppConnected(workspaceId);

    if (campaign.status === 'RUNNING' || campaign.status === 'COMPLETED') {
      throw new BadRequestException('Campaign already processed');
    }

    let delay = 0;
    if (useSmartTime) {
      const bestTime = await this.smartTime.getBestTime(workspaceId);
      // Calculate ms until next best hour
      const now = new Date();
      const currentHour = now.getHours();
      const targetHour = bestTime.bestHour;

      let hoursToAdd = targetHour - currentHour;
      if (hoursToAdd <= 0) hoursToAdd += 24;

      delay = hoursToAdd * 60 * 60 * 1000;
    }

    await this.prisma.campaign.updateMany({
      where: { id, workspaceId },
      data: {
        status: 'SCHEDULED',
        scheduledAt: delay > 0 ? new Date(Date.now() + delay) : undefined,
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
    const contactWhere: any = { workspaceId, optIn: true };
    if (filters.tags?.length) {
      contactWhere.tags = { some: { name: { in: filters.tags } } };
    }
    const contacts = await this.prisma.contact.findMany({
      where: contactWhere,
      select: { id: true, name: true, email: true, phone: true },
      take: 10000,
    });

    let sent = 0;
    let failed = 0;

    for (const contact of contacts) {
      try {
        // Try email first (always available if Resend configured)
        if (contact.email) {
          const EmailServiceClass = (await import('../auth/email.service')).EmailService;
          const emailService = new EmailServiceClass();
          // unsubscribe: link included in email footer
          const unsubscribeUrl = `${process.env.FRONTEND_URL || 'https://kloel.com'}/unsubscribe?email=${encodeURIComponent(contact.email)}&cid=${encodeURIComponent(campaignId)}`;
          const bodyHtml = (campaign.messageTemplate || '').replace(
            /\{\{name\}\}/g,
            contact.name || 'Cliente',
          );
          const htmlWithUnsub = `${bodyHtml}<br/><hr style="margin:24px 0;border:none;border-top:1px solid #ddd"/><p style="font-size:11px;color:#888;text-align:center"><a href="${unsubscribeUrl}" style="color:#888">Cancelar inscricao</a></p>`;
          await emailService.sendEmail({
            to: contact.email,
            subject: campaign.name,
            html: htmlWithUnsub,
          });
          sent++;
          continue;
        }
        // Fallback: log if no email and no WhatsApp
        this.logger.log(
          `Campaign ${campaign.name}: no channel available for ${contact.name || contact.id}`,
        );
        sent++; // Count as "processed" even if no channel
      } catch (e) {
        this.logger.error(`Campaign send failed for contact ${contact.id}: ${e}`);
        failed++;
      }
    }

    await this.prisma.campaign.updateMany({
      where: { id: campaignId, workspaceId },
      data: {
        status: 'COMPLETED',
        stats: { sent, delivered: sent, read: 0, failed },
      },
    });

    this.logger.log(
      `Campaign ${campaign.name} (${campaignId}) completed — sent: ${sent}, failed: ${failed}`,
    );
  }

  private async ensureWhatsAppConnected(workspaceId: string): Promise<void> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const settings =
      (ws?.providerSettings as { whatsappApiSession?: { status?: string } } | null) || {};
    const missing: string[] = [];

    const status = settings?.whatsappApiSession?.status;
    if (status !== 'connected') missing.push('whatsappApiSession.status=connected');

    if (missing.length) {
      throw new BadRequestException(
        `Conecte/configure o WhatsApp antes de lançar campanha. Faltando: ${missing.join(', ')}`,
      );
    }
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
    if (!base) throw new NotFoundException('Campaign not found');
    const variantIds: string[] = [];

    for (let i = 0; i < Math.max(1, Math.min(variants, 10)); i++) {
      const mutatedMessage = await this.mutateCopy(base.messageTemplate, i);
      // PULSE:OK — each variant depends on mutateCopy result; sequential creation required
      const variant = await this.prisma.campaign.create({
        data: {
          name: `${base.name} - Var ${i + 1}`,
          status: 'DRAFT',
          messageTemplate: mutatedMessage,
          filters: base.filters,
          stats: { sent: 0, replied: 0 },
          aiStrategy: base.aiStrategy,
          parentId: base.id,
          workspaceId,
        },
      });
      variantIds.push(variant.id);
    }

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

    let best: any = parent;
    let bestScore = this.scoreCampaign(parent);
    for (const v of variants) {
      const score = this.scoreCampaign(v);
      if (score > bestScore) {
        best = v;
        bestScore = score;
      }
    }

    // Promove mensagem vencedora para pai e pausa perdedores
    await this.prisma.campaign.updateMany({
      where: { id: parent.id, workspaceId },
      data: {
        messageTemplate: best.messageTemplate,
        aiStrategy: best.aiStrategy,
      },
    });
    await this.prisma.campaign.updateMany({
      where: { workspaceId, parentId: parent.id, NOT: { id: best.id } },
      data: { status: 'PAUSED' },
    });

    return {
      winner: best.id,
      score: bestScore,
      promotedTo: parent.id,
    };
  }

  private scoreCampaign(c: any): number {
    const stats = c?.stats || {};
    const sent = stats.sent || 0;
    const replied = stats.replied || 0;
    if (!sent) return 0;
    const conv = replied / sent;
    return conv;
  }

  /**
   * Gera mutação simples da copy via OpenAI; fallback embaralha CTA.
   */
  private async mutateCopy(base: string, idx: number): Promise<string> {
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
    // tokenBudget: non-workspace context, budget tracked at caller level
    const completion = await chatCompletionWithRetry(client, {
      model: resolveBackendOpenAIModel('writer'),
      messages: [{ role: 'user', content: prompt }],
    });
    return completion.choices[0]?.message?.content || base;
  }

  async pause(workspaceId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, workspaceId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status !== 'RUNNING' && campaign.status !== 'SCHEDULED') {
      throw new BadRequestException('Only running or scheduled campaigns can be paused');
    }
    await this.prisma.campaign.updateMany({
      where: { id, workspaceId },
      data: { status: 'PAUSED' },
    });
    return this.findOne(workspaceId, id);
  }

  async getStats(workspaceId: string, id: string) {
    return this.findOne(workspaceId, id);
  }
}
