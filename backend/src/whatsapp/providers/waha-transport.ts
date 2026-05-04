import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getTraceHeaders } from '../../common/trace-headers';
import { OpsAlertService } from '../../observability/ops-alert.service';
import { WAHA_MESSAGE_EVENT, WAHA_MESSAGE_WILDCARD_EVENT } from './waha-message-event-name';

const A_Z_A_Z__A_Z_A_Z_D_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;
const PATTERN_RE = /^\/\//;
const PATTERN_RE_2 = /^\/+/;
const PATTERN_RE_3 = /\/+$/;

/**
 * Low-level HTTP transport for the WAHA (WhatsApp HTTP API) provider.
 * Handles URL resolution, header construction, fetch with timeout/retry
 * diagnostics, and JSON parsing.
 *
 * Extracted from WahaProvider to keep each file under 600 lines.
 * WahaProvider composes this class instead of extending it.
 */
export class WahaTransport {
  protected readonly logger: Logger;
  protected readonly baseUrl: string;
  protected readonly apiKey: string;
  protected opsAlert?: OpsAlertService;
  protected readonly defaultWebhookEvents = [
    'session.status',
    WAHA_MESSAGE_EVENT,
    WAHA_MESSAGE_WILDCARD_EVENT,
    'message.ack',
  ];
  protected readonly quietErrorPaths = new Set<string>();

  constructor(
    protected readonly configService: ConfigService,
    loggerContext: string,
  ) {
    this.logger = new Logger(loggerContext);
    this.baseUrl = this.resolveBaseUrlFromConfig();
    this.apiKey = this.resolveApiKeyFromConfig();
    this.quietErrorPaths.add('/chats/overview');
  }

  protected setOpsAlertService(opsAlert?: OpsAlertService): void {
    this.opsAlert = opsAlert;
  }

  private readFirstConfigValue(keys: readonly string[]): string {
    for (const key of keys) {
      const raw = this.configService.get<string>(key);
      if (raw) {
        return raw;
      }
    }
    return '';
  }

  protected resolveBaseUrlFromConfig(): string {
    const raw = this.readFirstConfigValue(['WAHA_API_URL', 'WAHA_BASE_URL', 'WAHA_URL']);
    return raw.trim().replace(/\/+$/, '');
  }

  protected resolveApiKeyFromConfig(): string {
    return this.readFirstConfigValue(['WAHA_API_KEY', 'WAHA_API_TOKEN']);
  }

  protected readBooleanEnv(keys: string[], defaultValue: boolean): boolean {
    for (const key of keys) {
      const rawValue = this.configService.get<string>(key);
      if (typeof rawValue !== 'string' || !rawValue.trim()) {
        continue;
      }
      const normalized = rawValue.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }
    return defaultValue;
  }

  protected buildHeaders(overrides?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json', ...overrides };
    if (this.apiKey) {
      headers['X-Api-Key'] = this.apiKey;
    }
    return headers;
  }

  protected normalizePublicUrl(rawValue?: string | null): string {
    const raw = String(rawValue || '').trim();
    if (!raw) {
      return '';
    }
    const allowInternalWebhookUrl = this.readBooleanEnv(['WAHA_ALLOW_INTERNAL_WEBHOOK_URL'], false);

    const withProtocol =
      A_Z_A_Z__A_Z_A_Z_D_RE.test(raw) || raw.startsWith('//')
        ? raw.replace(PATTERN_RE, 'https://')
        : raw.includes('.')
          ? `https://${raw.replace(PATTERN_RE_2, '')}`
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
      return url.toString().replace(PATTERN_RE_3, '');
    } catch {
      return '';
    }
  }

  /** Resolve the configured webhook URL to register with WAHA sessions. */
  resolveWebhookUrl(): string {
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

  /** Resolve the list of WAHA webhook events to subscribe to. */
  resolveWebhookEvents(): string[] {
    const raw =
      this.configService.get<string>('WHATSAPP_HOOK_EVENTS') ||
      this.configService.get<string>('WAHA_HOOK_EVENTS') ||
      '';
    const configuredEvents = raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    return configuredEvents.length ? configuredEvents : [...this.defaultWebhookEvents];
  }

  protected async parseJsonSafely<T>(res: Response, fallback: T): Promise<T> {
    const text = await res.text().catch(() => '');
    if (!text) {
      return fallback;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      this.logger.warn(`JSON parse failed for response: ${text.substring(0, 200)}`);
      return fallback;
    }
  }

  /** Make a raw HTTP request to the WAHA API (no JSON parsing). */
  async rawRequest(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    options?: { headers?: Record<string, string>; timeoutMs?: number },
  ): Promise<Response> {
    if (!this.baseUrl) {
      throw new Error('WAHA_API_URL/WAHA_BASE_URL/WAHA_URL not configured');
    }

    // Not SSRF: this.baseUrl is derived from server-owned WAHA_API_URL env vars
    // (intentional backend-to-WAHA internal service communication)
    const url = `${this.baseUrl}${path}`;
    const hasBody = body !== undefined;
    const timeoutMs = options?.timeoutMs ?? 15_000;
    const headers = this.buildHeaders({
      ...getTraceHeaders(),
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
    } catch (rawErr: unknown) {
      const err =
        rawErr instanceof Error
          ? rawErr
          : new Error(typeof rawErr === 'string' ? rawErr : 'unknown error');
      let diagnosis = err.message;
      if (err.name === 'AbortError') {
        diagnosis = `TIMEOUT after ${timeoutMs}ms connecting to ${this.baseUrl}`;
      } else if ((err as Error & { cause?: { code?: string } }).cause?.code === 'ECONNREFUSED') {
        diagnosis = `ECONNREFUSED — WAHA at ${this.baseUrl} is not reachable.`;
      }
      const shouldLogQuietly = Array.from(this.quietErrorPaths).some((suffix) =>
        path.includes(suffix),
      );
      if (shouldLogQuietly) {
        void this.opsAlert?.alertOnDegradation(diagnosis, 'WahaTransport.rawRequest', {
          metadata: { method, path },
        });
        this.logger.warn(`WAHA optional request failed: ${method} ${path} -> ${diagnosis}`);
      } else {
        void this.opsAlert?.alertOnCriticalError(err, 'WahaTransport.rawRequest', {
          metadata: { method, path, diagnosis },
        });
        this.logger.error(`WAHA request failed: ${method} ${path} -> ${diagnosis}`);
      }
      throw new Error(diagnosis);
    }
  }

  /** Make a typed HTTP request to the WAHA API (throws on HTTP error). */
  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    options?: { headers?: Record<string, string>; timeoutMs?: number },
  ): Promise<T> {
    const res = await this.rawRequest(method, path, body, options);

    if (!res.ok) {
      const parsed = await this.parseJsonSafely<Record<string, unknown> | null>(res, null);
      const message =
        (parsed && typeof parsed.message === 'string' && parsed.message) ||
        (parsed && typeof parsed.error === 'string' && parsed.error) ||
        `HTTP ${res.status}`;
      throw new Error(message);
    }

    const parsed = await this.parseJsonSafely<T | null>(res, null);
    if (parsed === null) {
      throw new Error(`WAHA returned empty JSON for ${method} ${path}`);
    }
    return parsed;
  }

  /** Make a typed HTTP request; returns null instead of throwing on error. */
  async tryRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    options?: { headers?: Record<string, string>; timeoutMs?: number },
  ): Promise<T | null> {
    try {
      return await this.request<T>(method, path, body, options);
    } catch {
      return null;
    }
  }
}
