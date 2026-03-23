import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * =====================================================================
 * WhatsAppApiProvider — WAHA (WhatsApp HTTP API)
 *
 * Documentação: https://waha.devlike.pro/docs/overview/introduction/
 * Endpoints base: /api/sessions, /api/sendText, /api/sendImage, etc.
 * Autenticação: header X-Api-Key
 * =====================================================================
 */

export interface SessionStatus {
  success: boolean;
  state:
    | 'CONNECTED'
    | 'DISCONNECTED'
    | 'OPENING'
    | 'SCAN_QR_CODE'
    | 'STARTING'
    | 'FAILED'
    | null;
  message: string;
  phoneNumber?: string | null;
  pushName?: string | null;
  selfIds?: string[];
}

export interface QrCodeResponse {
  success: boolean;
  qr?: string;
  message?: string;
}

export function normalizeWahaSessionStatus(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const normalized = raw.trim().toUpperCase();
  return normalized || null;
}

export function mapWahaSessionStatus(
  rawStatus: string | null,
): SessionStatus['state'] {
  switch (rawStatus) {
    case 'WORKING':
    case 'CONNECTED':
      return 'CONNECTED';
    case 'SCAN_QR_CODE':
    case 'QR':
    case 'QRCODE':
      return 'SCAN_QR_CODE';
    case 'STARTING':
    case 'OPENING':
      return 'STARTING';
    case 'FAILED':
      return 'FAILED';
    case 'STOPPED':
    case 'DISCONNECTED':
    case 'LOGGED_OUT':
      return 'DISCONNECTED';
    default:
      return null;
  }
}

export function resolveWahaSessionState(data: any): {
  rawStatus: string;
  state: SessionStatus['state'];
} {
  const rawCandidates = [
    data?.engine?.state,
    data?.state,
    data?.session?.state,
    data?.status,
    data?.session?.status,
  ]
    .map((value) => normalizeWahaSessionStatus(value))
    .filter((value): value is string => Boolean(value));

  const uniqueCandidates = Array.from(new Set(rawCandidates));
  const priority: SessionStatus['state'][] = [
    'CONNECTED',
    'SCAN_QR_CODE',
    'STARTING',
    'FAILED',
    'DISCONNECTED',
  ];

  for (const desiredState of priority) {
    const matched = uniqueCandidates.find(
      (candidate) => mapWahaSessionStatus(candidate) === desiredState,
    );
    if (matched) {
      return { rawStatus: matched, state: desiredState };
    }
  }

  return {
    rawStatus: uniqueCandidates[0] || 'UNKNOWN',
    state: 'DISCONNECTED',
  };
}

export interface WahaChatSummary {
  id: string;
  unreadCount?: number;
  timestamp?: number;
  lastMessageTimestamp?: number;
  lastMessageRecvTimestamp?: number;
  lastMessageFromMe?: boolean | null;
  name?: string | null;
}

export interface WahaChatMessage {
  id: string;
  from?: string;
  to?: string;
  fromMe?: boolean;
  body?: string;
  type?: string;
  hasMedia?: boolean;
  mediaUrl?: string;
  mimetype?: string;
  timestamp?: number;
  chatId?: string;
  raw?: any;
}

export interface WahaLidMapping {
  lid: string;
  pn: string;
}

export interface WahaSessionOverview {
  name: string;
  success: boolean;
  rawStatus: string;
  state: SessionStatus['state'];
  phoneNumber?: string | null;
  pushName?: string | null;
}

interface WahaSessionConfig {
  webhooks?: Array<{
    url: string;
    events: string[];
    hmac?: { key: string };
    customHeaders?: Array<{ name: string; value: string }>;
  }>;
  store: {
    enabled: boolean;
    fullSync?: boolean;
    full_sync?: boolean;
  };
  noweb?: {
    store: {
      enabled: boolean;
      fullSync?: boolean;
      full_sync?: boolean;
    };
  };
}

export interface WahaRuntimeConfigDiagnostics {
  webhookUrl: string | null;
  webhookConfigured: boolean;
  inboundEventsConfigured: boolean;
  events: string[];
  secretConfigured: boolean;
  storeEnabled: boolean;
  storeFullSync: boolean;
  allowSessionWithoutWebhook: boolean;
  allowInternalWebhookUrl: boolean;
}

export interface WahaSessionConfigDiagnostics {
  sessionName: string;
  available: boolean;
  rawStatus: string | null;
  state: SessionStatus['state'];
  phoneNumber?: string | null;
  pushName?: string | null;
  webhookUrl: string | null;
  webhookConfigured: boolean;
  inboundEventsConfigured: boolean;
  events: string[];
  secretConfigured: boolean;
  storeEnabled: boolean | null;
  storeFullSync: boolean | null;
  configPresent: boolean;
  configMismatch?: boolean;
  mismatchReasons?: string[];
  sessionRestartRisk?: boolean;
  error?: string;
}

@Injectable()
export class WhatsAppApiProvider {
  private readonly logger = new Logger(WhatsAppApiProvider.name);
  private readonly defaultWebhookEvents = [
    'session.status',
    'message',
    'message.any',
    'message.ack',
  ];
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly sessionIdOverride: string;
  private readonly useWorkspaceSessions: boolean;
  private readonly startingSessions: Set<string> = new Set();
  private readonly sessionConfigSyncTtlMs: number;
  private readonly sessionConfigSyncedAt = new Map<string, number>();
  private readonly chatsOverviewTimeoutMs: number;
  private readonly chatsOverviewFailureTtlMs: number;
  private readonly skipChatsOverviewUntil = new Map<string, number>();
  private readonly quietErrorPaths = new Set<string>();
  private readonly allowConnectedSessionConfigSync: boolean;

  constructor(private readonly configService: ConfigService) {
    const configuredBaseUrl =
      this.configService.get<string>('WAHA_API_URL') ||
      this.configService.get<string>('WAHA_BASE_URL') ||
      this.configService.get<string>('WAHA_URL') ||
      '';
    this.baseUrl = configuredBaseUrl.trim().replace(/\/+$/, '');

    if (!this.baseUrl) {
      this.logger.warn(
        'WAHA provider initialized without base URL. WAHA methods will stay disabled until WAHA_API_URL/WAHA_BASE_URL/WAHA_URL is configured.',
      );
    }

    this.apiKey =
      this.configService.get<string>('WAHA_API_KEY') ||
      this.configService.get<string>('WAHA_API_TOKEN') ||
      '';

    this.sessionIdOverride = (
      this.configService.get<string>('WAHA_SESSION_ID') || ''
    ).trim();
    const explicitWorkspaceMode =
      this.configService.get<string>('WAHA_MULTISESSION') === 'true' ||
      this.configService.get<string>('WAHA_USE_WORKSPACE_SESSION') === 'true';
    const explicitSingleSessionMode =
      this.configService.get<string>('WAHA_SINGLE_SESSION') === 'true' ||
      this.configService.get<string>('WAHA_MULTISESSION') === 'false' ||
      this.configService.get<string>('WAHA_USE_WORKSPACE_SESSION') === 'false';

    this.useWorkspaceSessions =
      !this.sessionIdOverride &&
      (explicitWorkspaceMode || !explicitSingleSessionMode);
    this.sessionConfigSyncTtlMs = Math.max(
      60_000,
      parseInt(
        this.configService.get<string>('WAHA_SESSION_CONFIG_SYNC_TTL_MS') ||
          '300000',
        10,
      ) || 300_000,
    );
    this.chatsOverviewTimeoutMs = Math.max(
      500,
      parseInt(
        this.configService.get<string>('WAHA_CHATS_OVERVIEW_TIMEOUT_MS') ||
          '3000',
        10,
      ) || 3000,
    );
    this.chatsOverviewFailureTtlMs = Math.max(
      10_000,
      parseInt(
        this.configService.get<string>(
          'WAHA_CHATS_OVERVIEW_FAILURE_TTL_MS',
        ) || '300000',
        10,
      ) || 300_000,
    );
    this.allowConnectedSessionConfigSync = this.readBooleanEnv(
      ['WAHA_ALLOW_CONNECTED_SESSION_CONFIG_SYNC'],
      false,
    );
    this.quietErrorPaths.add('/chats/overview');

    this.logger.log(
      `WAHA provider initialized. Base URL: ${this.baseUrl}. Session mode: ${
        this.sessionIdOverride
          ? `override(${this.sessionIdOverride})`
          : this.useWorkspaceSessions
            ? 'workspace'
            : 'default'
      }`,
    );
  }

  private resolveSessionName(workspaceSessionId: string): string {
    const normalizedWorkspaceSessionId = String(
      workspaceSessionId || '',
    ).trim();
    const normalizedOverride = this.sessionIdOverride.trim();

    if (
      normalizedWorkspaceSessionId &&
      normalizedWorkspaceSessionId.toLowerCase() !== 'default'
    ) {
      return normalizedWorkspaceSessionId;
    }

    if (normalizedOverride && normalizedOverride.toLowerCase() !== 'default') {
      return normalizedOverride;
    }

    if (normalizedWorkspaceSessionId) {
      return normalizedWorkspaceSessionId;
    }

    if (this.useWorkspaceSessions && normalizedWorkspaceSessionId) {
      return normalizedWorkspaceSessionId;
    }

    if (normalizedOverride) {
      return normalizedOverride;
    }

    return 'default';
  }

  getResolvedSessionId(workspaceSessionId: string): string {
    return this.resolveSessionName(workspaceSessionId);
  }

  private buildHeaders(
    overrides?: Record<string, string>,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...overrides,
    };
    if (this.apiKey) {
      headers['X-Api-Key'] = this.apiKey;
    }
    return headers;
  }

  private normalizePublicUrl(rawValue?: string | null): string {
    const raw = String(rawValue || '').trim();
    if (!raw) return '';
    const allowInternalWebhookUrl = this.readBooleanEnv(
      ['WAHA_ALLOW_INTERNAL_WEBHOOK_URL'],
      false,
    );

    const withProtocol =
      /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw) || raw.startsWith('//')
        ? raw.replace(/^\/\//, 'https://')
        : raw.includes('.')
          ? `https://${raw.replace(/^\/+/, '')}`
          : '';

    if (!withProtocol) {
      return '';
    }

    try {
      const url = new URL(withProtocol);
      const hostname = url.hostname.toLowerCase();
      if (
        !allowInternalWebhookUrl &&
        (hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname === '0.0.0.0' ||
          hostname === 'backend' ||
          hostname.endsWith('.railway.internal'))
      ) {
        return '';
      }

      return url.toString().replace(/\/+$/, '');
    } catch {
      return '';
    }
  }

  private resolveWebhookUrl(): string {
    const explicitUrl =
      this.configService.get<string>('WHATSAPP_HOOK_URL') ||
      this.configService.get<string>('WAHA_HOOK_URL') ||
      '';
    const normalizedExplicitUrl = this.normalizePublicUrl(explicitUrl);
    if (normalizedExplicitUrl) {
      return normalizedExplicitUrl;
    }

    const baseCandidates = [
      this.configService.get<string>('APP_URL'),
      this.configService.get<string>('BACKEND_PUBLIC_URL'),
      this.configService.get<string>('BACKEND_URL'),
      this.configService.get<string>('SERVICE_BASE_URL'),
      this.configService.get<string>('NEXT_PUBLIC_API_URL'),
      this.configService.get<string>('NEXT_PUBLIC_SERVICE_BASE_URL'),
      this.configService.get<string>('RAILWAY_STATIC_URL'),
      this.configService.get<string>('RAILWAY_PUBLIC_DOMAIN'),
      process.env.RAILWAY_STATIC_URL,
      process.env.RAILWAY_PUBLIC_DOMAIN,
    ];

    for (const candidate of baseCandidates) {
      const normalizedBase = this.normalizePublicUrl(candidate);
      if (!normalizedBase) {
        continue;
      }

      return `${normalizedBase}/webhooks/whatsapp-api`;
    }

    return '';
  }

  private resolveWebhookEvents(): string[] {
    const raw =
      this.configService.get<string>('WHATSAPP_HOOK_EVENTS') ||
      this.configService.get<string>('WAHA_HOOK_EVENTS') ||
      '';
    const configuredEvents = raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    return configuredEvents.length
      ? configuredEvents
      : [...this.defaultWebhookEvents];
  }

  private async parseJsonSafely<T>(res: Response): Promise<T> {
    const text = await res.text().catch(() => '');
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return { message: text } as T;
    }
  }

  private async rawRequest(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any,
    options?: {
      headers?: Record<string, string>;
      timeoutMs?: number;
    },
  ): Promise<Response> {
    if (!this.baseUrl) {
      throw new Error('WAHA_API_URL/WAHA_BASE_URL/WAHA_URL not configured');
    }

    const url = `${this.baseUrl}${path}`;
    const hasBody = body !== undefined;
    const timeoutMs = options?.timeoutMs ?? 15_000;
    const headers = this.buildHeaders({
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(options?.headers || {}),
    });

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return res;
    } catch (err: any) {
      let diagnosis = err.message;
      if (err.name === 'AbortError') {
        diagnosis = `TIMEOUT after ${timeoutMs}ms connecting to ${this.baseUrl}`;
      } else if (err.cause?.code === 'ECONNREFUSED') {
        diagnosis = `ECONNREFUSED — WAHA at ${this.baseUrl} is not reachable.`;
      }
      const shouldLogQuietly = Array.from(this.quietErrorPaths).some((suffix) =>
        path.includes(suffix),
      );

      if (shouldLogQuietly) {
        this.logger.warn(
          `WAHA optional request failed: ${method} ${path} -> ${diagnosis}`,
        );
      } else {
        this.logger.error(
          `WAHA request failed: ${method} ${path} -> ${diagnosis}`,
        );
      }
      throw new Error(diagnosis);
    }
  }

  // ─── HTTP helper ──────────────────────────────────────────
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any,
    options?: {
      headers?: Record<string, string>;
      timeoutMs?: number;
    },
  ): Promise<T> {
    const res = await this.rawRequest(method, path, body, options);

    if (!res.ok) {
      const parsed = await this.parseJsonSafely<any>(res);
      throw new Error(parsed?.message || parsed?.error || `HTTP ${res.status}`);
    }

    return this.parseJsonSafely<T>(res);
  }

  private async tryRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any,
    options?: {
      headers?: Record<string, string>;
      timeoutMs?: number;
    },
  ): Promise<T | null> {
    try {
      return await this.request<T>(method, path, body, options);
    } catch {
      return null;
    }
  }

  private isSessionMissingMessage(message?: string): boolean {
    const lower = String(message || '').toLowerCase();
    return (
      lower.includes('404') ||
      lower.includes('not found') ||
      lower.includes('session') ||
      lower.includes('does not exist')
    );
  }

  private isAlreadyExistsMessage(message?: string): boolean {
    const lower = String(message || '').toLowerCase();
    return (
      lower.includes('already') ||
      lower.includes('exist') ||
      lower.includes('conflict')
    );
  }

  private readBooleanEnv(keys: string[], defaultValue: boolean): boolean {
    for (const key of keys) {
      const rawValue = this.configService.get<string>(key);
      if (typeof rawValue !== 'string' || !rawValue.trim()) {
        continue;
      }

      const normalized = rawValue.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }

    return defaultValue;
  }

  private shouldAllowSessionWithoutWebhook(): boolean {
    return this.readBooleanEnv(['WAHA_ALLOW_SESSION_WITHOUT_WEBHOOK'], false);
  }

  getRuntimeConfigDiagnostics(): WahaRuntimeConfigDiagnostics {
    const webhookUrl = this.resolveWebhookUrl() || null;
    const events = this.resolveWebhookEvents();
    const inboundEventsConfigured = events.some(
      (event) => event === 'message' || event === 'message.any',
    );
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
      allowInternalWebhookUrl: this.readBooleanEnv(
        ['WAHA_ALLOW_INTERNAL_WEBHOOK_URL'],
        false,
      ),
    };
  }

  private extractSessionConfig(payload: any): WahaSessionConfig | null {
    const candidate = payload?.config || payload?.session?.config || null;
    if (!candidate || typeof candidate !== 'object') {
      return null;
    }

    return candidate as WahaSessionConfig;
  }

  private resolveWebhookDiagnosticsFromConfig(config?: WahaSessionConfig | null) {
    const webhook = Array.isArray(config?.webhooks) ? config?.webhooks?.[0] : null;
    const events = Array.isArray(webhook?.events)
      ? webhook.events
          .map((event) => String(event || '').trim())
          .filter(Boolean)
      : [];

    return {
      webhookUrl: typeof webhook?.url === 'string' ? webhook.url : null,
      webhookConfigured: Boolean(webhook?.url),
      inboundEventsConfigured: events.some(
        (event) => event === 'message' || event === 'message.any',
      ),
      events,
      secretConfigured:
        Boolean(webhook?.hmac?.key) ||
        Boolean(
          (webhook?.customHeaders || []).find((header) =>
            ['x-api-key', 'x-webhook-secret'].includes(
              String(header?.name || '').trim().toLowerCase(),
            ),
          ),
        ),
    };
  }

  private resolveStoreDiagnosticsFromConfig(config?: WahaSessionConfig | null) {
    const nowebStore = config?.noweb?.store;
    const legacyStore = config?.store;
    const store = nowebStore || legacyStore || null;
    const enabledCandidate =
      typeof nowebStore?.enabled === 'boolean'
        ? nowebStore.enabled
        : typeof legacyStore?.enabled === 'boolean'
          ? legacyStore.enabled
          : null;
    const fullSyncCandidate =
      typeof nowebStore?.fullSync === 'boolean'
        ? nowebStore.fullSync
        : typeof nowebStore?.full_sync === 'boolean'
          ? nowebStore.full_sync
          : typeof legacyStore?.fullSync === 'boolean'
            ? legacyStore.fullSync
            : typeof legacyStore?.full_sync === 'boolean'
              ? legacyStore.full_sync
              : null;

    return {
      storePresent: Boolean(store),
      storeEnabled: enabledCandidate,
      storeFullSync: fullSyncCandidate,
    };
  }

  private normalizeEventList(events?: string[] | null): string[] {
    return Array.from(
      new Set(
        (events || [])
          .map((event) => String(event || '').trim())
          .filter(Boolean)
          .sort(),
      ),
    );
  }

  private getExpectedSessionConfigDiagnostics() {
    const runtime = this.getRuntimeConfigDiagnostics();

    return {
      webhookUrl: runtime.webhookUrl,
      events: this.normalizeEventList(runtime.events),
      storeEnabled: runtime.storeEnabled,
      storeFullSync: runtime.storeFullSync,
    };
  }

  private resolveSessionConfigMismatch(input: {
    webhookUrl: string | null;
    events: string[];
    storeEnabled: boolean | null;
    storeFullSync: boolean | null;
  }): string[] {
    const expected = this.getExpectedSessionConfigDiagnostics();
    const actualEvents = this.normalizeEventList(input.events);
    const reasons: string[] = [];

    if (expected.webhookUrl && input.webhookUrl !== expected.webhookUrl) {
      reasons.push('webhook_url_mismatch');
    }

    if (
      expected.events.length &&
      JSON.stringify(actualEvents) !== JSON.stringify(expected.events)
    ) {
      reasons.push('webhook_events_mismatch');
    }

    if (input.storeEnabled !== null && input.storeEnabled !== expected.storeEnabled) {
      reasons.push('store_enabled_mismatch');
    }

    if (
      input.storeFullSync !== null &&
      input.storeFullSync !== expected.storeFullSync
    ) {
      reasons.push('store_full_sync_mismatch');
    }

    return reasons;
  }

  async getSessionConfigDiagnostics(
    sessionId: string,
  ): Promise<WahaSessionConfigDiagnostics> {
    const resolvedSessionId = this.resolveSessionName(sessionId);

    try {
      const payload = await this.request<any>(
        'GET',
        `/api/sessions/${encodeURIComponent(resolvedSessionId)}`,
      );
      const resolvedStatus = resolveWahaSessionState(payload);
      const config = this.extractSessionConfig(payload);
      const webhook = this.resolveWebhookDiagnosticsFromConfig(config);
      const store = this.resolveStoreDiagnosticsFromConfig(config);
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
        phoneNumber:
          payload?.me?.id ||
          payload?.me?.phone ||
          payload?.phone ||
          payload?.phoneNumber ||
          null,
        pushName:
          payload?.me?.pushName ||
          payload?.me?.name ||
          payload?.pushName ||
          payload?.name ||
          null,
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
        sessionRestartRisk:
          mismatchReasons.length > 0 && resolvedStatus.state === 'CONNECTED',
      };
    } catch (err: any) {
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
        error: String(err?.message || 'unknown_error'),
      };
    }
  }

  private assertSessionRuntimeReady() {
    const diagnostics = this.getRuntimeConfigDiagnostics();
    if (diagnostics.allowSessionWithoutWebhook) {
      return;
    }

    if (!diagnostics.webhookConfigured) {
      throw new Error(
        'WAHA webhook URL not configured or not publicly reachable',
      );
    }

    if (!diagnostics.inboundEventsConfigured) {
      throw new Error(
        'WAHA webhook events must include message or message.any',
      );
    }
  }

  private async ensureSessionConfigured(sessionId: string) {
    const diagnostics = await this.getSessionConfigDiagnostics(sessionId).catch(
      () => null,
    );
    const mismatchReasons = diagnostics?.mismatchReasons || [];
    const sessionState = diagnostics?.state || null;
    const sessionIsMutable =
      !sessionState ||
      sessionState === 'DISCONNECTED' ||
      sessionState === 'FAILED' ||
      sessionState === 'SCAN_QR_CODE';

    if (
      diagnostics?.available &&
      diagnostics.configPresent &&
      mismatchReasons.length === 0
    ) {
      return;
    }

    if (
      diagnostics?.available &&
      mismatchReasons.length > 0 &&
      !sessionIsMutable &&
      !this.allowConnectedSessionConfigSync
    ) {
      this.logger.error(
        `WAHA session ${sessionId} config drift detected (${mismatchReasons.join(
          ', ',
        )}) while state=${sessionState}. Skipping PUT to avoid restarting a connected session.`,
      );
      return;
    }

    const config = this.buildSessionConfig();
    const path = `/api/sessions/${encodeURIComponent(sessionId)}`;
    const payloadVariants = [{ config }, config];

    for (const payload of payloadVariants) {
      try {
        await this.request('PUT', path, payload);
        return;
      } catch (err: any) {
        const message = String(err?.message || '');
        if (
          message.includes('404') ||
          message.toLowerCase().includes('not found')
        ) {
          return;
        }
      }
    }

    this.logger.warn(
      `Failed to update WAHA session config for ${sessionId}. Session may be missing webhooks/store settings.`,
    );
  }

  private shouldSkipChatsOverview(sessionId: string): boolean {
    const skipUntil = this.skipChatsOverviewUntil.get(sessionId) || 0;
    if (skipUntil <= Date.now()) {
      this.skipChatsOverviewUntil.delete(sessionId);
      return false;
    }

    return true;
  }

  private markChatsOverviewFailure(sessionId: string) {
    this.skipChatsOverviewUntil.set(
      sessionId,
      Date.now() + this.chatsOverviewFailureTtlMs,
    );
  }

  private clearChatsOverviewFailure(sessionId: string) {
    this.skipChatsOverviewUntil.delete(sessionId);
  }

  private async ensureSessionExists(sessionId: string) {
    const currentStatus = await this.getSessionStatus(sessionId).catch(
      () => null,
    );
    if (currentStatus?.state === 'FAILED') {
      this.logger.warn(
        `WAHA session ${sessionId} is FAILED. Deleting it before recreating a clean session.`,
      );
      await this.deleteSession(sessionId).catch((error: any) => {
        this.logger.warn(
          `Failed to delete FAILED WAHA session ${sessionId}: ${error?.message || error}`,
        );
      });
    }

    const createPayload = {
      name: sessionId,
      config: this.buildSessionConfig(),
    };

    try {
      await this.request('POST', '/api/sessions', createPayload);
      return;
    } catch (err: any) {
      if (this.isAlreadyExistsMessage(err?.message)) {
        await this.syncSessionConfig(sessionId);
        return;
      }
    }

    try {
      await this.request('POST', '/api/sessions/start', { name: sessionId });
      await this.syncSessionConfig(sessionId);
    } catch (err: any) {
      if (!this.isAlreadyExistsMessage(err?.message)) {
        throw err;
      }
      await this.syncSessionConfig(sessionId);
    }
  }

  private buildSessionConfig(): WahaSessionConfig {
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
                ? {
                    key: this.configService.get<string>('WHATSAPP_HOOK_HMAC_KEY'),
                  }
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
      // Mantemos os dois formatos porque instâncias WAHA antigas ainda leem
      // `config.store`, enquanto NOWEB moderno exige `config.noweb.store`.
      store: storeConfig,
      noweb: {
        store: storeConfig,
      },
    };
  }

  // ─── SESSION MANAGEMENT ───────────────────────────────────

  async startSession(
    sessionId: string,
  ): Promise<{ success: boolean; message: string }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    this.assertSessionRuntimeReady();

    if (this.startingSessions.has(resolvedSessionId)) {
      return { success: true, message: 'session_starting' };
    }

    // Check if already connected
    try {
      const status = await this.getSessionStatus(sessionId);
      if (status?.state === 'CONNECTED') {
        return { success: true, message: 'already_connected' };
      }
    } catch {
      // Session might not exist yet — that's fine
    }

    this.logger.log(
      `Starting WAHA session: ${resolvedSessionId} (workspace/session key: ${sessionId})`,
    );
    this.startingSessions.add(resolvedSessionId);
    try {
      await this.ensureSessionExists(resolvedSessionId);

      const directStart = await this.tryRequest(
        'POST',
        `/api/sessions/${encodeURIComponent(resolvedSessionId)}/start`,
      );

      if (!directStart) {
        await this.request('POST', '/api/sessions/start', {
          name: resolvedSessionId,
        });
      }

      return { success: true, message: 'session_started' };
    } catch (err: any) {
      // If session already exists, try to get its status
      const message = String(err.message || '').toLowerCase();
      if (
        message.includes('already') ||
        message.includes('exist') ||
        message.includes('session_starting')
      ) {
        return { success: true, message: 'session_exists' };
      }
      this.logger.warn(
        `Failed to start session ${resolvedSessionId}: ${err.message}`,
      );
      return { success: false, message: err.message };
    } finally {
      this.startingSessions.delete(resolvedSessionId);
    }
  }

  async getSessionStatus(sessionId: string): Promise<SessionStatus> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    try {
      // WAHA: GET /api/sessions/:name
      const data = await this.request<any>(
        'GET',
        `/api/sessions/${encodeURIComponent(resolvedSessionId)}`,
      );
      const resolvedStatus = resolveWahaSessionState(data);

      return {
        success: true,
        state: resolvedStatus.state,
        message: resolvedStatus.rawStatus,
        phoneNumber:
          data?.me?.id ||
          data?.me?.phone ||
          data?.phone ||
          data?.phoneNumber ||
          null,
        pushName:
          data?.me?.pushName ||
          data?.me?.name ||
          data?.pushName ||
          data?.name ||
          null,
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
    } catch (err: any) {
      return { success: false, state: null, message: err.message };
    }
  }

  async listSessions(): Promise<WahaSessionOverview[]> {
    try {
      const data = await this.request<any[]>('GET', '/api/sessions');
      if (!Array.isArray(data)) {
        return [];
      }

      return data
        .map((entry): WahaSessionOverview | null => {
          const resolvedStatus = resolveWahaSessionState(entry);
          const name = String(entry?.name || '').trim();
          if (!name) {
            return null;
          }

          return {
            name,
            success: true,
            rawStatus: resolvedStatus.rawStatus,
            state: resolvedStatus.state,
            phoneNumber:
              entry?.me?.id ||
              entry?.me?.phone ||
              entry?.phone ||
              entry?.phoneNumber ||
              null,
            pushName:
              entry?.me?.pushName ||
              entry?.me?.name ||
              entry?.pushName ||
              null,
          };
        })
        .filter((entry): entry is WahaSessionOverview => Boolean(entry));
    } catch (err: any) {
      this.logger.warn(
        `Failed to list WAHA sessions: ${err?.message || err}`,
      );
      return [];
    }
  }

  async listLidMappings(
    sessionId: string,
    options?: { limit?: number },
  ): Promise<WahaLidMapping[]> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const pageSize = Math.max(
      1,
      Math.min(200, Number(options?.limit || 200) || 200),
    );
    const maxPages = Math.max(
      1,
      Math.min(20, Math.ceil((Number(options?.limit || 4000) || 4000) / pageSize)),
    );
    const collected: WahaLidMapping[] = [];
    const seen = new Set<string>();

    for (let page = 0; page < maxPages; page += 1) {
      const offset = page * pageSize;
      const payload = await this.tryRequest<any>(
        'GET',
        `/api/${encodeURIComponent(resolvedSessionId)}/lids?limit=${pageSize}&offset=${offset}`,
      );

      if (!payload) {
        break;
      }

      const rows = this.extractLidMappingsPayload(payload);
      if (!rows.length) {
        break;
      }

      let added = 0;
      for (const row of rows) {
        if (seen.has(row.lid)) {
          continue;
        }
        seen.add(row.lid);
        collected.push(row);
        added += 1;
      }

      if (rows.length < pageSize || added === 0) {
        break;
      }
    }

    return collected;
  }

  async syncSessionConfig(sessionId: string): Promise<void> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const now = Date.now();
    const lastSyncedAt =
      this.sessionConfigSyncedAt.get(resolvedSessionId) || 0;

    if (now - lastSyncedAt < this.sessionConfigSyncTtlMs) {
      return;
    }

    try {
      const diagnostics =
        await this.getSessionConfigDiagnostics(resolvedSessionId);

      if (!diagnostics.available) {
        this.logger.warn(
          `Skipping WAHA session config sync for ${resolvedSessionId}: diagnostics unavailable (${diagnostics.error || 'unknown_error'}).`,
        );
        return;
      }

      if (
        diagnostics.available &&
        diagnostics.configMismatch &&
        diagnostics.mismatchReasons?.length
      ) {
        this.logger.warn(
          `WAHA session ${resolvedSessionId} drift detected: ${diagnostics.mismatchReasons.join(
            ', ',
          )}.`,
        );
      }

      await this.ensureSessionConfigured(resolvedSessionId);
      this.sessionConfigSyncedAt.set(resolvedSessionId, now);
    } catch (err: any) {
      this.logger.warn(
        `Failed to synchronize WAHA session config for ${resolvedSessionId}: ${err?.message || err}`,
      );
    }
  }

  async getQrCode(sessionId: string): Promise<QrCodeResponse> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    try {
      const res =
        (await this.tryGetQrImage(
          'POST',
          `/api/${encodeURIComponent(resolvedSessionId)}/auth/qr`,
        )) ||
        (await this.tryGetQrImage(
          'GET',
          `/api/${encodeURIComponent(resolvedSessionId)}/auth/qr`,
        )) ||
        (await this.tryGetQrImage(
          'GET',
          `/api/screenshot?session=${encodeURIComponent(resolvedSessionId)}`,
        ));

      if (!res) {
        return { success: false, message: 'QR not available' };
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('image')) {
        const buffer = await res.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return { success: true, qr: `data:image/png;base64,${base64}` };
      }

      const data = await this.parseJsonSafely<any>(res);
      if (data?.value) {
        return { success: true, qr: data.value };
      }
      if (data?.qr) {
        return { success: true, qr: data.qr };
      }

      return { success: false, message: 'QR not available in response' };
    } catch (err: any) {
      this.logger.warn(`Failed to get QR code: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  async restartSession(
    sessionId: string,
  ): Promise<{ success: boolean; message: string }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    try {
      const restarted = await this.tryRequest(
        'POST',
        `/api/sessions/${encodeURIComponent(resolvedSessionId)}/restart`,
      );

      if (restarted) {
        return { success: true, message: 'session_restarted' };
      }
    } catch {
      // fallback below
    }

    try {
      await this.request('POST', '/api/sessions/stop', {
        name: resolvedSessionId,
      });
    } catch {
      // Ignore stop errors
    }
    return this.startSession(sessionId);
  }

  async terminateSession(
    sessionId: string,
  ): Promise<{ success: boolean; message: string }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    try {
      const directStop = await this.tryRequest(
        'POST',
        `/api/sessions/${encodeURIComponent(resolvedSessionId)}/stop`,
      );
      if (!directStop) {
        await this.request('POST', '/api/sessions/stop', {
          name: resolvedSessionId,
        });
      }
      return { success: true, message: 'session_stopped' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const resolvedSessionId = this.resolveSessionName(sessionId);

    const directDelete = await this.tryRequest(
      'DELETE',
      `/api/sessions/${encodeURIComponent(resolvedSessionId)}`,
    );
    if (directDelete) {
      return true;
    }

    try {
      await this.request('DELETE', `/api/sessions/${encodeURIComponent(resolvedSessionId)}`);
      return true;
    } catch (error: any) {
      if (
        String(error?.message || '')
          .toLowerCase()
          .includes('not found')
      ) {
        return true;
      }
      throw error;
    }
  }

  async logoutSession(
    sessionId: string,
  ): Promise<{ success: boolean; message: string }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);

    try {
      await this.request('POST', '/api/sessions/logout', {
        name: resolvedSessionId,
      });
      return { success: true, message: 'session_logged_out' };
    } catch (err: any) {
      try {
        await this.request('POST', '/api/sessions/stop', {
          name: resolvedSessionId,
          logout: true,
        });
        return { success: true, message: 'session_logged_out' };
      } catch (fallbackErr: any) {
        return {
          success: false,
          message: fallbackErr?.message || err?.message || 'logout_failed',
        };
      }
    }
  }

  // ─── MESSAGING ────────────────────────────────────────────

  async sendMessage(
    sessionId: string,
    to: string,
    message: string,
    options?: { quotedMessageId?: string },
  ): Promise<{ success: boolean; message?: any }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const chatId = this.formatChatId(to);

    // WAHA: POST /api/sendText
    const payload: any = {
      session: resolvedSessionId,
      chatId,
      text: message,
    };
    if (options?.quotedMessageId) {
      payload.reply_to = options.quotedMessageId;
    }

    const result = await this.request<any>('POST', '/api/sendText', payload);
    return { success: true, message: result };
  }

  async sendImageFromUrl(
    sessionId: string,
    to: string,
    imageUrl: string,
    caption?: string,
  ): Promise<{ success: boolean; message?: any }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const chatId = this.formatChatId(to);

    const result = await this.request<any>('POST', '/api/sendImage', {
      session: resolvedSessionId,
      chatId,
      file: { url: imageUrl },
      caption: caption || '',
    });
    return { success: true, message: result };
  }

  async sendMediaFromUrl(
    sessionId: string,
    to: string,
    mediaUrl: string,
    caption?: string,
    mediaType: 'image' | 'video' | 'audio' | 'document' = 'image',
    options?: { quotedMessageId?: string },
  ): Promise<{ success: boolean; message?: any }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const chatId = this.formatChatId(to);

    // WAHA uses /api/sendFile for generic media
    const payload: any = {
      session: resolvedSessionId,
      chatId,
      file: { url: mediaUrl },
      caption: caption || '',
    };
    if (options?.quotedMessageId) {
      payload.reply_to = options.quotedMessageId;
    }

    const result = await this.request<any>('POST', '/api/sendFile', payload);
    return { success: true, message: result };
  }

  async sendMedia(
    sessionId: string,
    to: string,
    mimetype: string,
    data: string,
    filename?: string,
    caption?: string,
    options?: { quotedMessageId?: string },
  ): Promise<{ success: boolean; message?: any }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const chatId = this.formatChatId(to);

    const payload: any = {
      session: resolvedSessionId,
      chatId,
      file: {
        mimetype,
        data,
        filename: filename || 'file',
      },
      caption: caption || '',
    };
    if (options?.quotedMessageId) {
      payload.reply_to = options.quotedMessageId;
    }

    const result = await this.request<any>('POST', '/api/sendFile', payload);
    return { success: true, message: result };
  }

  async sendLocation(
    sessionId: string,
    to: string,
    latitude: number,
    longitude: number,
    description?: string,
  ): Promise<{ success: boolean; message?: any }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const chatId = this.formatChatId(to);

    const result = await this.request<any>('POST', '/api/sendLocation', {
      session: resolvedSessionId,
      chatId,
      latitude,
      longitude,
      title: description || '',
    });
    return { success: true, message: result };
  }

  // ─── CONTACT & CHAT INFO ─────────────────────────────────

  async getClientInfo(sessionId: string): Promise<any> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    return this.request(
      'GET',
      `/api/sessions/${encodeURIComponent(resolvedSessionId)}`,
    );
  }

  async getContacts(sessionId: string): Promise<any> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    return this.request(
      'GET',
      `/api/contacts?session=${encodeURIComponent(resolvedSessionId)}`,
    );
  }

  async upsertContactProfile(
    sessionId: string,
    input: { phone: string; name?: string | null },
  ): Promise<boolean> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const chatId = this.formatChatId(input.phone);
    const fullName = String(input.name || '').trim();

    if (
      !chatId ||
      !fullName ||
      this.isPlaceholderContactName(fullName, input.phone)
    ) {
      return false;
    }

    const [firstName, ...rest] = fullName.split(/\s+/).filter(Boolean);
    const lastName = rest.join(' ').trim();
    const scopedPayload = {
      firstName: firstName || fullName,
      lastName: lastName || undefined,
      fullName,
      name: fullName,
    };
    const genericPayload = {
      session: resolvedSessionId,
      chatId,
      ...scopedPayload,
    };

    const attempts = [
      () =>
        this.tryRequest(
          'PUT',
          `/api/${encodeURIComponent(resolvedSessionId)}/contacts/${encodeURIComponent(chatId)}`,
          scopedPayload,
        ),
      () =>
        this.tryRequest(
          'POST',
          `/api/${encodeURIComponent(resolvedSessionId)}/contacts/${encodeURIComponent(chatId)}`,
          scopedPayload,
        ),
      () => this.tryRequest('POST', '/api/contacts', genericPayload),
    ];

    for (const attempt of attempts) {
      const result = await attempt();
      if (result) {
        return true;
      }
    }

    return false;
  }

  private extractChatsPayload(payload: any): any[] {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (Array.isArray(payload?.chats)) {
      return payload.chats;
    }

    return [];
  }

  private extractLidMappingsPayload(payload: any): WahaLidMapping[] {
    const candidates = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.data)
          ? payload.data
          : [];

    return candidates
      .map((entry: any) => ({
        lid: String(entry?.lid || '').trim(),
        pn: String(entry?.pn || '').trim(),
      }))
      .filter((entry) => Boolean(entry.lid) && Boolean(entry.pn));
  }

  private getChatDedupKey(chat: any): string {
    return String(
      chat?.id ||
        chat?.chatId ||
        chat?.contactId ||
        chat?.phone ||
        chat?.contact?.phone ||
        '',
    ).trim();
  }

  private async collectChatsWithPagination(
    pathBuilder: (offset: number, limit: number) => string,
    options?: { timeoutMs?: number },
  ): Promise<any[] | null> {
    const pageSize = 200;
    const maxPages = 10;
    const collected: any[] = [];
    const seen = new Set<string>();

    for (let page = 0; page < maxPages; page += 1) {
      const offset = page * pageSize;
      const payload = await this.tryRequest<any>(
        'GET',
        pathBuilder(offset, pageSize),
        undefined,
        options,
      );

      if (!payload) {
        return page === 0 ? null : collected;
      }

      const rows = this.extractChatsPayload(payload);
      if (!rows.length) {
        break;
      }

      let added = 0;
      for (const chat of rows) {
        const key = this.getChatDedupKey(chat);
        if (key) {
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
        }
        collected.push(chat);
        added += 1;
      }

      if (rows.length < pageSize || added === 0) {
        break;
      }
    }

    return collected;
  }

  async getChats(sessionId: string): Promise<any> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    if (!this.shouldSkipChatsOverview(resolvedSessionId)) {
      const overview = await this.collectChatsWithPagination(
        (offset, limit) =>
          `/api/${encodeURIComponent(resolvedSessionId)}/chats/overview?limit=${limit}&offset=${offset}`,
        {
          timeoutMs: this.chatsOverviewTimeoutMs,
        },
      );

      if (overview?.length) {
        this.clearChatsOverviewFailure(resolvedSessionId);
        return overview;
      }

      this.markChatsOverviewFailure(resolvedSessionId);
    }

    const chats = await this.collectChatsWithPagination((offset, limit) => {
      return `/api/${encodeURIComponent(resolvedSessionId)}/chats?limit=${limit}&offset=${offset}`;
    });

    if (chats?.length) {
      return chats;
    }

    return this.request('GET', `/api/${encodeURIComponent(resolvedSessionId)}/chats`);
  }

  async getChatMessages(
    sessionId: string,
    chatId: string,
    options?: { limit?: number; offset?: number; downloadMedia?: boolean },
  ): Promise<any> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const normalizedChatId = this.formatChatId(chatId);
    const limit = Math.max(1, Math.min(100, options?.limit || 20));
    const offset = Math.max(0, options?.offset || 0);
    const downloadMedia = options?.downloadMedia === true ? 'true' : 'false';

    const sessionScoped = await this.tryRequest<any>(
      'GET',
      `/api/${encodeURIComponent(resolvedSessionId)}/chats/${encodeURIComponent(normalizedChatId)}/messages?limit=${limit}&offset=${offset}&downloadMedia=${downloadMedia}`,
    );

    if (sessionScoped) {
      return sessionScoped;
    }

    return this.request<any>(
      'GET',
      `/api/messages?session=${encodeURIComponent(resolvedSessionId)}&chatId=${encodeURIComponent(normalizedChatId)}&limit=${limit}&offset=${offset}&downloadMedia=${downloadMedia}`,
    );
  }

  async isRegisteredUser(sessionId: string, phone: string): Promise<boolean> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    try {
      const chatId = this.formatChatId(phone);
      const res = await this.request<any>(
        'GET',
        `/api/contacts/check-exists?session=${encodeURIComponent(resolvedSessionId)}&phone=${encodeURIComponent(chatId)}`,
      );
      return res?.numberExists === true;
    } catch {
      return false;
    }
  }

  async sendSeen(sessionId: string, chatId: string): Promise<void> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    for (const candidate of this.buildChatIdCandidates(chatId)) {
      const delivered = await this.tryRequest('POST', '/api/sendSeen', {
        session: resolvedSessionId,
        chatId: candidate,
      });

      if (delivered) {
        return;
      }
    }
  }

  async readChatMessages(sessionId: string, chatId: string): Promise<void> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const candidates = this.buildChatIdCandidates(chatId);

    for (const candidate of candidates) {
      const sessionScoped = await this.tryRequest(
        'POST',
        `/api/${encodeURIComponent(resolvedSessionId)}/chats/${encodeURIComponent(candidate)}/messages/read`,
      );

      if (sessionScoped) {
        return;
      }
    }

    for (const candidate of candidates) {
      await this.sendSeen(resolvedSessionId, candidate).catch(() => undefined);
    }
  }

  async setPresence(
    sessionId: string,
    presence: 'available' | 'offline' | 'typing' | 'paused',
    chatId?: string,
  ): Promise<void> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const payload: Record<string, any> = { presence };

    if (chatId) {
      payload.chatId = this.formatChatId(chatId);
    }

    await this.request(
      'POST',
      `/api/${encodeURIComponent(resolvedSessionId)}/presence`,
      payload,
    ).catch(() => {});
  }

  async sendTyping(sessionId: string, chatId: string): Promise<void> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const payload = {
      session: resolvedSessionId,
      chatId: this.formatChatId(chatId),
    };

    const direct = await this.tryRequest('POST', '/api/startTyping', payload);
    if (direct) return;

    await this.request(
      'POST',
      `/api/${encodeURIComponent(resolvedSessionId)}/presence`,
      {
        chatId: this.formatChatId(chatId),
        presence: 'typing',
      },
    ).catch(() => {});
  }

  async stopTyping(sessionId: string, chatId: string): Promise<void> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const payload = {
      session: resolvedSessionId,
      chatId: this.formatChatId(chatId),
    };

    const direct = await this.tryRequest('POST', '/api/stopTyping', payload);
    if (direct) return;

    await this.request(
      'POST',
      `/api/${encodeURIComponent(resolvedSessionId)}/presence`,
      {
        chatId: this.formatChatId(chatId),
        presence: 'paused',
      },
    ).catch(() => {});
  }

  private async tryGetQrImage(
    method: 'GET' | 'POST',
    path: string,
  ): Promise<Response | null> {
    try {
      const res = await this.rawRequest(method, path, undefined, {
        headers: { Accept: 'image/png, application/json' },
      });
      if (!res.ok) return null;
      return res;
    } catch {
      return null;
    }
  }

  // ─── UTILITIES ────────────────────────────────────────────

  private buildChatIdCandidates(chatId: string): string[] {
    const raw = String(chatId || '').trim();
    const phone = this.extractPhoneFromChatId(raw);

    return Array.from(
      new Set(
        [
          raw,
          this.formatChatId(raw),
          phone ? `${phone}@c.us` : '',
          phone ? `${phone}@s.whatsapp.net` : '',
        ].filter(Boolean),
      ),
    );
  }

  private isPlaceholderContactName(
    value: unknown,
    phone?: string | null,
  ): boolean {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return true;
    }

    const lowered = normalized.toLowerCase();
    const phoneDigits = this.extractPhoneFromChatId(String(phone || ''));

    if (
      lowered === 'doe' ||
      lowered === 'unknown' ||
      lowered === 'desconhecido'
    ) {
      return true;
    }

    if (/^\+?\d[\d\s-]*\s+doe$/i.test(normalized)) {
      return true;
    }

    if (phoneDigits && lowered === `${phoneDigits} doe`) {
      return true;
    }

    if (phoneDigits && this.extractPhoneFromChatId(normalized) === phoneDigits) {
      return true;
    }

    return false;
  }

  private formatChatId(phone: string): string {
    const normalized = String(phone || '').trim();
    if (!normalized) {
      return '';
    }
    if (normalized.includes('@')) {
      return normalized;
    }
    const cleaned = normalized.replace(/\D/g, '');
    return `${cleaned}@c.us`;
  }

  extractPhoneFromChatId(chatId: string): string {
    return String(chatId || '')
      .trim()
      .replace(/@.*$/, '')
      .replace(/\D/g, '');
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.request<any>('GET', '/api/sessions');
      return Array.isArray(res);
    } catch {
      return false;
    }
  }
}
