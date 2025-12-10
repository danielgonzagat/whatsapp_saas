import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import * as wppconnect from '@wppconnect-team/wppconnect';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

import { WorkspaceService } from '../workspaces/workspace.service';
import { InboxService } from '../inbox/inbox.service';
import { flowQueue, autopilotQueue, voiceQueue } from '../queue/queue';
import { StructuredLogger } from '../logging/structured-logger';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { NeuroCrmService } from '../crm/neuro-crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { createRedisClient } from '../common/redis/redis.util';

/**
 * =====================================================================
 * WHATSAPPSERVICE PRO (UWE-Ω)
 * =====================================================================
 */

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly slog = new StructuredLogger('whatsapp-service');

  // Armazena clientes WPPConnect por workspaceId
  private sessions: Map<string, any> = new Map();
  // Metadados da sessão (QR, status, phone) também persistidos em Redis para sobreviver a restarts
  private sessionMeta: Map<string, { qrCode?: string; status?: string; phoneNumber?: string }> = new Map();

  private sessionMetaKey(workspaceId: string) {
    return `whatsapp:wpp:session:${workspaceId}`;
  }

  private async persistSessionMeta(
    workspaceId: string,
    meta: { qrCode?: string; status?: string; phoneNumber?: string },
  ) {
    try {
      await this.redis.setex(this.sessionMetaKey(workspaceId), 60 * 60 * 6, JSON.stringify(meta)); // 6h
    } catch (err) {
      this.logger.warn(`Falha ao persistir meta da sessão: ${workspaceId} -> ${(err as any)?.message}`);
    }
  }

  /** Atualiza metadados em memória + Redis (merge incremental) */
  private async updateSessionMeta(
    workspaceId: string,
    meta: { qrCode?: string; status?: string; phoneNumber?: string },
  ) {
    const current = this.sessionMeta.get(workspaceId) || {};
    const merged = { ...current, ...meta };
    this.sessionMeta.set(workspaceId, merged);
    void this.persistSessionMeta(workspaceId, merged);
    return merged;
  }

  /** Recupera metadados persistidos em Redis (fallback após restart) */
  private async loadSessionMeta(workspaceId: string) {
    try {
      const data = await this.redis.get(this.sessionMetaKey(workspaceId));
      if (data) {
        const parsed = JSON.parse(data);
        this.sessionMeta.set(workspaceId, parsed);
        return parsed;
      }
    } catch (err) {
      this.logger.warn(`Falha ao carregar meta da sessão: ${workspaceId} -> ${(err as any)?.message}`);
    }
    return null;
  }

  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly inbox: InboxService,
    private readonly planLimits: PlanLimitsService,
    @InjectRedis() private readonly redis: Redis,
    private readonly configService: ConfigService, // Add ConfigService
    private readonly neuroCrm: NeuroCrmService,
    private readonly prisma: PrismaService,
  ) {}

  // ============================================================
  // META EMBEDDED SIGNUP (OAuth)
  // ============================================================
  getMetaOAuthUrl(workspaceId: string): Promise<string> | string {
    const appId = this.configService.get<string>('META_APP_ID');
    const redirectUri = this.configService.get<string>('META_REDIRECT_URI');
    const state = this.signMetaState(workspaceId);
    const scope = 'whatsapp_business_messaging,whatsapp_business_management';

    return `https://graph.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
  }

  async handleMetaOAuthCallback(
    code: string,
    workspaceId: string,
  ): Promise<void> {
    const appId = this.configService.get<string>('META_APP_ID');
    const appSecret = this.configService.get<string>('META_APP_SECRET');
    const redirectUri = this.configService.get<string>('META_REDIRECT_URI');

    // 1. Exchange code for Access Token
    const tokenExchangeUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}&redirect_uri=${redirectUri}`;
    const tokenRes = await fetch(tokenExchangeUrl, { method: 'GET' });
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      this.slog.error('meta_oauth_error', {
        workspaceId,
        error: tokenData.error,
      });
      throw new Error(`Meta OAuth Error: ${tokenData.error.message}`);
    }

    const accessToken = tokenData.access_token;

    // 2. Get WhatsApp Business Account ID (WABA ID)
    const wabaIdUrl = `https://graph.facebook.com/v19.0/me/whatsapp_business_accounts?access_token=${accessToken}`;
    const wabaRes = await fetch(wabaIdUrl, { method: 'GET' });
    const wabaData = await wabaRes.json();

    if (wabaData.error || !wabaData.data || wabaData.data.length === 0) {
      this.slog.error('meta_waba_error', {
        workspaceId,
        error: wabaData.error || 'No WABA found',
      });
      throw new Error(
        `Meta WABA Error: ${wabaData.error?.message || 'No WhatsApp Business Account found'}`,
      );
    }

    const wabaId = wabaData.data[0].id; // Assuming one WABA per user for simplicity

    // 3. Get Phone Numbers associated with WABA
    const phoneNumbersUrl = `https://graph.facebook.com/v19.0/${wabaId}/phone_numbers?access_token=${accessToken}`;
    const phoneRes = await fetch(phoneNumbersUrl, { method: 'GET' });
    const phoneData = await phoneRes.json();

    if (phoneData.error || !phoneData.data || phoneData.data.length === 0) {
      this.slog.error('meta_phone_error', {
        workspaceId,
        error: phoneData.error || 'No phone number found',
      });
      throw new Error(
        `Meta Phone Error: ${phoneData.error?.message || 'No phone number found for WABA'}`,
      );
    }

    const phoneNumberId = phoneData.data[0].id; // Assuming one phone number for simplicity

    // 4. Store credentials in workspace settings
    await this.workspaces.setMetaCredentials(workspaceId, {
      token: accessToken,
      phoneId: phoneNumberId,
      wabaId: wabaId,
    });

    this.slog.info('meta_oauth_success', { workspaceId, phoneNumberId });
  }

  /**
   * Assina o parâmetro state do OAuth para garantir integridade.
   */
  signMetaState(workspaceId: string): string {
    const nonce = randomBytes(8).toString('hex');
    const payload = `${workspaceId}::${nonce}`;
    const secret =
      this.configService.get<string>('META_STATE_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'meta-state-secret';

    const signature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return `${payload}::${signature}`;
  }

  /**
   * Valida o state recebido e retorna o workspaceId.
   */
  verifyMetaState(state: string): string {
    const parts = state.split('::');
    if (parts.length !== 3) {
      throw new Error('Invalid state structure');
    }

    const [workspaceId, nonce, signature] = parts;
    if (!workspaceId || !nonce || !signature) {
      throw new Error('Invalid state values');
    }

    const payload = `${workspaceId}::${nonce}`;
    const secret =
      this.configService.get<string>('META_STATE_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'meta-state-secret';

    const expectedSig = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const receivedBuf = Buffer.from(signature, 'hex');

    if (
      expectedBuf.length !== receivedBuf.length ||
      !timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      throw new Error('Invalid state signature');
    }

    return workspaceId;
  }

  // ============================================================
  // Normalize number
  // ============================================================
  private normalizeNumber(num: string): string {
    return num.replace(/\D/g, '');
  }

  // ============================================================
  // 1. CREATE SESSION (WPPConnect)
  // ============================================================
  async createSession(workspaceId: string) {
    this.logger.log(`[SERVICE] createSession → workspace=${workspaceId}`);
    this.slog.info('createSession', { workspaceId });

    if (!workspaceId) {
      throw new ForbiddenException('workspaceId é obrigatório para criar sessão.');
    }

    // Tenta reidratar metadados (QR/status) caso tenha reiniciado
    await this.loadSessionMeta(workspaceId);

    const ws = await this.workspaces.getWorkspace(workspaceId);
    if (!ws) {
      throw new ForbiddenException('Workspace não encontrado ou não autorizado.');
    }
    const settings = ws.providerSettings as any;

    if (!settings || !settings.whatsappProvider) {
      return {
        error: true,
        message: 'Nenhum provedor WhatsApp configurado para este workspace.',
      };
    }

    if (settings.whatsappProvider !== 'wpp') {
      return {
        error: true,
        message:
          "Este workspace NÃO está configurado para usar WPPConnect. Altere o provedor para 'wpp' antes de conectar.",
      };
    }

    // se já existe sessão
    if (this.sessions.has(workspaceId)) {
      const meta = {
        status: 'connected' as const,
        phoneNumber: this.sessionMeta.get(workspaceId)?.phoneNumber,
        qrCode: this.sessionMeta.get(workspaceId)?.qrCode,
      };
      this.sessionMeta.set(workspaceId, meta);
      void this.persistSessionMeta(workspaceId, meta);
      return { status: 'already_connected' };
    }

    return new Promise((resolve) => {
      this.logger.log('[SERVICE] Iniciando cliente WPPConnect...');

      wppconnect
        .create({
          session: workspaceId,

          catchQR: (qrCode, asciiQR) => {
            this.logger.log(
              `[SERVICE] QR Code gerado para workspace=${workspaceId}`,
            );
            this.slog.info('qr_generated', { workspaceId });

            // Guarda QR em memória para endpoints de status/qr
            void this.updateSessionMeta(workspaceId, {
              qrCode,
              status: 'qr_pending',
              phoneNumber: this.sessionMeta.get(workspaceId)?.phoneNumber,
            });

            resolve({
              ascii: asciiQR,
              code: qrCode,
            });
          },

          statusFind: async (status) => {
            this.logger.log(`[SERVICE] statusFind(${workspaceId}): ${status}`);

            // Persist status transitions to survive restarts
            const normalized = (status || '').toString().toLowerCase();
            if (normalized) {
              // Map common WPPConnect statuses to consistent labels
              let mapped = normalized;
              if (normalized.includes('qrreadsuccess')) mapped = 'connected';
              else if (normalized.includes('connected')) mapped = 'connected';
              else if (normalized.includes('timeout')) mapped = 'timeout';
              else if (normalized.includes('qrreadfail')) mapped = 'qr_failed';
              else if (normalized.includes('notlogged')) mapped = 'logged_out';
              else if (normalized.includes('disconnected')) mapped = 'disconnected';

              await this.updateSessionMeta(workspaceId, { status: mapped });
            }
          },
        })

        .then(async (client) => {
          this.logger.log(
            `[SERVICE] Sessão WPPConnect conectada com sucesso → workspace=${workspaceId}`,
          );
          this.slog.info('session_connected', { workspaceId });

          this.sessions.set(workspaceId, client);
          void this.updateSessionMeta(workspaceId, {
            status: 'connected' as const,
            phoneNumber: this.sessionMeta.get(workspaceId)?.phoneNumber,
          });

          // Registrar sessão no workspace
          await this.workspaces.setWppSession(workspaceId, workspaceId);

          // Se conectou sem QR (sessão restaurada), resolve aqui
          resolve({ status: 'already_connected' });

          // Evento de mensagem recebida
          client.onMessage((msg) => {
            void (async () => {
              const body = (msg.body ?? '').toString();
              const from = msg.from; // e.g. 5511999999999@c.us

              this.logger.log(
                `[WHATSAPP] Mensagem recebida no workspace=${workspaceId}: ${body}`,
              );
              this.slog.info('incoming_message', { workspaceId, body, from });

              // Deduplicação básica por workspace + contato + hash da mensagem (60s)
              try {
                const dedupeKey = `incoming:wpp:${workspaceId}:${from}:${this.normalizeHash(body)}`;
                const already = await this.redis.get(dedupeKey);
                if (already) {
                  this.slog.info('incoming_deduped_wpp', { workspaceId, from });
                  return;
                }
                await this.redis.setex(dedupeKey, 60, '1');
              } catch (dedupeErr: any) {
                this.logger.warn(`Dedup WPP failed: ${dedupeErr?.message}`);
              }

              // Detectar tipo de mídia
              let messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'STICKER' = 'TEXT';
              let mediaUrl: string | undefined;
              let processedContent = body;

              // WPPConnect message types: chat, image, video, audio, ptt (push-to-talk voice), document, sticker
              const msgType = (msg as any).type || 'chat';
              const contactPhone = from.replace('@c.us', '');
              
              switch (msgType) {
                case 'image':
                  messageType = 'IMAGE';
                  // Tentar extrair URL da mídia se disponível
                  mediaUrl = (msg as any).mediaUrl || (msg as any).deprecatedMms3Url;
                  processedContent = body || '[Imagem recebida]';
                  break;
                case 'video':
                  messageType = 'VIDEO';
                  mediaUrl = (msg as any).mediaUrl || (msg as any).deprecatedMms3Url;
                  processedContent = body || '[Vídeo recebido]';
                  break;
                case 'audio':
                case 'ptt': // Push-to-talk voice message
                  messageType = 'AUDIO';
                  mediaUrl = (msg as any).mediaUrl || (msg as any).deprecatedMms3Url;
                  processedContent = '[Áudio recebido - transcrição pendente]';
                  
                  // Enfileirar para transcrição via Whisper
                  if (mediaUrl) {
                    this.logger.log(`🎤 [WHATSAPP] Enfileirando áudio para transcrição: ${from}`);
                    await voiceQueue.add('transcribe-audio', {
                      workspaceId,
                      phone: contactPhone,
                      mediaUrl,
                      messageType: msgType,
                      originalBody: body,
                    });
                  }
                  
                  this.logger.log(`🎤 [WHATSAPP] Áudio recebido de ${from} - tipo: ${msgType}`);
                  break;
                case 'document':
                  messageType = 'DOCUMENT';
                  mediaUrl = (msg as any).mediaUrl || (msg as any).deprecatedMms3Url;
                  const fileName = (msg as any).filename || 'documento';
                  processedContent = body || `[Documento: ${fileName}]`;
                  break;
                case 'sticker':
                  messageType = 'STICKER';
                  processedContent = '[Sticker recebido]';
                  break;
                default:
                  messageType = 'TEXT';
                  processedContent = body;
              }

              // 1. Persistir no Inbox (DB + WebSocket)
              const savedMessage = await this.inbox.saveMessageByPhone({
                workspaceId,
                phone: contactPhone,
                content: processedContent,
                direction: 'INBOUND',
                type: messageType,
                mediaUrl,
              });

              // 2. Entrega para o FlowEngine (via Redis)
              // Passa o tipo de mídia para contexto da IA
              await this.deliverToContext(
                contactPhone, 
                messageType === 'AUDIO' ? `[ÁUDIO] ${processedContent}` : processedContent, 
                workspaceId
              );

              // 3. 🔥 CRITICAL FIX: Enfileira Autopilot para avaliação/ação assíncrona
              // Antes essa chamada estava faltando, causando o bug onde mensagens via WPPConnect
              // não acionavam o Autopilot (apenas mensagens via webhook acionavam)
              try {
                const ws = await this.workspaces.getWorkspace(workspaceId).catch(() => null);
                const settings = ws?.providerSettings || {};
                
                if (settings?.autopilot?.enabled) {
                  this.logger.log(`🤖 [AUTOPILOT] Enfileirando mensagem WPPConnect para análise: ${contactPhone}`);
                  await autopilotQueue.add('scan-message', {
                    workspaceId,
                    phone: contactPhone,
                    contactId: savedMessage?.contactId,
                    messageContent: processedContent,
                  });
                }

                // Sinais de compra em tempo real -> dispara flow quente, se configurado
                const hotFlowId = (settings as any)?.autopilot?.hotFlowId;
                const lowerContent = (processedContent || '').toLowerCase();
                const buyKeywords = ['preco', 'preço', 'price', 'quanto', 'pix', 'boleto', 'garantia', 'comprar', 'assinar'];
                const hasBuyingSignal = buyKeywords.some((k) => lowerContent.includes(k));
                
                if (hotFlowId && hasBuyingSignal) {
                  this.logger.log(`🔥 [HOT_SIGNAL] Sinal de compra detectado de ${contactPhone}`);
                  await flowQueue.add('run-flow', {
                    workspaceId,
                    flowId: hotFlowId,
                    user: contactPhone,
                    initialVars: { source: 'hot_signal', lastMessage: processedContent },
                  });
                }
              } catch (autopilotError: any) {
                this.logger.warn(`[AUTOPILOT] Erro ao enfileirar: ${autopilotError?.message}`);
              }
            })();
          });
        })

        .catch((err) => {
          this.logger.error('[SERVICE] Erro ao criar sessão:', err);
          this.slog.error('session_error', {
            workspaceId,
            error: err?.message,
          });

          resolve({
            error: true,
            message: err.message,
          });
        });
    });
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
    // 🔥 Enviar via Worker → FlowEngine → WhatsAppEngine (multi-provedor)
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
  // 2c. LISTAR TEMPLATES META (Cloud API)
  // ============================================================
  async listTemplates(workspaceId: string) {
    const ws = await this.workspaces.getWorkspace(workspaceId);
    const settings = (ws.providerSettings as any) || {};
    const token = settings.meta?.token;
    const wabaId = settings.meta?.wabaId;

    if (!token || !wabaId) {
      return {
        error: true,
        message: 'Credenciais Meta ausentes para este workspace',
      };
    }

    const cacheKey = `meta:templates:${workspaceId}`;
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // ignore malformed cache
      }
    }

    let url = `https://graph.facebook.com/v19.0/${wabaId}/message_templates?access_token=${token}`;
    const templates: any[] = [];
    let page = 0;
    const maxPages = 5; // safety cap

    while (url && page < maxPages) {
      page++;
      const res = await fetch(url, { method: 'GET' });
      const data = await res.json();
      if (Array.isArray(data?.data)) {
        templates.push(...data.data);
      }
      url = data?.paging?.next;
    }

    const result = { data: templates, total: templates.length };

    // cache for 5 minutes
    try {
      await this.redis.setex(cacheKey, 300, JSON.stringify(result));
    } catch {
      // best-effort cache
    }

    return result;
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

    this.slog.info('contact_opted_in', { workspaceId, phone, contactId: contact.id });

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

    this.slog.info('contact_opted_out', { workspaceId, phone, contactId: contact.id });

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
        optedOutAt: contact.optedOutAt 
      });
      throw new ForbiddenException('Contato cancelou o recebimento de mensagens (opt-out)');
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
  // 2b. SEND TEMPLATE (WhatsApp Cloud API)
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
  // 3. SEND MESSAGE DIRECTLY USING WPPConnect (test mode only)
  // ============================================================
  async sendDirectWPP(workspaceId: string, to: string, message: string) {
    const ws = await this.workspaces.getWorkspace(workspaceId);
    const settings = ws.providerSettings as any;

    if (settings.whatsappProvider !== 'wpp') {
      this.slog.warn('send_direct_blocked_wrong_provider', {
        workspaceId,
        provider: settings.whatsappProvider,
      });
      return {
        error: true,
        message:
          'Este workspace não usa WPPConnect, portanto não pode enviar mensagem direta.',
      };
    }

    const client = this.sessions.get(workspaceId);

    if (!client) {
      this.slog.warn('send_direct_no_session', { workspaceId });
      return {
        error: true,
        message: 'Sessão WPPConnect não encontrada. Gere o QR Code novamente.',
      };
    }

    const normalized = this.normalizeNumber(to);
    const jid = `${normalized}@c.us`;

    try {
      const result = await client.sendText(jid, message);
      return { success: true, result };
    } catch (err) {
      this.logger.error('Erro ao enviar mensagem direta:', err);
      this.slog.error('send_direct_error', {
        workspaceId,
        to,
        error: err?.message,
      });
      return { error: true, message: err.message };
    }
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
    const stopKeywords = ['stop', 'sair', 'cancelar', 'cancel', 'parar', 'unsubscribe'];
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

    // 3. Enfileira Autopilot (worker) para avaliação/ação assíncrona (somente se habilitado)
    try {
      const settings = ws.providerSettings || {};
      if (settings?.autopilot?.enabled) {
        await autopilotQueue.add('scan-message', {
          workspaceId,
          phone: from,
          contactId: saved?.contactId,
          messageContent: message,
        });
      }

      // Sinais de compra em tempo real -> dispara flow quente, se configurado
      const hotFlowId = (settings as any)?.autopilot?.hotFlowId;
      const lower = (message || '').toLowerCase();
      const buyKeywords = ['preco', 'preço', 'price', 'quanto', 'pix', 'boleto', 'garantia', 'comprar', 'assinar'];
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
      const hasConversionSignal = conversionKeywords.some((k) => lower.includes(k));
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
    return Buffer.from(text || '').toString('base64').slice(0, 32);
  }

  // ============================================================
  // 5. RETORNAR CLIENTE WPP
  // ============================================================
  getSession(workspaceId: string) {
    return this.sessions.get(workspaceId);
  }

  /** Retorna status e phone da sessão WPPConnect */
  async getConnectionStatus(workspaceId: string) {
    if (!this.sessionMeta.has(workspaceId)) {
      await this.loadSessionMeta(workspaceId);
    }
    const meta = this.sessionMeta.get(workspaceId) || {};
    const isConnected = this.sessions.has(workspaceId);
    return {
      status: meta.status || (isConnected ? 'connected' : 'disconnected'),
      phoneNumber: meta.phoneNumber,
      qrCode: meta.qrCode,
    };
  }

  /** Último QR gerado em memória */
  async getQrCode(workspaceId: string) {
    if (!this.sessionMeta.has(workspaceId)) {
      await this.loadSessionMeta(workspaceId);
    }
    return this.sessionMeta.get(workspaceId)?.qrCode || null;
  }

  /** Desconecta sessão WPPConnect e limpa metadados */
  async disconnect(workspaceId: string) {
    const client = this.sessions.get(workspaceId);
    if (client?.logout) {
      try {
        await client.logout();
      } catch (err) {
        this.logger.warn(`Erro ao deslogar sessão WPPConnect: ${workspaceId}`, err as any);
      }
    }
    this.sessions.delete(workspaceId);
    this.sessionMeta.delete(workspaceId);
    try {
      await this.redis.del(this.sessionMetaKey(workspaceId));
    } catch (err) {
      this.logger.warn(`Falha ao limpar meta da sessão: ${workspaceId} -> ${(err as any)?.message}`);
    }
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
    const provider = workspace?.whatsappProvider || 'auto';

    if (provider === 'wpp' && !workspace?.wpp?.sessionId) {
      missing.push('wpp.sessionId');
    }
    if (
      provider === 'meta' &&
      (!workspace?.meta?.token || !workspace?.meta?.phoneId)
    ) {
      missing.push('meta.token/phoneId');
    }
    if (provider === 'evolution' && !workspace?.evolution?.apiKey) {
      missing.push('evolution.apiKey');
    }
    if (provider === 'ultrawa' && !workspace?.ultrawa?.apiKey) {
      missing.push('ultrawa.apiKey');
    }

    return missing;
  }
}
