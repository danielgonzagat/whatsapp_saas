import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { SmartTimeService } from '../analytics/smart-time/smart-time.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { forEachSequential } from '../common/async-sequence';
import { createRedisClient } from '../common/redis/redis.util';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Money Machine and Next-Best-Action helpers extracted from AutopilotCycleService.
 * Keeps AutopilotCycleService under 400 lines.
 */
@Injectable()
export class AutopilotCycleMoneyService {
  private readonly logger = new Logger(AutopilotCycleMoneyService.name);
  private readonly campaignQueue: Queue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly smartTime: SmartTimeService,
    private readonly planLimits: PlanLimitsService,
  ) {
    const connection = createRedisClient();
    this.campaignQueue = new Queue('campaign-jobs', { connection });
  }

  private isLegacyExecutionEnabled() {
    return process.env.ENABLE_LEGACY_BACKEND_AUTOPILOT === 'true';
  }

  async computeSmartDelay(workspaceId: string, useSmartTime: boolean) {
    if (!useSmartTime) {
      return 0;
    }
    const bestTime = await this.smartTime.getBestTime(workspaceId);
    const now = new Date();
    const currentHour = now.getHours();
    const targetHour = bestTime.bestHour;
    let hoursToAdd = targetHour - currentHour;
    if (hoursToAdd <= 0) {
      hoursToAdd += 24;
    }
    return hoursToAdd * 60 * 60 * 1000;
  }

  /**
   * Máquina de Dinheiro: escaneia conversas abertas e cria 3 campanhas prontas.
   */
  async moneyMachine(workspaceId: string, topN = 200, autoSend = false, useSmartTime = false) {
    if (!this.isLegacyExecutionEnabled()) {
      this.logger.warn(
        `[Autopilot] Legacy backend money machine disabled for workspace ${workspaceId}; worker runtime is the single execution source.`,
      );
      return {
        created: [],
        segments: { hot: 0, warm: 0, cold: 0 },
        autoSend,
        scheduledAt: null,
        status: 'disabled',
        reason: 'legacy_backend_autopilot_disabled',
      };
    }

    const convs = await this.prisma.conversation.findMany({
      where: { workspaceId, status: 'OPEN' },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(Math.max(topN, 50), 500),
      include: {
        contact: { select: { phone: true, name: true } },
        messages: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    });

    const hot: string[] = [];
    const warm: string[] = [];
    const cold: string[] = [];

    for (const conv of convs) {
      const last = conv.messages[0];
      if (!last) {
        continue;
      }
      const ageH = (Date.now() - last.createdAt.getTime()) / 3600000;
      const text = (last.content || '').toLowerCase();
      const isBuying =
        text.includes('preco') ||
        text.includes('preço') ||
        text.includes('valor') ||
        text.includes('quanto') ||
        text.includes('pix') ||
        text.includes('boleto');
      if (isBuying) {
        hot.push(conv.contact.phone);
      } else if (ageH > 72) {
        cold.push(conv.contact.phone);
      } else {
        warm.push(conv.contact.phone);
      }
    }

    const makeMsg = (title: string, body: string) => `[#${title}] ${body}`;

    const reactivation = await this.prisma.campaign.create({
      data: {
        name: 'Reativação Automática',
        status: autoSend ? 'SCHEDULED' : 'DRAFT',
        messageTemplate: makeMsg(
          'REACT',
          'Voltei aqui porque reservei uma condição especial pra você. Quer que eu envie agora?',
        ),
        filters: { phones: [...warm, ...cold] },
        stats: { sent: 0, replied: 0 },
        workspaceId,
        aiStrategy: 'SOFT',
      },
    });

    const secret = await this.prisma.campaign.create({
      data: {
        name: 'Oferta Secreta',
        status: autoSend ? 'SCHEDULED' : 'DRAFT',
        messageTemplate: makeMsg(
          'SECRET',
          'Consegui um bônus secreto só hoje. Se eu te mandar agora, você topa avaliar? Responda SIM.',
        ),
        filters: { phones: hot },
        stats: { sent: 0, replied: 0 },
        workspaceId,
        aiStrategy: 'AGGRESSIVE',
      },
    });

    const closing = await this.prisma.campaign.create({
      data: {
        name: 'Sequência de Fechamento',
        status: autoSend ? 'SCHEDULED' : 'DRAFT',
        messageTemplate: makeMsg(
          'CLOSE',
          'Último passo: posso finalizar pra você agora com tudo configurado? Responda "fechar" que eu te mando o link.',
        ),
        filters: { phones: hot },
        stats: { sent: 0, replied: 0 },
        workspaceId,
        aiStrategy: 'BALANCED',
      },
    });

    const createdIds = [reactivation.id, secret.id, closing.id];
    let scheduledAt: Date | null = null;

    if (autoSend) {
      const delay = await this.computeSmartDelay(workspaceId, useSmartTime);
      scheduledAt = delay > 0 ? new Date(Date.now() + delay) : new Date();
      await forEachSequential(createdIds, async (id) => {
        await this.campaignQueue.add(
          'process-campaign',
          { campaignId: id, workspaceId },
          { delay, jobId: `process-campaign:${id}` },
        );
      });

      await this.prisma.campaign.updateMany({
        where: { workspaceId, id: { in: createdIds } },
        data: {
          status: 'SCHEDULED',
          scheduledAt: delay > 0 ? new Date(Date.now() + delay) : null,
        },
      });

      await this.prisma.auditLog.createMany({
        data: createdIds.map((id) => ({
          workspaceId,
          action: 'MONEY_MACHINE_LAUNCH',
          resource: 'Campaign',
          resourceId: id,
          details: { autoSend: true, useSmartTime, delayMs: delay },
        })),
      });
    }

    return {
      created: createdIds,
      segments: {
        hot: hot.length,
        warm: warm.length,
        cold: cold.length,
      },
      autoSend,
      scheduledAt,
    };
  }

  /**
   * Next-Best-Action simples para um contato específico (heurística leve).
   */
  async nextBestAction(workspaceId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: { id: true, phone: true, name: true },
    });
    if (!contact) {
      throw new Error('Contato não encontrado');
    }

    const conv = await this.prisma.conversation.findFirst({
      where: { workspaceId, contactId },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 3 },
      },
    });

    const last = conv?.messages?.[0];
    const lastText = (last?.content || '').toLowerCase();
    const ageMinutes = last
      ? Math.round((Date.now() - new Date(last.createdAt).getTime()) / 60000)
      : null;

    const hasKeyword = (...keys: string[]) => keys.some((k) => lastText.includes(k));

    let action = 'FOLLOW_UP_SOFT';
    let reason = 'keep_warm';
    let message =
      'Oi! Só checando se posso te ajudar em algo ou se prefere que eu volte mais tarde.';

    if (
      last &&
      last.direction === 'INBOUND' &&
      hasKeyword('preço', 'valor', 'quanto', 'custa', 'pix', 'boleto')
    ) {
      action = 'GHOST_CLOSER';
      reason = 'buying_signal';
      message =
        'Consigo te garantir a condição especial agora. Quer que eu finalize e te envie o link?';
    } else if (last && last.direction === 'OUTBOUND' && ageMinutes && ageMinutes > 720) {
      action = 'REACTIVATE';
      reason = 'long_silence';
      message =
        'Voltei com uma novidade só pra você: preparei uma condição especial se retomarmos hoje. Quer ver?';
    } else if (!last) {
      action = 'INTRO';
      reason = 'no_history';
      message =
        'Olá! Sou seu assistente. Posso te mandar uma condição especial ou entender melhor sua necessidade?';
    }

    return {
      workspaceId,
      contactId,
      contact: contact.name || contact.phone,
      action,
      reason,
      recommendedMessage: message,
      lastMessageAt: last?.createdAt || null,
    };
  }
}
