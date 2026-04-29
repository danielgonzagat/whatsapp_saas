import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createRedisClient } from '../common/redis/redis.util';
import { pollUntil } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueJobId } from '../queue/job-id.util';
import { autopilotQueue } from '../queue/queue';
import { AutopilotOpsConversionService } from './autopilot-ops-conversion.service';
import { OpsAlertService } from '../observability/ops-alert.service';

const D_RE_OPS = /\D/g;

/** Autopilot operational methods: pipeline status, smoke test, enqueue. Retry/conversion delegated to AutopilotOpsConversionService. */
@Injectable()
export class AutopilotOpsService {
  private readonly logger = new Logger(AutopilotOpsService.name);
  private readonly redisClient: ReturnType<typeof createRedisClient>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversion: AutopilotOpsConversionService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {
    this.redisClient = createRedisClient();
  }

  private normalizePhone(phone?: string) {
    return String(phone || '').replace(D_RE_OPS, '');
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  }

  private readOptionalText(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  private async ensureNotSuspended(workspaceId: string) {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const settings = (ws?.providerSettings as Record<string, unknown>) || {};
    const suspended = (settings?.billingSuspended ?? false) === true;
    if (suspended) {
      throw new ForbiddenException('Autopilot suspenso: regularize cobrança para reativar.');
    }
    const sub = await this.prisma.subscription.findUnique({
      where: { workspaceId },
      select: { status: true },
    });
    if (sub && ['CANCELED', 'PAST_DUE'].includes(sub.status)) {
      throw new ForbiddenException(
        `Assinatura ${sub.status}. Regularize o pagamento para ativar o Autopilot.`,
      );
    }
  }

  /** Get pipeline status. */
  async getPipelineStatus(workspaceId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, providerSettings: true },
    });

    const [
      inboundReceived,
      outboundSent,
      autopilotExecuted,
      autopilotSkipped,
      autopilotFailed,
      lastInbound,
      lastOutbound,
      lastAutopilotEvent,
      queueCounts,
      recentFailures,
    ] = await Promise.all([
      this.prisma.message.count({
        where: { workspaceId, direction: 'INBOUND', createdAt: { gte: since } },
      }),
      this.prisma.message.count({
        where: { workspaceId, direction: 'OUTBOUND', createdAt: { gte: since } },
      }),
      this.prisma.autopilotEvent.count({
        where: { workspaceId, status: 'executed', createdAt: { gte: since } },
      }),
      this.prisma.autopilotEvent.count({
        where: { workspaceId, status: 'skipped', createdAt: { gte: since } },
      }),
      this.prisma.autopilotEvent.count({
        where: { workspaceId, status: { in: ['error', 'failed'] }, createdAt: { gte: since } },
      }),
      this.prisma.message.findFirst({
        where: { workspaceId, direction: 'INBOUND' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, content: true, createdAt: true, contactId: true },
      }),
      this.prisma.message.findFirst({
        where: { workspaceId, direction: 'OUTBOUND' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, content: true, createdAt: true, contactId: true },
      }),
      this.prisma.autopilotEvent.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      }),
      autopilotQueue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
      this.prisma.autopilotEvent.findMany({
        where: { workspaceId, status: { in: ['error', 'failed'] } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { createdAt: true, contactId: true, action: true, reason: true, status: true },
      }),
    ]);

    const settings = this.readRecord(workspace?.providerSettings);
    const autopilotSettings = this.readRecord(settings.autopilot);
    const sessionStatusRaw = this.readRecord(settings.whatsappApiSession).status;
    const sessionStatus = typeof sessionStatusRaw === 'string' ? sessionStatusRaw : 'unknown';

    return {
      workspaceId,
      workspaceName: workspace?.name || null,
      windowHours: 24,
      autonomy: {
        autopilotEnabled: autopilotSettings.enabled === true,
        whatsappStatus: sessionStatus,
        connected: ['connected', 'working'].includes(sessionStatus.toLowerCase()),
      },
      messages: {
        received: inboundReceived,
        responded: outboundSent,
        unansweredEstimate: Math.max(inboundReceived - outboundSent, 0),
        lastInbound,
        lastOutbound,
      },
      autopilot: {
        executed: autopilotExecuted,
        skipped: autopilotSkipped,
        failed: autopilotFailed,
        lastEvent: lastAutopilotEvent,
        recentFailures,
      },
      queue: queueCounts,
    };
  }

  /** Run smoke test. */
  async runSmokeTest(input: {
    workspaceId: string;
    phone?: string;
    message?: string;
    waitMs?: number;
    liveSend?: boolean;
  }) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { id: true, name: true, providerSettings: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace não encontrado para smoke test');
    }

    const phone =
      this.normalizePhone(input.phone) ||
      this.normalizePhone(process.env.AUTOPILOT_TEST_PHONE) ||
      '5511999999999';
    const message =
      String(input.message || '').trim() ||
      'Olá, quero testar se o Kloel está respondendo corretamente no WhatsApp.';
    const smokeTestId = randomUUID();
    const smokeKey = `autopilot:smoke:${smokeTestId}`;
    const waitMs = Math.min(Math.max(input.waitMs || 12000, 2000), 30000);
    const contact = await this.prisma.contact.upsert({
      where: { workspaceId_phone: { workspaceId: input.workspaceId, phone } },
      update: {},
      create: { workspaceId: input.workspaceId, phone, name: `Smoke Test ${phone}` },
      select: { id: true },
    });

    await this.redisClient.set(
      smokeKey,
      JSON.stringify({
        smokeTestId,
        status: 'queued',
        workspaceId: input.workspaceId,
        contactId: contact.id,
        phone,
        mode: input.liveSend ? 'live' : 'dry-run',
        queuedAt: new Date().toISOString(),
      }),
      'EX',
      300,
    );

    await autopilotQueue.add(
      'scan-contact',
      {
        workspaceId: input.workspaceId,
        contactId: contact.id,
        phone,
        messageContent: message,
        smokeTestId,
        smokeMode: input.liveSend ? 'live' : 'dry-run',
      },
      {
        jobId: buildQueueJobId('scan-contact', input.workspaceId, contact.id, 'smoke', smokeTestId),
        removeOnComplete: true,
      },
    );

    const result = await pollUntil<Record<string, unknown> | null>({
      timeoutMs: waitMs,
      intervalMs: 500,
      read: async () => {
        const current = await this.redisClient.get(smokeKey);
        if (!current) return null;
        try {
          return this.readRecord(JSON.parse(current));
        } catch {
          return null;
        }
      },
      stop: (current) =>
        current !== null &&
        ['completed', 'failed', 'skipped', 'disabled', 'billing_suspended'].includes(
          typeof current.status === 'string' ? current.status : '',
        ),
      sleep: (ms) => this.sleep(ms),
    });

    if (
      result &&
      ['completed', 'failed', 'skipped'].includes(
        typeof result.status === 'string' ? result.status : '',
      )
    ) {
      await this.redisClient.del(smokeKey).catch(() => {});
    }

    return {
      smokeTestId,
      workspaceId: input.workspaceId,
      workspaceName: workspace.name,
      queued: true,
      mode: input.liveSend ? 'live' : 'dry-run',
      phone,
      message,
      result: result || { status: 'queued' },
      queue: await autopilotQueue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
    };
  }

  /** Enfileira processamento do Autopilot no worker (escala horizontal). */
  async enqueueProcessing(input: {
    workspaceId: string;
    phone?: string;
    contactId?: string;
    message?: string;
    delayMs?: number;
  }) {
    await this.ensureNotSuspended(input.workspaceId);
    const { workspaceId, phone, contactId, message, delayMs } = input;
    if (!phone && !contactId) {
      throw new BadRequestException('phone ou contactId são obrigatórios');
    }
    await autopilotQueue.add(
      'scan-contact',
      { workspaceId, contactId, phone, messageContent: message || '' },
      {
        ...(delayMs && delayMs > 0 ? { delay: delayMs } : {}),
        ...(contactId || phone
          ? {
              jobId: buildQueueJobId('scan-contact', workspaceId, contactId || phone, randomUUID()),
            }
          : {}),
      },
    );
    return { queued: true };
  }

  /** Retry com guardas simples — delegated to AutopilotOpsConversionService. */
  async retryContact(workspaceId: string, contactId: string) {
    return this.conversion.retryContact(workspaceId, contactId);
  }

  /** Marca conversão manual/webhook — delegated to AutopilotOpsConversionService. */
  async markConversion(input: {
    workspaceId: string;
    contactId?: string;
    phone?: string;
    reason?: string;
    meta?: Record<string, unknown>;
  }) {
    return this.conversion.markConversion(input);
  }
}
