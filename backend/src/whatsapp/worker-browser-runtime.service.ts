import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type WorkerBrowserSnapshot = {
  workspaceId: string;
  state: string;
  provider: 'whatsapp-web-agent';
  connected: boolean;
  phoneNumber?: string | null;
  pushName?: string | null;
  message?: string | null;
  lastError?: string | null;
  currentUrl?: string | null;
  title?: string | null;
  screenshotDataUrl?: string | null;
  screenshotUpdatedAt?: string | null;
  viewerAvailable?: boolean;
  takeoverActive?: boolean;
  agentPaused?: boolean;
  lastObservationAt?: string | null;
  lastActionAt?: string | null;
  observationSummary?: string | null;
  activeProvider?: string | null;
  proofCount?: number;
  viewport?: {
    width: number;
    height: number;
  };
  updatedAt?: string;
};

type WorkerBrowserProof = {
  id: string;
  workspaceId: string;
  kind: string;
  provider: string;
  summary: string;
  objective?: string | null;
  beforeImage?: string | null;
  afterImage?: string | null;
  action?: any;
  observation?: any;
  metadata?: Record<string, any> | null;
  createdAt: string;
};

@Injectable()
export class WorkerBrowserRuntimeService {
  private readonly logger = new Logger(WorkerBrowserRuntimeService.name);
  private readonly requestTimeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.requestTimeoutMs = Math.max(
      1_000,
      parseInt(
        this.config.get<string>('WORKER_BROWSER_RUNTIME_TIMEOUT_MS') || '10000',
        10,
      ) || 10_000,
    );
  }

  private resolveBaseUrl(): string {
    const configured =
      this.config.get<string>('WORKER_BROWSER_RUNTIME_URL') ||
      this.config.get<string>('WORKER_HEALTH_URL') ||
      this.config.get<string>('WORKER_METRICS_URL') ||
      'http://worker:3003';

    return configured.trim().replace(/\/+$/, '');
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    const internalKey = this.config.get<string>('INTERNAL_API_KEY');
    const metricsToken = this.config.get<string>('WORKER_METRICS_TOKEN');

    if (internalKey) {
      headers['X-Internal-Key'] = internalKey;
    } else if (metricsToken) {
      headers.Authorization = `Bearer ${metricsToken}`;
    }

    return headers;
  }

  private createRuntimeError(
    code: string,
    error?: any,
    details?: Record<string, any>,
  ): Error {
    const runtimeError = new Error(code);
    (runtimeError as any).code = code;
    if (error !== undefined) {
      (runtimeError as any).cause = error;
    }
    if (details) {
      (runtimeError as any).details = details;
    }
    return runtimeError;
  }

  private classifyRuntimeError(error: any): string {
    const code = String(
      error?.code ||
        error?.cause?.code ||
        error?.message ||
        error?.cause?.message ||
        '',
    ).trim();
    const normalized = code.toUpperCase();

    if (
      normalized === 'ENOTFOUND' ||
      normalized === 'ECONNREFUSED' ||
      normalized === 'ECONNRESET' ||
      normalized === 'EHOSTUNREACH' ||
      normalized === 'UND_ERR_CONNECT_TIMEOUT'
    ) {
      return 'worker_browser_runtime_unreachable';
    }

    if (
      normalized === 'ABORTERROR' ||
      normalized === 'TIMEOUTERROR' ||
      normalized === 'UND_ERR_HEADERS_TIMEOUT' ||
      normalized === 'UND_ERR_BODY_TIMEOUT'
    ) {
      return 'worker_browser_runtime_timeout';
    }

    if (normalized.startsWith('WORKER_BROWSER_RUNTIME_')) {
      return code;
    }

    return 'worker_browser_runtime_request_failed';
  }

  getErrorCode(error: any): string {
    return String(
      error?.code || error?.message || 'worker_browser_runtime_request_failed',
    ).trim();
  }

  isRuntimeUnavailableError(error: any): boolean {
    const code = this.getErrorCode(error);
    return (
      code === 'worker_browser_runtime_unreachable' ||
      code === 'worker_browser_runtime_timeout'
    );
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, any>,
  ): Promise<T> {
    const fetchFn = globalThis.fetch?.bind(globalThis);
    if (!fetchFn) {
      throw new Error('fetch_unavailable');
    }

    const baseUrl = this.resolveBaseUrl();
    const url = `${baseUrl}${path}`;

    let response: globalThis.Response;
    try {
      response = await fetchFn(url, {
        method,
        headers: body
          ? {
              ...this.buildHeaders(),
              'Content-Type': 'application/json',
            }
          : this.buildHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal:
          typeof AbortSignal !== 'undefined' &&
          typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(this.requestTimeoutMs)
            : undefined,
      });
    } catch (error: any) {
      const code = this.classifyRuntimeError(error);
      const runtimeError = this.createRuntimeError(code, error, {
        method,
        path,
        baseUrl,
      });

      if (this.isRuntimeUnavailableError(runtimeError)) {
        this.logger.warn(
          `Worker browser runtime unavailable (${code}) for ${method} ${path} via ${baseUrl}`,
        );
      }

      throw runtimeError;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw this.createRuntimeError(
        `worker_browser_runtime_http_${response.status}`,
        undefined,
        {
          method,
          path,
          baseUrl,
          body: text || null,
        },
      );
    }

    return (await response.json()) as T;
  }

  async startSession(workspaceId: string): Promise<WorkerBrowserSnapshot> {
    const data = await this.request<{ snapshot: WorkerBrowserSnapshot }>(
      'POST',
      '/internal/browser/session/start',
      { workspaceId },
    );
    return data.snapshot;
  }

  async getSessionStatus(workspaceId: string): Promise<WorkerBrowserSnapshot> {
    const data = await this.request<{ snapshot: WorkerBrowserSnapshot }>(
      'GET',
      `/internal/browser/session/status?workspaceId=${encodeURIComponent(workspaceId)}`,
    );
    return data.snapshot;
  }

  async getQrCode(workspaceId: string): Promise<WorkerBrowserSnapshot> {
    const data = await this.request<{ snapshot: WorkerBrowserSnapshot }>(
      'GET',
      `/internal/browser/session/qr?workspaceId=${encodeURIComponent(workspaceId)}`,
    );
    return data.snapshot;
  }

  async getViewer(workspaceId: string): Promise<{
    snapshot: WorkerBrowserSnapshot;
    image?: string | null;
  }> {
    return this.request<{ snapshot: WorkerBrowserSnapshot; image?: string | null }>(
      'GET',
      `/internal/browser/session/view?workspaceId=${encodeURIComponent(workspaceId)}`,
    );
  }

  async getScreencastHealth(): Promise<Record<string, any>> {
    const data = await this.request<{ health: Record<string, any> }>(
      'GET',
      '/internal/browser/screencast/health',
    );
    return data.health || {};
  }

  async sendText(params: {
    workspaceId: string;
    to: string;
    message: string;
    quotedMessageId?: string;
    chatId?: string;
  }): Promise<{ success: boolean; message?: string; messageId?: string }> {
    return this.request<{ success: boolean; message?: string; messageId?: string }>(
      'POST',
      '/internal/browser/session/send-text',
      params,
    );
  }

  async sendMedia(params: {
    workspaceId: string;
    to: string;
    mediaType: 'image' | 'video' | 'audio' | 'document';
    mediaUrl: string;
    caption?: string;
    quotedMessageId?: string;
    chatId?: string;
  }): Promise<{ success: boolean; message?: string; messageId?: string }> {
    return this.request<{ success: boolean; message?: string; messageId?: string }>(
      'POST',
      '/internal/browser/session/send-media',
      params,
    );
  }

  async performAction(params: {
    workspaceId: string;
    action: Record<string, any>;
  }): Promise<{ success: boolean; snapshot: WorkerBrowserSnapshot }> {
    return this.request<{ success: boolean; snapshot: WorkerBrowserSnapshot }>(
      'POST',
      '/internal/browser/session/action',
      params,
    );
  }

  async takeover(workspaceId: string): Promise<WorkerBrowserSnapshot> {
    const data = await this.request<{ snapshot: WorkerBrowserSnapshot }>(
      'POST',
      '/internal/browser/session/takeover',
      { workspaceId },
    );
    return data.snapshot;
  }

  async resumeAgent(workspaceId: string): Promise<WorkerBrowserSnapshot> {
    const data = await this.request<{ snapshot: WorkerBrowserSnapshot }>(
      'POST',
      '/internal/browser/session/resume-agent',
      { workspaceId },
    );
    return data.snapshot;
  }

  async pauseAgent(
    workspaceId: string,
    paused = true,
  ): Promise<WorkerBrowserSnapshot> {
    const data = await this.request<{ snapshot: WorkerBrowserSnapshot }>(
      'POST',
      '/internal/browser/session/pause-agent',
      { workspaceId, paused },
    );
    return data.snapshot;
  }

  async reconcileSession(
    workspaceId: string,
    objective?: string,
  ): Promise<{
    success: boolean;
    snapshot: WorkerBrowserSnapshot;
    observation?: any;
  }> {
    return this.request<{
      success: boolean;
      snapshot: WorkerBrowserSnapshot;
      observation?: any;
    }>('POST', '/internal/browser/session/reconcile', {
      workspaceId,
      objective,
    });
  }

  async runActionTurn(params: {
    workspaceId: string;
    objective: string;
    dryRun?: boolean;
    mode?: string;
  }): Promise<{ success: boolean; result: any }> {
    return this.request<{ success: boolean; result: any }>(
      'POST',
      '/internal/browser/session/action-turn',
      params,
    );
  }

  async getProofs(
    workspaceId: string,
    limit = 25,
  ): Promise<WorkerBrowserProof[]> {
    const data = await this.request<{ proofs: WorkerBrowserProof[] }>(
      'GET',
      `/internal/browser/session/proofs?workspaceId=${encodeURIComponent(
        workspaceId,
      )}&limit=${encodeURIComponent(String(limit))}`,
    );
    return data.proofs || [];
  }

  async disconnect(workspaceId: string): Promise<WorkerBrowserSnapshot> {
    const data = await this.request<{ snapshot: WorkerBrowserSnapshot }>(
      'POST',
      '/internal/browser/session/disconnect',
      { workspaceId },
    );
    return data.snapshot;
  }

  async logout(workspaceId: string): Promise<WorkerBrowserSnapshot> {
    const data = await this.request<{ snapshot: WorkerBrowserSnapshot }>(
      'POST',
      '/internal/browser/session/logout',
      { workspaceId },
    );
    return data.snapshot;
  }

  async getChats(workspaceId: string): Promise<any[]> {
    const data = await this.request<{ chats: any[] }>(
      'GET',
      `/internal/browser/chats?workspaceId=${encodeURIComponent(workspaceId)}`,
    );
    return data.chats || [];
  }

  async getChatMessages(
    workspaceId: string,
    chatId?: string,
    options?: { limit?: number; offset?: number; downloadMedia?: boolean },
  ): Promise<any[]> {
    const query = new URLSearchParams({
      workspaceId,
    });
    if (chatId) {
      query.set('chatId', chatId);
    }
    if (typeof options?.limit === 'number') {
      query.set('limit', String(options.limit));
    }
    if (typeof options?.offset === 'number') {
      query.set('offset', String(options.offset));
    }
    if (options?.downloadMedia) {
      query.set('downloadMedia', 'true');
    }

    const data = await this.request<{ messages: any[] }>(
      'GET',
      `/internal/browser/messages?${query.toString()}`,
    );
    return data.messages || [];
  }

  async ping(): Promise<boolean> {
    try {
      await this.request('GET', '/health');
      return true;
    } catch (error: any) {
      this.logger.warn(
        `Worker browser runtime ping failed: ${error?.message || error}`,
      );
      return false;
    }
  }
}
