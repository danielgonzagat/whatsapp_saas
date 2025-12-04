import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { AuditService } from '../audit/audit.service';
import { SmartTimeService } from '../analytics/smart-time/smart-time.service';

@Injectable()
export class CampaignsService {
  private campaignQueue: Queue;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private smartTime: SmartTimeService,
  ) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is required');
    }
    const connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });

    this.campaignQueue = new Queue('campaign-jobs', { connection });
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
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(workspaceId: string, id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
    });

    if (!campaign || campaign.workspaceId !== workspaceId) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  async launch(workspaceId: string, id: string, useSmartTime = false) {
    const campaign = await this.findOne(workspaceId, id);

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

    await this.prisma.campaign.update({
      where: { id },
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
      { delay },
    ); // BullMQ delay

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
      where: { parentId: id },
    });
    if (!variants.length) {
      throw new BadRequestException('No variants to evaluate');
    }

    const all = [parent, ...variants];
    let best = parent;
    let bestScore = this.scoreCampaign(parent);
    for (const v of variants) {
      const score = this.scoreCampaign(v);
      if (score > bestScore) {
        best = v;
        bestScore = score;
      }
    }

    // Promove mensagem vencedora para pai e pausa perdedores
    await this.prisma.campaign.update({
      where: { id: parent.id },
      data: {
        messageTemplate: best.messageTemplate,
        aiStrategy: best.aiStrategy,
      },
    });
    await this.prisma.campaign.updateMany({
      where: { parentId: parent.id, NOT: { id: best.id } },
      data: { status: 'PAUSED' },
    });

    return {
      winner: best.id,
      score: bestScore,
      promotedTo: parent.id,
    };
  }

  private scoreCampaign(c: any): number {
    const stats = (c?.stats as any) || {};
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
Reescreva a mensagem abaixo para WhatsApp, mantendo intenção mas testando variação ${idx +
      1} de copy. Seja conciso, amigável e inclua CTA direto.
Mensagem original: """${base}"""
Retorne apenas a nova mensagem.`;
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });
    return completion.choices[0]?.message?.content || base;
  }

  async getStats(workspaceId: string, id: string) {
    return this.findOne(workspaceId, id);
  }
}
