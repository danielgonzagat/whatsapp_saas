import { randomInt, randomUUID } from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { ForbiddenException, Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import Redis from 'ioredis';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { StructuredLogger } from '../logging/structured-logger';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { flowQueue } from '../queue/queue';
import { WorkspaceService } from '../workspaces/workspace.service';
import { INBOX_SERVICE } from '../inbox/inbox.token';
import type { IInboxService } from '../inbox/inbox.interface';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WorkerRuntimeService } from './worker-runtime.service';
import { WhatsappSessionService } from './whatsapp-session.service';
import type { ContactCustomFields } from '../contacts/contact-custom-fields.types';
import { WhatsAppEventEmitterService } from '../kloel/whatsapp-emitter/whatsapp-event-emitter.service';

const D_RE = /\D/g;

@Injectable()
export class WhatsappMessageDispatcherService {
  private readonly slog = new StructuredLogger('whatsapp-message-dispatcher');

  constructor(
    private readonly planLimits: PlanLimitsService,
    private readonly workspaces: WorkspaceService,
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    @Inject(forwardRef(() => INBOX_SERVICE)) private readonly inbox: IInboxService,
    private readonly workerRuntime: WorkerRuntimeService,
    private readonly sessionService: WhatsappSessionService,
    @InjectRedis() private readonly redis: Redis,
    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() private readonly whatsappEmitter?: WhatsAppEventEmitterService,
  ) {}

  private normalizeChatId(chatId: string): string {
    return String(chatId || '').includes('@') ? chatId : `${this.normalizeNumber(chatId)}@c.us`;
  }

  private normalizeNumber(num: string): string {
    return num.replace(D_RE, '');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  async sendMessage(
    ws: string,
    to: string,
    message: string,
    opts?: {
      mediaUrl?: string;
      mediaType?: 'image' | 'video' | 'audio' | 'document';
      caption?: string;
      externalId?: string;
      complianceMode?: 'reactive' | 'proactive';
      forceDirect?: boolean;
      quotedMessageId?: string;
    },
  ) {
    this.slog.info('send_message', { workspaceId: ws, to });
    await this.planLimits.ensureSubscriptionActive(ws);
    const w = await this.workspaces.getWorkspace(ws);
    const ew = this.workspaces.toEngineWorkspace(w);
    await this.ensureOptInAllowed(ws, to, opts?.complianceMode || 'proactive');
    const missing = this.sessionService.validateWorkspaceProvider(ew);
    if (missing.length) {
      return { error: true, message: `Configuração do provedor incompleta: ${missing.join(', ')}` };
    }
    const r = await this.sessionService.collectMessagingRuntimeIssues(ws, ew, {
      requireInboundWebhook: false,
    });
    if (r.issues.length) {
      return {
        error: true,
        message: `Runtime do WhatsApp indisponível: ${r.issues.join(', ')}`,
        diagnostics: r.diagnostics,
      };
    }
    if (opts?.forceDirect) {
      const dr = await this.sendDirectlyViaProvider(ws, to, message, opts);
      if (dr.ok) {
        await this.planLimits.trackMessageSend(ws);
      }
      return dr;
    }
    if (!(await this.workerRuntime.isAvailable())) {
      const dr = await this.sendDirectlyViaProvider(ws, to, message, opts);
      if (dr.ok) {
        await this.planLimits.trackMessageSend(ws);
      }
      return dr;
    }
    await flowQueue.add('send-message', {
      type: 'direct',
      workspaceId: ws,
      workspace: ew,
      to,
      message,
      user: to,
      mediaUrl: opts?.mediaUrl,
      mediaType: opts?.mediaType,
      caption: opts?.caption,
      externalId: opts?.externalId,
      quotedMessageId: opts?.quotedMessageId,
    });
    await this.planLimits.trackMessageSend(ws);
    return { ok: true, queued: true, delivery: 'queued' };
  }

  listTemplates(_ws: string) {
    return {
      error: true,
      message: 'Templates legados não são suportados no modo Meta Cloud.',
      data: [],
      total: 0,
    };
  }

  async sendTemplate(
    ws: string,
    to: string,
    template: { name: string; language: string; components?: unknown[] },
  ) {
    this.slog.info('send_template', { workspaceId: ws, to, template: template.name });
    await this.planLimits.ensureSubscriptionActive(ws);
    const w = await this.workspaces.getWorkspace(ws);
    const ew = this.workspaces.toEngineWorkspace(w);
    await this.ensureOptInAllowed(ws, to);
    const m = this.sessionService.validateWorkspaceProvider(ew);
    if (m.length) {
      return { error: true, message: `Configuração do provedor incompleta: ${m.join(', ')}` };
    }
    const r = await this.sessionService.collectMessagingRuntimeIssues(ws, ew, {
      requireInboundWebhook: false,
    });
    if (r.issues.length) {
      return {
        error: true,
        message: `Runtime do WhatsApp indisponível: ${r.issues.join(', ')}`,
        diagnostics: r.diagnostics,
      };
    }
    await flowQueue.add('send-message', {
      type: 'template',
      workspaceId: ws,
      workspace: ew,
      to,
      template,
      user: to,
    });
    await this.planLimits.trackMessageSend(ws);
    return { ok: true, queued: true, delivery: 'queued' };
  }

  async sendDirectMessage(ws: string, to: string, message: string) {
    const r = await this.sendDirectlyViaProvider(ws, to, message);
    return r.ok === true
      ? { success: true, result: r }
      : { error: true, message: r.message || 'send_failed' };
  }

  private async sendDirectlyViaProvider(
    ws: string,
    to: string,
    message: string,
    opts?: {
      mediaUrl?: string;
      mediaType?: 'image' | 'video' | 'audio' | 'document';
      caption?: string;
      externalId?: string;
      complianceMode?: 'reactive' | 'proactive';
      forceDirect?: boolean;
      quotedMessageId?: string;
    },
  ) {
    const lockKey = `whatsapp:action-lock:${ws}`;
    const token = `${Date.now()}:${randomUUID()}`;
    const ttlMs = Math.max(
      15_000,
      Number.parseInt(process.env.WHATSAPP_ACTION_LOCK_MS || '45000', 10) || 45_000,
    );
    const deadline = Date.now() + ttlMs;
    const tryAcquire = async (): ReturnType<typeof this.sendDirectCore> => {
      if (Date.now() >= deadline) {
        return this.sendDirectCore(ws, to, message, opts);
      }
      if ((await this.redis.set(lockKey, token, 'PX', ttlMs, 'NX')) !== 'OK') {
        await this.sleep(250 + randomInt(250));
        return tryAcquire();
      }
      try {
        return await this.sendDirectCore(ws, to, message, opts);
      } finally {
        const c = await this.redis.get(lockKey).catch(() => null);
        if (c === token) {
          await this.redis.del(lockKey).catch(() => {});
        }
      }
    };
    return tryAcquire();
  }

  private async sendDirectCore(
    ws: string,
    to: string,
    message: string,
    opts?: {
      mediaUrl?: string;
      mediaType?: 'image' | 'video' | 'audio' | 'document';
      caption?: string;
      quotedMessageId?: string;
      externalId?: string;
    },
  ) {
    const n = this.normalizeChatId(to);
    await this.sessionService.markChatAsReadBestEffort(ws, n);
    const isTest = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
    if (!isTest) {
      await this.providerRegistry.setPresence(ws, 'available', n).catch(() => {});
      await this.sleep(300 + randomInt(500));
      await this.providerRegistry.sendTyping(ws, n).catch(() => {});
      await this.sleep(
        Math.max(
          500,
          Math.min(
            3500,
            450 + String(opts?.caption || message || '').trim().length * 35 + randomInt(450),
          ),
        ),
      );
      await this.providerRegistry.stopTyping(ws, n).catch(() => {});
    }
    const sendOpts: Record<string, unknown> = {};
    if (opts?.mediaUrl !== undefined) {
      sendOpts.mediaUrl = opts.mediaUrl;
    }
    if (opts?.mediaType !== undefined) {
      sendOpts.mediaType = opts.mediaType;
    }
    if (opts?.caption !== undefined) {
      sendOpts.caption = opts.caption;
    }
    if (opts?.quotedMessageId !== undefined) {
      sendOpts.quotedMessageId = opts.quotedMessageId;
    }
    const registry = this.providerRegistry;
    const r = await registry.sendMessage(ws, to, message, sendOpts).catch((e: unknown) => {
      this.slog.error('send_direct_provider_failed', {
        workspaceId: ws,
        to,
        error: String(e instanceof Error ? e.message : e),
      });
      void this.opsAlert?.alertOnCriticalError(e, 'WhatsappMessageDispatcher.sendDirectCore', {
        workspaceId: ws,
        metadata: { to },
      });
      return { success: false, error: String(e instanceof Error ? e.message : e) };
    });
    if (!r.success) {
      await this.providerRegistry.setPresence(ws, 'offline', n).catch(() => {});
      return { error: true, message: r.error || 'send_failed' };
    }
    await this.sessionService.markChatAsReadBestEffort(ws, to);
    await this.providerRegistry.setPresence(ws, 'offline', n).catch(() => {});
    const extId =
      'messageId' in r && r.messageId != null ? r.messageId : (opts?.externalId ?? undefined);
    await this.inbox.saveMessageByPhone({
      workspaceId: ws,
      phone: to,
      content: opts?.caption || message || opts?.mediaUrl || '',
      direction: 'OUTBOUND',
      ...(extId !== undefined ? { externalId: extId } : {}),
      type: opts?.mediaType ? opts.mediaType.toUpperCase() : 'TEXT',
      ...(opts?.mediaUrl !== undefined ? { mediaUrl: opts.mediaUrl } : {}),
      status: 'SENT',
    });

    if (this.whatsappEmitter) {
      this.whatsappEmitter.emitMessageReplied({
        workspaceId: ws,
        to,
        contactId: to,
        messageId: extId ?? undefined,
        author: 'autopilot',
        content: message,
      });
    }
    return {
      ok: true,
      direct: true,
      delivery: 'sent',
      messageId: 'messageId' in r ? r.messageId : null,
    };
  }

  private async ensureOptInAllowed(
    ws: string,
    phone: string,
    complianceMode: 'reactive' | 'proactive' = 'proactive',
  ) {
    const eo = process.env.ENFORCE_OPTIN === 'true';
    const e24 = (process.env.AUTOPILOT_ENFORCE_24H ?? 'false').toLowerCase() !== 'false';
    const c = await this.prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId: ws, phone } },
      select: {
        id: true,
        optIn: true,
        optedOutAt: true,
        customFields: true,
        tags: { select: { name: true } },
      },
    });
    if (c && c.optIn === false) {
      throw new ForbiddenException('Contato cancelou o recebimento de mensagens (opt-out)');
    }
    if (complianceMode === 'reactive') {
      return;
    }
    if (eo) {
      if (!c) {
        throw new ForbiddenException('Contato sem opt-in para WhatsApp');
      }
      const cf = (c.customFields as ContactCustomFields) || {};
      const has =
        c.optIn === true ||
        c.tags.some((t: { name: string }) => t.name === 'optin_whatsapp') ||
        cf.optin === true ||
        cf.optin_whatsapp === true;
      if (!has) {
        throw new ForbiddenException('Contato sem opt-in para WhatsApp');
      }
    }
    if (e24) {
      const li = await this.prisma.message.findFirst({
        where: { workspaceId: ws, contact: { phone }, direction: 'INBOUND' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (!li || li.createdAt.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
        throw new ForbiddenException('Fora da janela de 24h para envio');
      }
    }
  }
}
