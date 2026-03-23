import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  ForbiddenException,
  Headers,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type Redis from 'ioredis';
import { Prisma } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  InboundMessage,
  InboundProcessorService,
} from '../whatsapp/inbound-processor.service';
import { resolveWahaSessionState } from '../whatsapp/providers/whatsapp-api.provider';
import { CiaRuntimeService } from '../whatsapp/cia-runtime.service';
import { WhatsAppCatchupService } from '../whatsapp/whatsapp-catchup.service';
import { AgentEventsService } from '../whatsapp/agent-events.service';
import { WhatsAppApiProvider } from '../whatsapp/providers/whatsapp-api.provider';

/**
 * =====================================================================
 * WAHA Webhook Controller
 *
 * Recebe webhooks do WAHA (WhatsApp HTTP API)
 * Eventos: message, session.status, message.ack, etc.
 * Docs: https://waha.devlike.pro/docs/overview/webhooks/
 * =====================================================================
 */

interface WahaWebhookPayload {
  event: string;
  session: string;
  payload: any;
  engine?: string;
  environment?: any;
}

interface ResolvedWorkspace {
  id: string;
  providerSettings?: Prisma.JsonValue;
}

@Controller('webhooks/whatsapp-api')
export class WhatsAppApiWebhookController {
  private readonly logger = new Logger(WhatsAppApiWebhookController.name);

  private isBrowserOnlyMode(): boolean {
    const explicit = String(process.env.WHATSAPP_BROWSER_ONLY || '')
      .trim()
      .toLowerCase();
    if (explicit) {
      return explicit !== 'false';
    }

    return (
      String(process.env.WHATSAPP_PROVIDER_DEFAULT || '').trim() ===
      'whatsapp-web-agent'
    );
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly inboundProcessor: InboundProcessorService,
    private readonly catchupService: WhatsAppCatchupService,
    private readonly agentEvents: AgentEventsService,
    private readonly ciaRuntime: CiaRuntimeService,
    private readonly whatsappApi: WhatsAppApiProvider,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  @Public()
  @Post()
  @Throttle({ default: { limit: 2000, ttl: 60000 } })
  @HttpCode(200)
  async handleWebhook(
    @Body() body: WahaWebhookPayload,
    @Headers('x-api-key') apiKey?: string,
    @Headers('x-webhook-secret') webhookSecret?: string,
  ) {
    const expected =
      process.env.WHATSAPP_API_WEBHOOK_SECRET ||
      process.env.WAHA_WEBHOOK_SECRET;
    if (expected) {
      const provided = apiKey || webhookSecret;
      if (!provided || provided !== expected) {
        this.logger.warn('Webhook rejected: invalid secret');
        throw new ForbiddenException('Invalid webhook secret');
      }
    }

    const safeBody = body || ({} as WahaWebhookPayload);
    const { event, session: sessionId, payload } = safeBody;

    if (!event || !sessionId) {
      this.logger.warn('Ignoring malformed WAHA webhook without event/session');
      return { received: true, error: 'invalid_payload' };
    }

    if (this.isBrowserOnlyMode()) {
      this.logger.debug(
        `Ignoring WAHA webhook in browser-only mode: ${event} for session ${sessionId}`,
      );
      return {
        received: true,
        ignored: true,
        reason: 'browser_only_mode',
      };
    }

    this.logger.log(`WAHA webhook: ${event} for session ${sessionId}`);

    const workspace = await this.resolveWorkspaceForSession(sessionId, payload);

    if (!workspace) {
      this.logger.warn(`Ignoring webhook for unknown workspace ${sessionId}`);
      return { received: true, error: 'workspace_not_found' };
    }

    try {
      switch (event) {
        case 'session.status':
          await this.handleSessionStatus(workspace, sessionId, payload);
          break;

        case 'message':
          await this.handleIncomingMessage(workspace, sessionId, payload);
          break;

        case 'message.ack':
          await this.handleMessageAck(workspace.id, payload);
          break;

        case 'message.any':
          // message.any includes both sent and received
          await this.handleIncomingMessage(workspace, sessionId, payload);
          break;

        default:
          this.logger.debug(`Unhandled WAHA event: ${event}`);
      }

      return { received: true, event };
    } catch (err: any) {
      this.logger.error(`Webhook processing error: ${err.message}`);
      return { received: true, error: err.message };
    }
  }

  private async handleSessionStatus(
    workspace: ResolvedWorkspace,
    sessionId: string,
    data: any,
  ) {
    const resolvedStatus = resolveWahaSessionState(data);
    const rawStatus = resolvedStatus.rawStatus;
    const connected = resolvedStatus.state === 'CONNECTED';
    const normalizedStatus =
      resolvedStatus.state === 'CONNECTED'
        ? 'connected'
        : resolvedStatus.state === 'SCAN_QR_CODE'
          ? 'qr_pending'
          : resolvedStatus.state === 'STARTING'
            ? 'starting'
            : resolvedStatus.state === 'DISCONNECTED'
              ? 'disconnected'
              : resolvedStatus.state === 'FAILED'
                ? 'failed'
                : rawStatus.toLowerCase();
    const identity = this.extractSessionIdentity(data);

    this.logger.log(
      `Session status change: ${sessionId} -> ${rawStatus} (workspace=${workspace.id})`,
    );

    await this.updateWorkspaceSession(workspace.id, sessionId, {
      status: normalizedStatus,
      qrCode: null,
      disconnectReason: connected ? null : rawStatus,
      phoneNumber: connected ? identity.phoneNumber : null,
      pushName: connected ? identity.pushName : null,
      connectedAt: connected ? new Date().toISOString() : null,
      rawStatus,
      selfIds: connected ? identity.selfIds : undefined,
    });

    if (connected) {
      await this.resetAutonomyRuntimeState(
        workspace.id,
        'session_status_connected',
      );
      await this.agentEvents.publish({
        type: 'status',
        workspaceId: workspace.id,
        phase: 'session_connected',
        persistent: true,
        message:
          'Consegui acessar seu WhatsApp. Vou iniciar a sincronização agora.',
        meta: {
          phoneNumber: identity.phoneNumber,
          pushName: identity.pushName,
        },
      });
      void (async () => {
        try {
          const catchup = await this.catchupService.runCatchupNow(
            workspace.id,
            'session_status_connected',
          );
          if (!catchup.scheduled) {
            this.logger.warn(
              `Catch-up did not start for workspace ${workspace.id}: ${'reason' in catchup ? catchup.reason || 'unknown_reason' : 'unknown_reason'}`,
            );
          }
        } catch (err: any) {
          this.logger.warn(
            `Failed to run catch-up for workspace ${workspace.id}: ${err?.message || 'unknown_error'}`,
          );
        }

        try {
          await this.tryBootstrapAutonomy(workspace);
        } catch (err: any) {
          this.logger.warn(
            `Failed to bootstrap autonomy for workspace ${workspace.id}: ${err?.message || 'unknown_error'}`,
          );
        }
      })();
    } else if (
      resolvedStatus.state === 'FAILED' ||
      resolvedStatus.state === 'DISCONNECTED' ||
      resolvedStatus.state === 'SCAN_QR_CODE'
    ) {
      await this.resetAutonomyRuntimeState(
        workspace.id,
        `session_status_${normalizedStatus}`,
      );
      await this.agentEvents.publish({
        type: resolvedStatus.state === 'SCAN_QR_CODE' ? 'status' : 'error',
        workspaceId: workspace.id,
        phase:
          resolvedStatus.state === 'SCAN_QR_CODE'
            ? 'session_qr_required'
            : 'session_error',
        persistent: true,
        message:
          resolvedStatus.state === 'SCAN_QR_CODE'
            ? 'Seu WhatsApp precisa ser reconectado. Abra o QR code novamente.'
            : `A sessão do WhatsApp mudou para ${rawStatus.toLowerCase()}.`,
        meta: {
          status: rawStatus,
        },
      });
    }
  }

  private async handleIncomingMessage(
    workspace: ResolvedWorkspace,
    sessionId: string,
    msg: any,
  ) {
    if (!msg) return;
    if (!(await this.shouldProcessWebhookMessage(workspace, msg))) return;
    const inbound = this.mapWebhookMessage(workspace.id, msg);
    if (!inbound) return;

    const result = await this.inboundProcessor.process(inbound);
    if (!result.deduped) {
      this.logger.log(
        `Incoming message processed from ${inbound.from} in workspace ${workspace.id}`,
      );
    }

    await this.maybeRecoverAutonomyFromLiveMessage(workspace, sessionId).catch(
      (err: any) => {
        this.logger.warn(
          `Failed to recover autonomy from live message for workspace ${workspace.id}: ${err?.message || 'unknown_error'}`,
        );
      },
    );
  }

  private async tryBootstrapAutonomy(workspace: ResolvedWorkspace) {
    const settings = (workspace.providerSettings as any) || {};
    const autonomy = settings?.autonomy || {};
    if (autonomy.autoBootstrapOnConnected === false) {
      return;
    }

    if (this.isRuntimeLikelyStale(settings)) {
      await this.resetAutonomyRuntimeState(
        workspace.id,
        'stale_runtime_before_bootstrap',
      );
    }

    try {
      const lockKey = `cia:bootstrap:${workspace.id}`;
      const locked = await this.redis.set(lockKey, '1', 'EX', 120, 'NX');
      if (locked !== 'OK') {
        return;
      }

      await this.ciaRuntime.bootstrap(workspace.id);
    } catch (err: any) {
      this.logger.warn(
        `Failed to auto-bootstrap autonomy for workspace ${workspace.id}: ${err.message}`,
      );
    }
  }

  private async maybeRecoverAutonomyFromLiveMessage(
    workspace: ResolvedWorkspace,
    sessionId: string,
  ) {
    const settings = (workspace.providerSettings as any) || {};
    const sessionMeta = (settings.whatsappApiSession || {}) as Record<
      string,
      any
    >;
    const sessionKnown =
      settings?.whatsappProvider === 'whatsapp-api' ||
      Boolean(sessionMeta?.sessionName);
    const connected =
      String(sessionMeta?.status || settings?.connectionStatus || '')
        .trim()
        .toLowerCase() === 'connected';
    const autonomyMode = String(settings?.autonomy?.mode || '')
      .trim()
      .toUpperCase();
    const runtimeState = String(settings?.ciaRuntime?.state || '')
      .trim()
      .toUpperCase();
    const autonomyPersisted = Boolean(autonomyMode);
    const runtimeAlreadyActive =
      runtimeState === 'LIVE_READY' ||
      runtimeState === 'LIVE_AUTONOMY' ||
      runtimeState === 'EXECUTING_IMMEDIATELY' ||
      runtimeState === 'EXECUTING_BACKLOG';

    if (
      connected &&
      sessionKnown &&
      (autonomyPersisted || runtimeAlreadyActive) &&
      !this.isRuntimeLikelyStale(settings)
    ) {
      return;
    }

    if (this.isRuntimeLikelyStale(settings)) {
      await this.resetAutonomyRuntimeState(
        workspace.id,
        'stale_runtime_from_live_message',
      );
    }

    if (!connected || !sessionKnown) {
      await this.updateWorkspaceSession(workspace.id, sessionId, {
        status: 'connected',
        disconnectReason: null,
        rawStatus: 'LIVE_MESSAGE_OBSERVED',
        connectedAt: new Date().toISOString(),
      });
    }

    void this.catchupService.triggerCatchup(
      workspace.id,
      'live_message_observed',
    );
    void this.tryBootstrapAutonomy(workspace);
  }

  private isRuntimeLikelyStale(settings: Record<string, any> | null | undefined) {
    const autonomyMode = String(settings?.autonomy?.mode || '')
      .trim()
      .toUpperCase();
    const runtime = (settings?.ciaRuntime || {}) as Record<string, any>;
    const runtimeState = String(runtime.state || '').trim().toUpperCase();
    const currentRunId = String(runtime.currentRunId || '').trim();
    const lastBootstrapAt = Date.parse(
      String(
        runtime.lastBootstrapAt ||
          runtime.startedAt ||
          runtime.lastTransitionAt ||
          '',
      ),
    );

    if (currentRunId) {
      return false;
    }

    const appearsActive =
      ['LIVE', 'BACKLOG', 'FULL'].includes(autonomyMode) ||
      ['LIVE_READY', 'LIVE_AUTONOMY', 'EXECUTING_IMMEDIATELY', 'EXECUTING_BACKLOG'].includes(
        runtimeState,
      );

    if (!appearsActive) {
      return false;
    }

    if (!Number.isFinite(lastBootstrapAt) || lastBootstrapAt <= 0) {
      return false;
    }

    return Date.now() - lastBootstrapAt > 60 * 60 * 1000;
  }

  private async resetAutonomyRuntimeState(
    workspaceId: string,
    reason: string,
  ): Promise<void> {
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      });
      if (!workspace) return;

      const settings = (workspace.providerSettings as any) || {};
      const autonomy = (settings.autonomy || {}) as Record<string, any>;
      const runtime = (settings.ciaRuntime || {}) as Record<string, any>;
      const sessionMeta = (settings.whatsappApiSession || {}) as Record<
        string,
        any
      >;
      const autonomyMode = String(autonomy.mode || '')
        .trim()
        .toUpperCase();
      const preserveManualBlock =
        autonomyMode === 'HUMAN_ONLY' || autonomyMode === 'SUSPENDED';
      const now = new Date().toISOString();

      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          providerSettings: {
            ...settings,
            autonomy: preserveManualBlock
              ? {
                  ...autonomy,
                  lastRuntimeResetAt: now,
                  lastRuntimeResetReason: reason,
                }
              : {
                  ...autonomy,
                  mode: null,
                  lastRuntimeResetAt: now,
                  lastRuntimeResetReason: reason,
                },
            ciaRuntime: {
              ...runtime,
              state: null,
              currentRunId: null,
              mode: null,
              autoStarted: false,
              lastRuntimeResetAt: now,
              lastRuntimeResetReason: reason,
            },
            whatsappApiSession: {
              ...sessionMeta,
              recoveryBlockedReason: null,
              recoveryBlockedAt: null,
              lastCatchupError: null,
            },
          },
        },
      });
    } catch (error: any) {
      this.logger.warn(
        `Failed to reset autonomy runtime for ${workspaceId}: ${error?.message || 'unknown_error'}`,
      );
    }

    const redisDel = (this.redis as any)?.del;
    if (typeof redisDel === 'function') {
      await redisDel
        .call(
          this.redis,
          `cia:bootstrap:${workspaceId}`,
          `whatsapp:catchup:${workspaceId}`,
          `whatsapp:catchup:cooldown:${workspaceId}`,
        )
        .catch(() => undefined);
    }
  }

  private async handleMessageAck(workspaceId: string, data: any) {
    const messageId = data?.id;
    const ack = data?.ack;
    if (!messageId) return;

    const ackMap: Record<number, string> = {
      1: 'sent',
      2: 'delivered',
      3: 'read',
      4: 'played',
    };

    try {
      await this.prisma.message.updateMany({
        where: { workspaceId, externalId: messageId },
        data: { status: ackMap[ack] || 'unknown' },
      });
    } catch {
      // Silently ignore
    }
  }

  private async updateWorkspaceSession(
    workspaceId: string,
    sessionName: string,
    update: {
      status?: string;
      qrCode?: string | null;
      disconnectReason?: string | null;
      phoneNumber?: string | null;
      pushName?: string | null;
      connectedAt?: string | null;
      rawStatus?: string | null;
      selfIds?: string[] | null;
    },
  ) {
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true },
      });
      if (!workspace) return;

      const settings = (workspace.providerSettings as any) || {};
      const sessionMeta = settings.whatsappApiSession || {};
      const nowIso = new Date().toISOString();
      const isDisconnectedStatus = ['disconnected', 'failed', 'qr_pending'].includes(
        String(update.status || '').trim().toLowerCase(),
      );
      const lastDisconnectAt = String(sessionMeta.lastDisconnectAt || '').trim();
      const disconnectWithin24h =
        lastDisconnectAt &&
        Date.now() - new Date(lastDisconnectAt).getTime() < 24 * 60 * 60 * 1000;
      const nextDisconnectCount24h = isDisconnectedStatus
        ? disconnectWithin24h
          ? Number(sessionMeta.disconnectCount24h || 0) + 1
          : 1
        : Number(sessionMeta.disconnectCount24h || 0) || 0;

      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          providerSettings: {
            ...settings,
            connectionStatus:
              update.status || settings.connectionStatus || null,
            whatsappApiSession: {
              ...sessionMeta,
              sessionName,
              ...update,
              selfIds:
                update.selfIds && update.selfIds.length > 0
                  ? Array.from(new Set(update.selfIds.filter(Boolean)))
                  : sessionMeta.selfIds || [],
              lastUpdated: nowIso,
              lastHeartbeatAt:
                update.status === 'connected' ? nowIso : sessionMeta.lastHeartbeatAt || null,
              lastSeenWorkingAt:
                update.status === 'connected' ? nowIso : sessionMeta.lastSeenWorkingAt || null,
              lastDisconnectAt: isDisconnectedStatus
                ? nowIso
                : sessionMeta.lastDisconnectAt || null,
              disconnectCount24h: nextDisconnectCount24h,
              sessionFlapping: nextDisconnectCount24h >= 3,
            },
          },
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to update workspace session: ${err.message}`);
    }
  }

  private extractSessionIdentity(data: any): {
    phoneNumber: string | null;
    pushName: string | null;
    selfIds: string[];
  } {
    return {
      phoneNumber: data?.me?.id || data?.phone || data?.phoneNumber || null,
      pushName: data?.me?.pushName || data?.pushName || data?.name || null,
      selfIds: Array.from(
        new Set(
          [
            data?.me?.id,
            data?.me?.lid,
            data?.me?._serialized,
            data?.phone,
            data?.phoneNumber,
          ]
            .map((value) => String(value || '').trim())
            .filter(Boolean),
        ),
      ),
    };
  }

  private async shouldProcessWebhookMessage(
    workspace: ResolvedWorkspace,
    msg: any,
  ): Promise<boolean> {
    if (msg?.fromMe !== true) {
      return true;
    }

    const settings = (workspace.providerSettings as any) || {};
    const includeFromMe = settings?.whatsappApiSession?.includeFromMe === true;

    if (!includeFromMe) {
      return false;
    }

    const providerMessageId = this.extractProviderMessageId(msg);
    if (!providerMessageId) {
      return false;
    }

    const shouldIgnore = await this.redis.get(
      `whatsapp:from-me:ignore:${workspace.id}:${providerMessageId}`,
    );

    return !shouldIgnore;
  }

  private async resolveWorkspaceForSession(
    sessionId: string,
    payload?: any,
  ): Promise<ResolvedWorkspace | null> {
    const direct = await this.prisma.workspace.findUnique({
      where: { id: sessionId },
      select: { id: true, providerSettings: true },
    });
    if (direct) {
      return direct;
    }

    const candidates = await this.prisma.workspace.findMany({
      where: {
        providerSettings: { not: Prisma.DbNull },
      },
      select: { id: true, providerSettings: true },
    });

    const wahaCandidates = candidates.filter((workspace) => {
      const settings = (workspace.providerSettings as any) || {};
      return (
        settings?.whatsappProvider === 'whatsapp-api' ||
        settings?.whatsappApiSession
      );
    });

    const bySessionName = wahaCandidates.find((workspace) => {
      const settings = (workspace.providerSettings as any) || {};
      return settings?.whatsappApiSession?.sessionName === sessionId;
    });
    if (bySessionName) {
      return bySessionName;
    }

    const identity =
      (await this.resolveSessionIdentity(sessionId, payload).catch(() => null)) ||
      null;
    const identityPhone = this.normalizePhone(identity?.phoneNumber);
    const identityName = this.normalizeName(identity?.pushName);

    if (identityPhone || identityName) {
      const identityMatches = wahaCandidates.filter((workspace) => {
        const settings = (workspace.providerSettings as any) || {};
        const sessionMeta = (settings?.whatsappApiSession || {}) as Record<
          string,
          any
        >;
        const storedPhone = this.normalizePhone(sessionMeta?.phoneNumber);
        const storedName = this.normalizeName(sessionMeta?.pushName);

        if (identityPhone && storedPhone && identityPhone === storedPhone) {
          return true;
        }

        if (identityName && storedName && identityName === storedName) {
          return true;
        }

        return false;
      });

      if (identityMatches.length === 1) {
        const matchedWorkspace = identityMatches[0];
        await this.updateWorkspaceSession(matchedWorkspace.id, sessionId, {
          status: 'connected',
          disconnectReason: null,
          phoneNumber: identity?.phoneNumber || null,
          pushName: identity?.pushName || null,
          connectedAt: new Date().toISOString(),
          rawStatus: 'SESSION_RECOVERED_BY_IDENTITY',
          selfIds: Array.from(
            new Set(
              [
                identity?.phoneNumber,
                ...(Array.isArray((identity as any)?.selfIds)
                  ? (identity as any).selfIds
                  : []),
              ]
                .map((value) => String(value || '').trim())
                .filter(Boolean),
            ),
          ),
        });
        return matchedWorkspace;
      }

      if (identityMatches.length > 1) {
        this.logger.warn(
          `Session identity for ${sessionId} matched ${identityMatches.length} workspaces; refusing automatic reassignment`,
        );
      }
    }

    const singleSessionOverride = (process.env.WAHA_SESSION_ID || '').trim();
    const explicitSingleSession =
      process.env.WAHA_SINGLE_SESSION === 'true' ||
      process.env.WAHA_MULTISESSION === 'false' ||
      process.env.WAHA_USE_WORKSPACE_SESSION === 'false';
    const defaultSingleSessionName = singleSessionOverride || 'default';

    if (
      explicitSingleSession &&
      sessionId === defaultSingleSessionName &&
      wahaCandidates.length === 1
    ) {
      return wahaCandidates[0];
    }

    if (
      explicitSingleSession &&
      sessionId === defaultSingleSessionName &&
      wahaCandidates.length > 1
    ) {
      this.logger.warn(
        `Single-session webhook for ${sessionId} is ambiguous across ${wahaCandidates.length} workspaces`,
      );
    }

    return null;
  }

  private normalizePhone(value?: string | null): string {
    return String(value || '').replace(/\D/g, '');
  }

  private normalizeName(value?: string | null): string {
    return String(value || '').trim().toLowerCase();
  }

  private async resolveSessionIdentity(
    sessionId: string,
    payload?: any,
  ): Promise<{ phoneNumber?: string | null; pushName?: string | null; selfIds?: string[] }> {
    const payloadIdentity = this.extractSessionIdentity(payload);
    if (payloadIdentity.phoneNumber || payloadIdentity.pushName) {
      return payloadIdentity;
    }

    const remote = await this.whatsappApi.getSessionStatus(sessionId);
    return {
      phoneNumber: remote?.phoneNumber || null,
      pushName: remote?.pushName || null,
      selfIds: Array.from(
        new Set(
          [remote?.phoneNumber]
            .map((value) => String(value || '').trim())
            .filter(Boolean),
        ),
      ),
    };
  }

  private mapWebhookMessage(
    workspaceId: string,
    message: any,
  ): InboundMessage | null {
    const providerMessageId = this.extractProviderMessageId(message);
    const from = this.resolvePreferredChatId(message);

    if (!providerMessageId || !from) {
      return null;
    }

    return {
      workspaceId,
      provider: 'whatsapp-api',
      ingestMode: 'live',
      providerMessageId,
      from,
      to: this.resolvePreferredChatId(message?.to) || message?.to,
      senderName: this.extractSenderName(message),
      type: this.mapInboundType(message?.type),
      text: message?.body || message?.text?.body || '',
      mediaUrl: message?.mediaUrl || message?.media?.url,
      mediaMime: message?.mimetype || message?.media?.mimetype,
      raw: message,
    };
  }

  private extractProviderMessageId(message: any): string | null {
    const providerMessageId =
      message?.id?._serialized ||
      message?.id?.id ||
      message?.key?.id ||
      message?.id;

    if (typeof providerMessageId !== 'string') {
      return null;
    }

    const normalized = providerMessageId.trim();
    return normalized || null;
  }

  private extractSenderName(message: any): string | undefined {
    const candidates = [
      message?._data?.pushName,
      message?.pushName,
      message?._data?.notifyName,
      message?.notifyName,
      message?.senderName,
      message?.author,
    ];

    for (const candidate of candidates) {
      if (typeof candidate !== 'string') {
        continue;
      }

      const normalized = candidate.trim();
      if (normalized) {
        return normalized;
      }
    }

    return undefined;
  }

  private resolvePreferredChatId(payload: any): string | null {
    const candidates = [
      payload?._data?.key?.remoteJidAlt,
      payload?.key?.remoteJidAlt,
      payload?.remoteJidAlt,
      payload?.chatId,
      payload?.from,
      payload?._data?.key?.remoteJid,
      payload?.key?.remoteJid,
      payload?.id,
    ]
      .filter((candidate) => typeof candidate === 'string')
      .map((candidate) => String(candidate).trim())
      .filter(Boolean);

    if (!candidates.length) {
      return null;
    }

    const preferred =
      candidates.find((candidate) => !candidate.includes('@lid')) ||
      candidates[0];

    return preferred || null;
  }

  private mapInboundType(type?: string): InboundMessage['type'] {
    const normalized = String(type || '').toLowerCase();
    if (normalized === 'chat' || normalized === 'text') return 'text';
    if (normalized === 'audio' || normalized === 'ptt') return 'audio';
    if (normalized === 'image') return 'image';
    if (normalized === 'document') return 'document';
    if (normalized === 'video') return 'video';
    if (normalized === 'sticker') return 'sticker';
    return 'unknown';
  }
}
