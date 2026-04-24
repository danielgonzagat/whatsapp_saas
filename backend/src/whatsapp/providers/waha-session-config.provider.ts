// PULSE:OK — session config/diagnostics layer for WAHA.
// Session lifecycle lives in WahaSessionProvider (waha-session.provider.ts).
// Messaging lives in WahaProvider (waha.provider.ts).
import { Injectable } from '@nestjs/common';
import { isWahaInboundMessageEvent } from './waha-message-event-name';
import { ConfigService } from '@nestjs/config';
import { WahaTransport } from './waha-transport';
import {
  resolveWahaSessionState,
  type WahaRuntimeConfigDiagnostics,
  type WahaSessionConfigDiagnostics,
} from './waha-types';
import {
  normalizeEventList,
  resolveWebhookDiagnosticsFromConfig,
  resolveStoreDiagnosticsFromConfig,
  resolveSessionConfigMismatch,
  extractLidMappingsPayload,
  type WahaSessionConfigShape,
} from './waha-session-config.util';

export type WahaSessionConfig = WahaSessionConfigShape;

/**
 * Session config and diagnostics layer for WAHA.
 * Handles: session identity resolution, config building, webhook/store diagnostics,
 * mismatch detection, and getSessionConfigDiagnostics.
 *
 * WahaSessionProvider extends this class and adds session lifecycle methods.
 */
@Injectable()
export class WahaSessionConfigProvider extends WahaTransport {
  protected readonly sessionIdOverride: string;
  protected readonly useWorkspaceSessions: boolean;
  protected readonly sessionConfigSyncTtlMs: number;
  protected readonly sessionConfigSyncedAt = new Map<string, number>();
  protected readonly chatsOverviewTimeoutMs: number;
  protected readonly chatsOverviewFailureTtlMs: number;
  protected readonly skipChatsOverviewUntil = new Map<string, number>();
  protected readonly allowConnectedSessionConfigSync: boolean;

  constructor(configService: ConfigService) {
    super(configService, 'WahaProvider');

    this.sessionIdOverride = (this.configService.get<string>('WAHA_SESSION_ID') || '').trim();
    this.useWorkspaceSessions = this.resolveUseWorkspaceSessions(this.sessionIdOverride);

    this.sessionConfigSyncTtlMs = this.resolveBoundedIntConfig(
      'WAHA_SESSION_CONFIG_SYNC_TTL_MS',
      60_000,
      300_000,
    );
    this.chatsOverviewTimeoutMs = this.resolveBoundedIntConfig(
      'WAHA_CHATS_OVERVIEW_TIMEOUT_MS',
      500,
      3000,
    );
    this.chatsOverviewFailureTtlMs = this.resolveBoundedIntConfig(
      'WAHA_CHATS_OVERVIEW_FAILURE_TTL_MS',
      10_000,
      300_000,
    );
    this.allowConnectedSessionConfigSync = this.readBooleanEnv(
      ['WAHA_ALLOW_CONNECTED_SESSION_CONFIG_SYNC'],
      false,
    );

    if (!this.baseUrl) {
      this.logger.warn(
        'WAHA provider initialized without base URL. WAHA methods will stay disabled until WAHA_API_URL/WAHA_BASE_URL/WAHA_URL is configured.',
      );
    }

    this.logger.log(
      `WAHA provider initialized. Base URL: ${this.baseUrl}. Session mode: ${this.describeSessionMode()}`,
    );
  }

  // ─── Config helpers ────────────────────────────────────────

  private resolveUseWorkspaceSessions(sessionIdOverride: string): boolean {
    if (sessionIdOverride) {
      return false;
    }
    const explicitWorkspaceMode = this.hasAnyConfigTrue([
      'WAHA_MULTISESSION',
      'WAHA_USE_WORKSPACE_SESSION',
    ]);
    const explicitSingleSessionMode =
      this.configService.get<string>('WAHA_SINGLE_SESSION') === 'true' ||
      this.hasAnyConfigFalse(['WAHA_MULTISESSION', 'WAHA_USE_WORKSPACE_SESSION']);
    return explicitWorkspaceMode || !explicitSingleSessionMode;
  }

  protected hasAnyConfigTrue(keys: readonly string[]): boolean {
    return keys.some((key) => this.configService.get<string>(key) === 'true');
  }

  protected hasAnyConfigFalse(keys: readonly string[]): boolean {
    return keys.some((key) => this.configService.get<string>(key) === 'false');
  }

  protected resolveBoundedIntConfig(key: string, min: number, fallback: number): number {
    const raw = this.configService.get<string>(key) || String(fallback);
    const parsed = Number.parseInt(raw, 10) || fallback;
    return Math.max(min, parsed);
  }

  private describeSessionMode(): string {
    if (this.sessionIdOverride) {
      return `override(${this.sessionIdOverride})`;
    }
    return this.useWorkspaceSessions ? 'workspace' : 'default';
  }

  protected shouldAllowSessionWithoutWebhook(): boolean {
    return this.readBooleanEnv(['WAHA_ALLOW_SESSION_WITHOUT_WEBHOOK'], false);
  }

  // ─── Session identity / name resolution ───────────────────

  protected resolveSessionName(workspaceSessionId: string): string {
    const normalizedId = String(workspaceSessionId || '').trim();
    const normalizedOverride = this.sessionIdOverride.trim();

    if (normalizedId && normalizedId.toLowerCase() !== 'default') {
      return normalizedId;
    }
    if (normalizedOverride && normalizedOverride.toLowerCase() !== 'default') {
      return normalizedOverride;
    }
    if (normalizedId) {
      return normalizedId;
    }
    if (this.useWorkspaceSessions && normalizedId) {
      return normalizedId;
    }
    if (normalizedOverride) {
      return normalizedOverride;
    }
    return 'default';
  }

  /** Get resolved session id. */
  getResolvedSessionId(workspaceSessionId: string): string {
    return this.resolveSessionName(workspaceSessionId);
  }

  protected readRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  protected readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  protected readStringArray(values: unknown[]): string[] {
    return values
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim())
      .filter(Boolean);
  }

  protected resolveSessionIdentity(
    payload: unknown,
    options?: { allowTopLevelName?: boolean },
  ): { phoneNumber: string | null; pushName: string | null; selfIds: string[] } {
    const data = this.readRecord(payload);
    const me = this.readRecord(data.me);

    return {
      phoneNumber:
        this.readString(me.id) ||
        this.readString(me.phone) ||
        this.readString(data.phone) ||
        this.readString(data.phoneNumber) ||
        null,
      pushName:
        this.readString(me.pushName) ||
        this.readString(me.name) ||
        this.readString(data.pushName) ||
        (options?.allowTopLevelName !== false ? this.readString(data.name) : null) ||
        null,
      selfIds: Array.from(
        new Set(
          this.readStringArray([me.id, me.lid, me._serialized, data.phone, data.phoneNumber]),
        ),
      ),
    };
  }

  // ─── Runtime / session config diagnostics ─────────────────

  /** Get runtime config diagnostics. */
  getRuntimeConfigDiagnostics(): WahaRuntimeConfigDiagnostics {
    const webhookUrl = this.resolveWebhookUrl() || null;
    const events = this.resolveWebhookEvents();
    const inboundEventsConfigured = events.some(isWahaInboundMessageEvent);
    const storeEnabled = this.readBooleanEnv(
      ['WAHA_NOWEB_STORE_ENABLED', 'WAHA_STORE_ENABLED'],
      true,
    );
    const storeFullSync = this.readBooleanEnv(
      ['WAHA_NOWEB_STORE_FULL_SYNC', 'WAHA_STORE_FULL_SYNC'],
      true,
    );

    return {
      webhookUrl,
      webhookConfigured: Boolean(webhookUrl),
      inboundEventsConfigured,
      events,
      secretConfigured: Boolean(
        this.configService.get<string>('WHATSAPP_API_WEBHOOK_SECRET') ||
        this.configService.get<string>('WAHA_WEBHOOK_SECRET'),
      ),
      storeEnabled,
      storeFullSync,
      allowSessionWithoutWebhook: this.shouldAllowSessionWithoutWebhook(),
      allowInternalWebhookUrl: this.readBooleanEnv(['WAHA_ALLOW_INTERNAL_WEBHOOK_URL'], false),
    };
  }

  protected extractSessionConfig(payload: Record<string, unknown>): WahaSessionConfig | null {
    const payloadSession = payload?.session as Record<string, unknown> | undefined;
    const candidate = payload?.config || payloadSession?.config || null;
    if (!candidate || typeof candidate !== 'object') {
      return null;
    }
    return candidate as WahaSessionConfig;
  }

  protected resolveWebhookDiagnosticsFromConfig(config?: WahaSessionConfig | null) {
    return resolveWebhookDiagnosticsFromConfig(config);
  }

  protected resolveStoreDiagnosticsFromConfig(config?: WahaSessionConfig | null) {
    return resolveStoreDiagnosticsFromConfig(config);
  }

  protected normalizeEventList(events?: string[] | null): string[] {
    return normalizeEventList(events);
  }

  protected resolveSessionConfigMismatch(input: {
    webhookUrl: string | null;
    events: string[];
    storeEnabled: boolean | null;
    storeFullSync: boolean | null;
  }): string[] {
    const runtime = this.getRuntimeConfigDiagnostics();
    const expected = {
      webhookUrl: runtime.webhookUrl,
      events: normalizeEventList(runtime.events),
      storeEnabled: runtime.storeEnabled,
      storeFullSync: runtime.storeFullSync,
    };
    return resolveSessionConfigMismatch(input, expected);
  }

  /** Get session config diagnostics. */
  async getSessionConfigDiagnostics(sessionId: string): Promise<WahaSessionConfigDiagnostics> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    try {
      const payload = await this.request<Record<string, unknown>>(
        'GET',
        `/api/sessions/${encodeURIComponent(resolvedSessionId)}`,
      );
      const resolvedStatus = resolveWahaSessionState(payload);
      const config = this.extractSessionConfig(payload);
      const webhook = resolveWebhookDiagnosticsFromConfig(config);
      const store = resolveStoreDiagnosticsFromConfig(config);
      const identity = this.resolveSessionIdentity(payload);
      const mismatchReasons = this.resolveSessionConfigMismatch({
        webhookUrl: webhook.webhookUrl,
        events: webhook.events,
        storeEnabled: store.storeEnabled,
        storeFullSync: store.storeFullSync,
      });

      return {
        sessionName: resolvedSessionId,
        available: true,
        rawStatus: resolvedStatus.rawStatus,
        state: resolvedStatus.state,
        phoneNumber: identity.phoneNumber,
        pushName: identity.pushName,
        webhookUrl: webhook.webhookUrl,
        webhookConfigured: webhook.webhookConfigured,
        inboundEventsConfigured: webhook.inboundEventsConfigured,
        events: webhook.events,
        secretConfigured: webhook.secretConfigured,
        storeEnabled: store.storeEnabled,
        storeFullSync: store.storeFullSync,
        configPresent: Boolean(config),
        configMismatch: mismatchReasons.length > 0,
        mismatchReasons,
        sessionRestartRisk: mismatchReasons.length > 0 && resolvedStatus.state === 'CONNECTED',
      };
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      return {
        sessionName: resolvedSessionId,
        available: false,
        rawStatus: null,
        state: null,
        phoneNumber: null,
        pushName: null,
        webhookUrl: null,
        webhookConfigured: false,
        inboundEventsConfigured: false,
        events: [],
        secretConfigured: false,
        storeEnabled: null,
        storeFullSync: null,
        configPresent: false,
        error: String(msg?.message || 'unknown_error'),
      };
    }
  }

  // ─── Session config builder ───────────────────────────────

  protected buildSessionConfig(): WahaSessionConfig {
    const webhookUrl = this.resolveWebhookUrl();
    const events = this.resolveWebhookEvents();
    const webhookSecret =
      this.configService.get<string>('WHATSAPP_API_WEBHOOK_SECRET') ||
      this.configService.get<string>('WAHA_WEBHOOK_SECRET') ||
      '';

    const webhooks =
      webhookUrl && events.length
        ? [
            {
              url: webhookUrl,
              events,
              hmac: this.configService.get<string>('WHATSAPP_HOOK_HMAC_KEY')
                ? { key: this.configService.get<string>('WHATSAPP_HOOK_HMAC_KEY') }
                : undefined,
              customHeaders: webhookSecret
                ? [{ name: 'X-Api-Key', value: webhookSecret }]
                : undefined,
            },
          ]
        : undefined;

    const storeEnabled = this.readBooleanEnv(
      ['WAHA_NOWEB_STORE_ENABLED', 'WAHA_STORE_ENABLED'],
      true,
    );
    const storeFullSync = this.readBooleanEnv(
      ['WAHA_NOWEB_STORE_FULL_SYNC', 'WAHA_STORE_FULL_SYNC'],
      true,
    );
    const storeConfig = {
      enabled: storeEnabled,
      fullSync: storeFullSync,
      full_sync: storeFullSync,
    };

    return {
      webhooks,
      store: storeConfig,
      noweb: { store: storeConfig },
    };
  }

  // ─── LID mappings payload extractor (used by subclass) ───

  protected extractLidMappingsPayload(payload: unknown): import('./waha-types').WahaLidMapping[] {
    return extractLidMappingsPayload(payload);
  }
}
