import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

import { WorkspaceService } from '../workspaces/workspace.service';
import { InboxService } from '../inbox/inbox.service';
import { flowQueue, autopilotQueue } from '../queue/queue';
import { StructuredLogger } from '../logging/structured-logger';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { NeuroCrmService } from '../crm/neuro-crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { createRedisClient } from '../common/redis/redis.util';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsAppApiProvider } from './providers/whatsapp-api.provider';

/**
 * =====================================================================
 * WHATSAPPSERVICE PRO (UWE-Ω)
 * =====================================================================
 */

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly slog = new StructuredLogger('whatsapp-service');
  private readonly contactDebounceMs = Math.max(
    500,
    parseInt(process.env.AUTOPILOT_CONTACT_DEBOUNCE_MS || '2000', 10) || 2000,
  );

  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly inbox: InboxService,
    private readonly planLimits: PlanLimitsService,
    @InjectRedis() private readonly redis: Redis,
    private readonly neuroCrm: NeuroCrmService,
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistry,
    private readonly whatsappApi: WhatsAppApiProvider,
  ) {}

  // ============================================================
  // Normalize number
  // ============================================================
  private normalizeNumber(num: string): string {
    return num.replace(/\D/g, '');
  }

  private isAutonomousEnabled(settings: any): boolean {
    const sessionStatus = String(
      settings?.whatsappApiSession?.status || '',
    ).toLowerCase();

    return (
      settings?.autopilot?.enabled === true ||
      sessionStatus === 'connected' ||
      sessionStatus === 'working'
    );
  }

  // ============================================================
  // 1. CREATE SESSION (WAHA)
  // ============================================================
  async createSession(workspaceId: string) {
    this.logger.log(`[SERVICE] createSession → workspace=${workspaceId}`);
    this.slog.info('createSession', { workspaceId });

    if (!workspaceId) {
      throw new ForbiddenException(
        'workspaceId é obrigatório para criar sessão.',
      );
    }

    const result = await this.providerRegistry.startSession(workspaceId);
    if (!result.success) {
      return {
        error: true,
        message: result.message || 'failed_to_start_session',
      };
    }

    const qr = await this.whatsappApi.getQrCode(workspaceId);
    if (qr.success && qr.qr) {
      return {
        status: 'qr_pending',
        code: qr.qr,
        qrCode: qr.qr,
      };
    }

    const status = await this.providerRegistry.getSessionStatus(workspaceId);
    return {
      status: status.connected ? 'already_connected' : status.status,
      qrCode: status.qrCode,
    };
  }

  // ============================================================
  // 2. SEND MESSAGE (via Worker Engine)
  // ============================================================
  async sendMessage(
    workspaceId: string,
    to: string,
    message: string,
    opts?: {
      mediaUrl?: string;
      mediaType?: 'image' | 'video' | 'audio' | 'document';
      caption?: string;
      externalId?: string;
    },
  ) {
    this.logger.log(
      `[SERVICE] sendMessage(workspace=${workspaceId}, to=${to})`,
    );
    this.slog.info('send_message', { workspaceId, to });

    await this.planLimits.trackMessageSend(workspaceId);
    await this.planLimits.ensureSubscriptionActive(workspaceId);

    const ws = await this.workspaces.getWorkspace(workspaceId);
    const engineWs = this.workspaces.toEngineWorkspace(ws);

    await this.ensureOptInAllowed(workspaceId, to);

    // Validação rápida de credenciais do provedor antes de enfileirar
    const missing = this.validateWorkspaceProvider(engineWs);
    if (missing.length) {
      this.slog.warn('send_blocked_missing_provider', { workspaceId, missing });
      return {
        error: true,
        message: `Configuração do provedor incompleta: ${missing.join(', ')}`,
      };
    }

    //-----------------------------------------------------------
    // 🔥 Enviar via Worker → FlowEngine → WhatsAppEngine (WAHA)
    //-----------------------------------------------------------

    await flowQueue.add('send-message', {
      type: 'direct',
      workspaceId,
      workspace: engineWs,
      to,
      message,
      user: to,
      mediaUrl: opts?.mediaUrl,
      mediaType: opts?.mediaType,
      caption: opts?.caption,
      externalId: opts?.externalId,
    });

    // Persistir mensagem OUTBOUND no Inbox para feedback em tempo real
    await this.inbox.saveMessageByPhone({
      workspaceId,
      phone: to,
      content: opts?.caption || message || opts?.mediaUrl || '',
      direction: 'OUTBOUND',
      type: opts?.mediaType ? opts.mediaType.toUpperCase() : 'TEXT',
      mediaUrl: opts?.mediaUrl,
    });

    return { ok: true };
  }

  // ============================================================
  // 2c. LISTAR TEMPLATES
  // ============================================================
  async listTemplates(workspaceId: string) {
    this.slog.info('list_templates_unsupported', { workspaceId });
    return {
      error: true,
      message:
        'Templates legados não são suportados no modo WAHA-only. Use mensagens diretas ou fluxos do autopilot.',
      data: [],
      total: 0,
    };
  }

  // ============================================================
  // 2d. OPT-IN / OPT-OUT (marca contato com tag optin_whatsapp)
  // ============================================================
  private async upsertContact(workspaceId: string, phone: string) {
    return this.prisma.contact.upsert({
      where: { workspaceId_phone: { workspaceId, phone } },
      update: {},
      create: {
        workspaceId,
        phone,
        name: phone,
      },
    });
  }

  async optInContact(workspaceId: string, phone: string) {
    const contact = await this.upsertContact(workspaceId, phone);

    // Update optIn field directly (LGPD/GDPR compliance)
    await this.prisma.contact.update({
      where: { id: contact.id },
      data: {
        optIn: true,
        optedOutAt: null, // Clear opt-out timestamp
      },
    });

    // Also connect legacy tag for backwards compatibility
    const tag = await this.prisma.tag.upsert({
      where: {
        workspaceId_name: {
          workspaceId,
          name: 'optin_whatsapp',
        },
      },
      update: {},
      create: {
        workspaceId,
        name: 'optin_whatsapp',
        color: '#16a34a',
      },
    });

    await this.prisma.contact.update({
      where: { id: contact.id },
      data: { tags: { connect: { id: tag.id } } },
    });

    this.slog.info('contact_opted_in', {
      workspaceId,
      phone,
      contactId: contact.id,
    });

    return { ok: true };
  }

  async optOutContact(workspaceId: string, phone: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId, phone } },
      select: { id: true },
    });
    if (!contact) return { ok: true };

    // Update optIn field directly (LGPD/GDPR compliance)
    await this.prisma.contact.update({
      where: { id: contact.id },
      data: {
        optIn: false,
        optedOutAt: new Date(),
      },
    });

    // Also disconnect legacy tag if exists
    const tag = await this.prisma.tag.findUnique({
      where: {
        workspaceId_name: {
          workspaceId,
          name: 'optin_whatsapp',
        },
      },
      select: { id: true },
    });

    if (tag) {
      await this.prisma.contact.update({
        where: { id: contact.id },
        data: { tags: { disconnect: { id: tag.id } } },
      });
    }

    this.slog.info('contact_opted_out', {
      workspaceId,
      phone,
      contactId: contact.id,
    });

    return { ok: true };
  }

  async optInBulk(workspaceId: string, phones: string[]) {
    const unique = Array.from(
      new Set((phones || []).map((p) => p?.trim()).filter(Boolean)),
    );
    const results: { phone: string; ok: boolean }[] = [];
    for (const phone of unique) {
      try {
        await this.optInContact(workspaceId, phone);
        results.push({ phone, ok: true });
      } catch {
        results.push({ phone, ok: false });
      }
    }
    return { ok: true, processed: results.length, results };
  }

  async optOutBulk(workspaceId: string, phones: string[]) {
    const unique = Array.from(
      new Set((phones || []).map((p) => p?.trim()).filter(Boolean)),
    );
    const results: { phone: string; ok: boolean }[] = [];
    for (const phone of unique) {
      try {
        await this.optOutContact(workspaceId, phone);
        results.push({ phone, ok: true });
      } catch {
        results.push({ phone, ok: false });
      }
    }
    return { ok: true, processed: results.length, results };
  }

  async getOptInStatus(workspaceId: string, phone: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId, phone } },
      select: { id: true, tags: { select: { name: true } } },
    });
    if (!contact) {
      return { optIn: false, contactExists: false };
    }
    const optIn = contact.tags.some((t) => t.name === 'optin_whatsapp');
    return { optIn, contactExists: true };
  }

  /**
   * Verifica opt-in obrigatório antes de enviar mensagens/templates.
   * If contact has optIn=false, ALWAYS block (LGPD/GDPR compliance).
   * Se ENFORCE_OPTIN=true e o contato não tiver opt-in, bloqueia envio.
   */
  private async ensureOptInAllowed(workspaceId: string, phone: string) {
    const enforceOptIn = process.env.ENFORCE_OPTIN === 'true';
    const enforce24h =
      (process.env.AUTOPILOT_ENFORCE_24H ?? 'true').toLowerCase() !== 'false';

    const contact = await this.prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId, phone } },
      select: {
        id: true,
        optIn: true,
        optedOutAt: true,
        customFields: true,
        tags: { select: { name: true } },
      },
    });

    // CRITICAL: If contact explicitly opted out, ALWAYS block (LGPD/GDPR)
    if (contact && contact.optIn === false) {
      this.slog.warn('send_blocked_opted_out', {
        workspaceId,
        phone,
        optedOutAt: contact.optedOutAt,
      });
      throw new ForbiddenException(
        'Contato cancelou o recebimento de mensagens (opt-out)',
      );
    }

    if (enforceOptIn) {
      if (!contact) {
        throw new ForbiddenException('Contato sem opt-in para WhatsApp');
      }
      const cf: any = contact.customFields || {};
      const hasOptIn =
        contact.optIn === true || // New field takes priority
        contact.tags.some((t) => t.name === 'optin_whatsapp') ||
        cf.optin === true ||
        cf.optin_whatsapp === true;
      if (!hasOptIn) {
        throw new ForbiddenException('Contato sem opt-in para WhatsApp');
      }
    }

    if (enforce24h) {
      const lastInbound = await this.prisma.message.findFirst({
        where: {
          workspaceId,
          contact: { phone },
          direction: 'INBOUND',
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      if (!lastInbound || lastInbound.createdAt.getTime() < cutoff) {
        throw new ForbiddenException('Fora da janela de 24h para envio');
      }
    }
  }

  // ============================================================
  // 2b. SEND TEMPLATE
  // ============================================================
  async sendTemplate(
    workspaceId: string,
    to: string,
    template: { name: string; language: string; components?: any[] },
  ) {
    this.logger.log(
      `[SERVICE] sendTemplate(workspace=${workspaceId}, to=${to}, template=${template.name})`,
    );
    this.slog.info('send_template', {
      workspaceId,
      to,
      template: template.name,
    });

    await this.planLimits.trackMessageSend(workspaceId);
    await this.planLimits.ensureSubscriptionActive(workspaceId);

    const ws = await this.workspaces.getWorkspace(workspaceId);
    const engineWs = this.workspaces.toEngineWorkspace(ws);

    await this.ensureOptInAllowed(workspaceId, to);

    const missing = this.validateWorkspaceProvider(engineWs);
    if (missing.length) {
      this.slog.warn('send_blocked_missing_provider', { workspaceId, missing });
      return {
        error: true,
        message: `Configuração do provedor incompleta: ${missing.join(', ')}`,
      };
    }

    await flowQueue.add('send-message', {
      type: 'template',
      workspaceId,
      workspace: engineWs,
      to,
      template,
      user: to,
    });

    await this.inbox.saveMessageByPhone({
      workspaceId,
      phone: to,
      content: `template:${template.name}`,
      direction: 'OUTBOUND',
      type: 'TEMPLATE',
    });

    return { ok: true };
  }

  // ============================================================
  // 3. SEND MESSAGE DIRECTLY USING WAHA (test mode only)
  // ============================================================
  async sendDirectMessage(workspaceId: string, to: string, message: string) {
    const result = await this.providerRegistry.sendMessage(
      workspaceId,
      to,
      message,
    );
    return result.success
      ? { success: true, result }
      : { error: true, message: result.error || 'send_failed' };
  }

  // ============================================================
  // 4. INCOMING MESSAGE (WEBHOOK)
  // ============================================================
  async handleIncoming(workspaceId: string, from: string, message: string) {
    this.logger.log(
      `📩 [INCOMING] workspace=${workspaceId}, from=${from}: ${message}`,
    );
    this.slog.info('incoming_webhook', { workspaceId, from, message });

    // Sanitize workspace and ensure it exists
    const ws = await this.workspaces
      .getWorkspace(workspaceId)
      .catch(() => null);
    if (!ws) {
      this.slog.warn('incoming_invalid_workspace', { workspaceId });
      throw new Error('Workspace not found for incoming message');
    }

    // Idempotência básica: evita processar mesma mensagem (hash from+msg) em curto intervalo
    const dedupeKey = `incoming:dedupe:${workspaceId}:${from}:${this.normalizeHash(message)}`;
    const already = await this.redis.get(dedupeKey);
    if (already) {
      this.slog.info('incoming_deduped', { workspaceId, from });
      return { skipped: true, reason: 'duplicate' };
    }
    await this.redis.setex(dedupeKey, 60, '1'); // 60s de janela de dedupe

    // Opt-out automático (STOP/SAIR/CANCELAR)
    const lower = (message || '').toLowerCase();
    const stopKeywords = [
      'stop',
      'sair',
      'cancelar',
      'cancel',
      'parar',
      'unsubscribe',
    ];
    if (stopKeywords.some((kw) => lower.includes(kw))) {
      try {
        await this.optOutContact(workspaceId, from.replace(/\D/g, ''));
        this.slog.info('auto_optout', { workspaceId, from });
      } catch (err: any) {
        this.logger.warn(`Opt-out auto falhou: ${err?.message}`);
      }
    }

    // 1. Persistir no Inbox
    const saved = await this.inbox.saveMessageByPhone({
      workspaceId,
      phone: from, // Assumindo que venha formatado do webhook
      content: message,
      direction: 'INBOUND',
    });

    // 2. Entrega para o FlowEngine (via Redis)
    await this.deliverToContext(from, message, workspaceId);

      // 3. Enfileira Autopilot (worker) para avaliação/ação assíncrona
      try {
        const settings = ws.providerSettings || {};
        if (this.isAutonomousEnabled(settings) && saved?.contactId) {
          const scanKey = `autopilot:scan-contact:${workspaceId}:${saved.contactId}`;
          const reserved = await this.redis.set(
            scanKey,
            saved.id,
            'PX',
            this.contactDebounceMs,
            'NX',
          );

          if (reserved === 'OK') {
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
                jobId: `scan-contact:${workspaceId}:${saved.contactId}`,
                delay: this.contactDebounceMs,
                removeOnComplete: true,
              },
            );
          }
        }

      // Sinais de compra em tempo real -> dispara flow quente, se configurado
      const hotFlowId = settings?.autopilot?.hotFlowId;
      const lower = (message || '').toLowerCase();
      const buyKeywords = [
        'preco',
        'preço',
        'price',
        'quanto',
        'pix',
        'boleto',
        'garantia',
        'comprar',
        'assinar',
      ];
      const hasBuyingSignal = buyKeywords.some((k) => lower.includes(k));
      if (hotFlowId && hasBuyingSignal) {
        await flowQueue.add('run-flow', {
          workspaceId,
          flowId: hotFlowId,
          user: from.replace(/\D/g, ''),
          initialVars: { source: 'hot_signal', lastMessage: message },
        });
      }

      // Conversão detectada (sinais de pagamento) -> registra evento Autopilot CONVERSION
      const conversionKeywords = [
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
      ];
      const hasConversionSignal = conversionKeywords.some((k) =>
        lower.includes(k),
      );
      if (hasConversionSignal && saved?.contactId) {
        // Verifica se houve ação recente do Autopilot (últimas 72h)
        const lastEvent = await this.prisma.autopilotEvent.findFirst({
          where: {
            workspaceId,
            contactId: saved.contactId,
          },
          orderBy: { createdAt: 'desc' },
        });
        const withinWindow =
          lastEvent &&
          Date.now() - new Date(lastEvent.createdAt).getTime() <=
            72 * 60 * 60 * 1000;
        if (withinWindow) {
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

          // Sobe probabilidade de compra no contato
          await this.prisma.contact.update({
            where: { id: saved.contactId },
            data: { purchaseProbability: 'HIGH', sentiment: 'POSITIVE' },
          });
        }
      }
    } catch (err: any) {
      this.logger.warn(`Autopilot enqueue failed: ${err?.message}`);
    }

    // 4. Pipeline NeuroCRM (análise cognitiva básica)
    if (saved?.contactId) {
      this.neuroCrm
        .analyzeContact(workspaceId, saved.contactId)
        .catch((err) =>
          this.logger.warn(`NeuroCRM analyze failed: ${err?.message}`),
        );
    }

    // 5. WebSocket push para Copilot (sugestão em tempo real)
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
    } catch (err: any) {
      this.logger.warn(`Copilot push failed: ${err?.message}`);
    }

    return { ok: true };
  }

  private normalizeHash(text: string) {
    return Buffer.from(text || '')
      .toString('base64')
      .slice(0, 32);
  }

  // ============================================================
  // 5. RETORNAR CLIENTE
  // ============================================================
  getSession(workspaceId: string) {
    return { workspaceId, provider: 'whatsapp-api' };
  }

  /** Retorna status e telefone da sessão WAHA */
  async getConnectionStatus(workspaceId: string) {
    const status = await this.providerRegistry.getSessionStatus(workspaceId);
    return {
      status: status.status,
      phoneNumber: status.phoneNumber,
      qrCode: status.qrCode,
    };
  }

  /** Último QR gerado pela sessão WAHA */
  async getQrCode(workspaceId: string) {
    const qr = await this.whatsappApi.getQrCode(workspaceId);
    return qr.success ? qr.qr || null : null;
  }

  /** Desconecta sessão WAHA */
  async disconnect(workspaceId: string) {
    await this.providerRegistry.disconnect(workspaceId);
  }

  // ============================================================
  // HELPER: DELIVER TO CONTEXT STORE (REDIS)
  // ============================================================
  private async deliverToContext(
    user: string,
    message: string,
    workspaceId?: string,
  ) {
    const normalized = this.normalizeNumber(user);
    const key = `reply:${normalized}`;
    this.logger.log(
      `📨 [CTX] Delivering message from ${normalized} to key ${key}`,
    );
    try {
      await this.redis.rpush(key, message);
      await this.redis.expire(key, 60 * 60 * 24); // 24 hours
    } catch (err: any) {
      // Se a conexão principal estiver em modo subscriber, cria uma conexão auxiliar
      console.warn(
        '[Whatsapp] Redis indisponível para deliverToContext, usando client ad-hoc:',
        err?.message,
      );
      const fallback = createRedisClient();
      try {
        await fallback.rpush(key, message);
        await fallback.expire(key, 60 * 60 * 24);
      } finally {
        fallback.disconnect();
      }
    }

    // Notifica o worker para retomar fluxos que estavam em WAIT
    await flowQueue.add(
      'resume-flow',
      { user: normalized, message, workspaceId },
      { removeOnComplete: true },
    );
  }

  /**
   * Verifica se o workspace possui credenciais mínimas para o provedor ativo.
   */
  private validateWorkspaceProvider(workspace: any): string[] {
    const missing: string[] = [];
    const provider = workspace?.whatsappProvider || 'whatsapp-api';

    if (provider !== 'whatsapp-api') {
      missing.push('whatsapp-api');
    }

    return missing;
  }
}
