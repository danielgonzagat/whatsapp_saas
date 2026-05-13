import { InjectRedis } from '@nestjs-modules/ioredis';
import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import Redis from 'ioredis';
import { forEachSequential } from '../common/async-sequence';
import { createRedisClient } from '../common/redis/redis.util';
import { NeuroCrmService } from '../crm/neuro-crm.service';
import { INBOX_SERVICE } from '../inbox/inbox.token';
import type { IInboxService } from '../inbox/inbox.interface';
import { StructuredLogger } from '../logging/structured-logger';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildQueueDedupId, buildQueueJobId } from '../queue/job-id.util';
import { autopilotQueue, flowQueue } from '../queue/queue';
import { WorkspaceService } from '../workspaces/workspace.service';
import { DecisionOutcomeService } from '../kloel/decision-outcome.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { isPlaceholderContactName as isPlaceholderName } from './whatsapp-normalization.util';
import { TAG_DEFAULT_COLORS } from '../common/kloel-colors';
import {
  normalizeJsonObjExt,
  normalizeHashExt,
  isAutonomousEnabledExt,
} from './whatsapp-service.helpers';
import type { ProviderSettings } from './provider-settings.types';

type ExternalProviderPayload = Record<string, unknown>;

const D_RE = /\D/g;

@Injectable()
export class WhatsappReconcilerService {
  private readonly logger = new Logger(WhatsappReconcilerService.name);
  private readonly slog = new StructuredLogger('whatsapp-reconciler');
  private readonly contactDebounceMs = Math.max(
    500,
    Number.parseInt(process.env.AUTOPILOT_CONTACT_DEBOUNCE_MS || '2000', 10) || 2000,
  );

  constructor(
    private readonly workspaces: WorkspaceService,
    @Inject(forwardRef(() => INBOX_SERVICE)) private readonly inbox: IInboxService,
    @InjectRedis() private readonly redis: Redis,
    private readonly neuroCrm: NeuroCrmService,
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly decisionOutcome: DecisionOutcomeService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  private readText(v: unknown): string {
    if (typeof v === 'string') {
      return v.trim();
    }
    if (typeof v === 'number' || typeof v === 'boolean') {
      return String(v).trim();
    }
    return '';
  }

  private isPlaceholderContactName(v: unknown, p?: string | null): boolean {
    return isPlaceholderName(v, p);
  }

  private resolveTrustedContactName(phone: string, ...candidates: unknown[]): string {
    for (const c of candidates) {
      const n = this.readText(c);
      if (n && !this.isPlaceholderContactName(n, phone)) {
        return n;
      }
    }
    return '';
  }

  private normalizeNumber(num: string): string {
    return num.replace(D_RE, '');
  }

  private normalizeJsonObject(v: unknown): ExternalProviderPayload {
    return normalizeJsonObjExt(v);
  }

  private normalizeHash(t: string): string {
    return normalizeHashExt(t);
  }

  private isAutonomousEnabled(s: ProviderSettings): boolean {
    return isAutonomousEnabledExt(s);
  }

  async handleIncoming(workspaceId: string, from: string, message: string) {
    this.slog.info('incoming_webhook', { workspaceId, from, message });
    const ws = await this.workspaces.getWorkspace(workspaceId).catch(() => null);
    if (!ws) {
      this.slog.warn('incoming_invalid_workspace', { workspaceId });
      throw new Error('Workspace not found');
    }
    const dedupeKey = `incoming:dedupe:${workspaceId}:${from}:${this.normalizeHash(message)}`;
    if (await this.redis.get(dedupeKey)) {
      return { skipped: true, reason: 'duplicate' };
    }
    await this.redis.setex(dedupeKey, 60, '1');

    const lower = (message || '').toLowerCase();
    if (
      ['stop', 'sair', 'cancelar', 'cancel', 'parar', 'unsubscribe'].some((k) => lower.includes(k))
    ) {
      await this.optOutContact(workspaceId, from.replace(D_RE, '')).catch(() => {});
    }

    const saved = await this.inbox.saveMessageByPhone({
      workspaceId,
      phone: from,
      content: message,
      direction: 'INBOUND',
    });
    void this.decisionOutcome.recordEvent({
      workspaceId,
      eventType: 'inbound.received',
      eventKey: saved.id,
      correlation: {
        contactId: saved.contactId ?? from,
        channel: 'whatsapp',
      },
    });
    const nPhone = this.normalizeNumber(from);
    const ctxKey = `reply:${nPhone}`;
    try {
      await this.redis.rpush(ctxKey, message);
      await this.redis.expire(ctxKey, 60 * 60 * 24);
    } catch (_e: unknown) {
      this.logger.warn(
        `Redis reply context write failed for ${workspaceId}, trying fallback: ${(_e instanceof Error ? _e : new Error(String(_e))).message}`,
      );
      const fc = createRedisClient();
      if (fc) {
        try {
          await fc.rpush(ctxKey, message);
          await fc.expire(ctxKey, 60 * 60 * 24);
        } finally {
          fc.disconnect();
        }
      }
    }
    await flowQueue.add(
      'resume-flow',
      { user: nPhone, message, workspaceId },
      { removeOnComplete: true },
    );

    try {
      const settings = this.normalizeJsonObject(ws.providerSettings);
      if (this.isAutonomousEnabled(settings) && saved?.contactId) {
        const sk = `autopilot:scan-contact:${workspaceId}:${saved.contactId}`;
        if ((await this.redis.set(sk, saved.id, 'PX', this.contactDebounceMs, 'NX')) === 'OK') {
          await autopilotQueue.add(
            'scan-contact',
            {
              workspaceId,
              phone: from,
              contactId: saved.contactId,
              messageContent: message,
              messageId: saved.id,
            },
            {
              jobId: buildQueueJobId('scan-contact', workspaceId, saved.contactId, saved.id),
              delay: this.contactDebounceMs,
              deduplication: {
                id: buildQueueDedupId('scan-contact', workspaceId, saved.contactId),
                ttl: this.contactDebounceMs + 500,
              },
              removeOnComplete: true,
            },
          );
        }
      }
      const apc = this.normalizeJsonObject(settings.autopilot);
      const hf = typeof apc.hotFlowId === 'string' ? apc.hotFlowId : null;
      if (
        hf &&
        [
          'preco',
          'preço',
          'price',
          'quanto',
          'pix',
          'boleto',
          'garantia',
          'comprar',
          'assinar',
        ].some((k) => lower.includes(k))
      ) {
        await flowQueue.add('run-flow', {
          workspaceId,
          flowId: hf,
          user: nPhone,
          initialVars: { source: 'hot_signal', lastMessage: message },
        });
      }
      if (
        [
          'paguei',
          'pago',
          'pix',
          'pague',
          'comprei',
          'compre',
          'boleto',
          'assinatura',
          'transferi',
          'transferido',
        ].some((k) => lower.includes(k)) &&
        saved?.contactId
      ) {
        const le = await this.prisma.autopilotEvent.findFirst({
          where: { workspaceId, contactId: saved.contactId },
          orderBy: { createdAt: 'desc' },
        });
        if (le && Date.now() - new Date(le.createdAt).getTime() <= 72 * 60 * 60 * 1000) {
          await this.prisma.autopilotEvent.create({
            data: {
              workspaceId,
              contactId: saved.contactId,
              intent: 'BUYING',
              action: 'CONVERSION',
              status: 'executed',
              reason: 'payment_keyword_inbound',
              responseText: message,
              meta: { source: 'inbound', keywordHit: true },
            },
          });
          await this.prisma.contact.updateMany({
            where: { id: saved.contactId, workspaceId },
            data: { purchaseProbability: 'HIGH', sentiment: 'POSITIVE' },
          });
        }
      }
    } catch (e: unknown) {
      this.logger.warn(
        `Autopilot enqueue failed: ${(e instanceof Error ? e : new Error(String(e))).message}`,
      );
      void this.opsAlert?.alertOnCriticalError(e, 'WhatsappReconciler.processInbound.autopilot', {
        workspaceId,
      });
    }
    if (saved?.contactId) {
      this.neuroCrm.analyzeContact(workspaceId, saved.contactId).catch(() => {});
    }
    try {
      await this.redis.publish(
        `ws:copilot:${workspaceId}`,
        JSON.stringify({
          type: 'new_message',
          workspaceId,
          contactId: saved?.contactId,
          phone: from,
          message,
        }),
      );
    } catch (e: unknown) {
      this.logger.warn(
        `Copilot pub/sub failed for ws=${workspaceId}: ${(e instanceof Error ? e : new Error(String(e))).message}`,
      );
    }
    return { ok: true };
  }

  async syncRemoteContactProfile(
    ws: string,
    phone: string,
    name?: string | null,
  ): Promise<boolean> {
    const np = this.normalizeNumber(phone || '');
    const nn = this.resolveTrustedContactName(phone, name);
    if (!np || !nn) {
      return false;
    }
    try {
      return await this.providerRegistry.upsertContactProfile(ws, { phone: np, name: nn });
    } catch (e: unknown) {
      this.logger.warn(
        `Falha ao sincronizar contato ${np}: ${(e instanceof Error ? e : new Error(String(e))).message}`,
      );
      void this.opsAlert?.alertOnCriticalError(e, 'WhatsappReconciler.syncRemoteContactProfile', {
        workspaceId: ws,
        metadata: { phone: np },
      });
      return false;
    }
  }

  async optInContact(ws: string, phone: string) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.contact.upsert({
        where: { workspaceId_phone: { workspaceId: ws, phone } },
        update: {},
        create: { workspaceId: ws, phone, name: null },
      });
      await tx.contact.updateMany({
        where: { id: c.id, workspaceId: ws },
        data: { optIn: true, optedOutAt: null },
      });
      const t = await tx.tag.upsert({
        where: { workspaceId_name: { workspaceId: ws, name: 'optin_whatsapp' } },
        update: {},
        create: {
          workspaceId: ws,
          name: 'optin_whatsapp',
          color: TAG_DEFAULT_COLORS.WHATSAPP_OPTIN_GREEN,
        },
      });
      await tx.contact.update({
        where: { workspaceId_phone: { workspaceId: ws, phone } },
        data: { tags: { connect: { id: t.id } } },
      });
      return { ok: true };
    });
  }

  async optOutContact(ws: string, phone: string) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.contact.findUnique({
        where: { workspaceId_phone: { workspaceId: ws, phone } },
        select: { id: true },
      });
      if (!c) {
        return { ok: true };
      }
      await tx.contact.updateMany({
        where: { id: c.id, workspaceId: ws },
        data: { optIn: false, optedOutAt: new Date() },
      });
      const t = await tx.tag.findUnique({
        where: { workspaceId_name: { workspaceId: ws, name: 'optin_whatsapp' } },
        select: { id: true },
      });
      if (t) {
        await tx.contact.update({
          where: { workspaceId_phone: { workspaceId: ws, phone } },
          data: { tags: { disconnect: { id: t.id } } },
        });
      }
      return { ok: true };
    });
  }

  async optInBulk(ws: string, phones: string[]) {
    const u = Array.from(new Set((phones || []).map((p) => p?.trim()).filter(Boolean)));
    const r: { phone: string; ok: boolean }[] = [];
    await forEachSequential(u, async (p) => {
      try {
        await this.optInContact(ws, p);
        r.push({ phone: p, ok: true });
      } catch (e: unknown) {
        this.logger.warn(
          `optInContact failed for ${p} in ws=${ws}: ${(e instanceof Error ? e : new Error(String(e))).message}`,
        );
        r.push({ phone: p, ok: false });
      }
    });
    return { ok: true, processed: r.length, results: r };
  }

  async optOutBulk(ws: string, phones: string[]) {
    const u = Array.from(new Set((phones || []).map((p) => p?.trim()).filter(Boolean)));
    const r: { phone: string; ok: boolean }[] = [];
    await forEachSequential(u, async (p) => {
      try {
        await this.optOutContact(ws, p);
        r.push({ phone: p, ok: true });
      } catch (e: unknown) {
        this.logger.warn(
          `optOutContact failed for ${p} in ws=${ws}: ${(e instanceof Error ? e : new Error(String(e))).message}`,
        );
        r.push({ phone: p, ok: false });
      }
    });
    return { ok: true, processed: r.length, results: r };
  }

  async getOptInStatus(ws: string, phone: string) {
    const c = await this.prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId: ws, phone } },
      select: { id: true, tags: { select: { name: true } } },
    });
    if (!c) {
      return { optIn: false, contactExists: false };
    }
    return {
      optIn: c.tags.some((t: { name: string }) => t.name === 'optin_whatsapp'),
      contactExists: true,
    };
  }
}
