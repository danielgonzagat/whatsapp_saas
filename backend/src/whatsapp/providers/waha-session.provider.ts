// PULSE:OK — session lifecycle layer for WAHA.
// Config/diagnostics live in WahaSessionConfigProvider (waha-session-config.provider.ts).
// Setup/QR/LID helpers live in waha-session-lifecycle.util.ts.
// Messaging lives in WahaProvider (waha.provider.ts).
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  resolveWahaSessionState,
  type SessionStatus,
  type QrCodeResponse,
  type WahaLidMapping,
  type WahaSessionOverview,
} from './waha-types';
import { WahaSessionConfigProvider } from './waha-session-config.provider';
import {
  ensureSessionConfigured,
  ensureSessionExists,
  getQrCode,
  listLidMappings,
} from './waha-session-lifecycle.util';

/**
 * Session lifecycle layer for WAHA.
 * Handles: startSession, restartSession, terminateSession, deleteSession,
 * logoutSession, getSessionStatus, listSessions, listLidMappings,
 * syncSessionConfig, getQrCode, and supporting state tracking.
 *
 * WahaProvider extends this class and adds messaging + contacts.
 */
@Injectable()
export class WahaSessionProvider extends WahaSessionConfigProvider {
  protected readonly startingSessions: Set<string> = new Set();

  constructor(configService: ConfigService) {
    super(configService);
  }

  // ─── Session runtime guards ───────────────────────────────

  private assertSessionRuntimeReady() {
    const diagnostics = this.getRuntimeConfigDiagnostics();
    if (diagnostics.allowSessionWithoutWebhook) {
      return;
    }
    if (!diagnostics.webhookConfigured) {
      throw new Error('WAHA webhook URL not configured or not publicly reachable');
    }
    if (!diagnostics.inboundEventsConfigured) {
      throw new Error('WAHA webhook events must include message inbound events');
    }
  }

  protected shouldSkipChatsOverview(sessionId: string): boolean {
    const skipUntil = this.skipChatsOverviewUntil.get(sessionId) || 0;
    if (skipUntil <= Date.now()) {
      this.skipChatsOverviewUntil.delete(sessionId);
      return false;
    }
    return true;
  }

  protected markChatsOverviewFailure(sessionId: string) {
    this.skipChatsOverviewUntil.set(sessionId, Date.now() + this.chatsOverviewFailureTtlMs);
  }

  protected clearChatsOverviewFailure(sessionId: string) {
    this.skipChatsOverviewUntil.delete(sessionId);
  }

  // ─── Deps factories ───────────────────────────────────────

  private makeSetupDeps() {
    return {
      requestFn: (method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown) =>
        this.request(method, path, body),
      getSessionStatus: (id: string) => this.getSessionStatus(id).catch(() => null),
      deleteSession: (id: string) => this.deleteSession(id),
      syncSessionConfig: (id: string) => this.syncSessionConfig(id),
      buildSessionConfig: () => this.buildSessionConfig(),
      getSessionConfigDiagnostics: (id: string) =>
        this.getSessionConfigDiagnostics(id).catch(() => null),
      allowConnectedSessionConfigSync: this.allowConnectedSessionConfigSync,
      logger: this.logger,
    };
  }

  private makeQrCodeDeps() {
    return {
      rawRequestFn: (
        method: 'GET' | 'POST',
        path: string,
        body?: unknown,
        options?: { headers?: Record<string, string>; timeoutMs?: number },
      ) => this.rawRequest(method, path, body, options),
      parseJsonSafelyFn: <T>(res: Response, fallback: T) => this.parseJsonSafely(res, fallback),
      logger: this.logger,
    };
  }

  private makeLidDeps() {
    return {
      tryRequestFn: <T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string) =>
        this.tryRequest<T>(method, path),
      logger: this.logger,
    };
  }

  // ─── SESSION LIFECYCLE ────────────────────────────────────

  async startSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    this.assertSessionRuntimeReady();

    if (this.startingSessions.has(resolvedSessionId)) {
      return { success: true, message: 'session_starting' };
    }

    try {
      const status = await this.getSessionStatus(sessionId);
      if (status?.state === 'CONNECTED') {
        return { success: true, message: 'already_connected' };
      }
    } catch {
      // Session might not exist yet
    }

    this.logger.log(
      `Starting WAHA session: ${resolvedSessionId} (workspace/session key: ${sessionId})`,
    );
    this.startingSessions.add(resolvedSessionId);
    try {
      await ensureSessionExists(this.makeSetupDeps(), resolvedSessionId);
      const directStart = await this.tryRequest(
        'POST',
        `/api/sessions/${encodeURIComponent(resolvedSessionId)}/start`,
      );
      if (!directStart) {
        await this.request('POST', '/api/sessions/start', { name: resolvedSessionId });
      }
      return { success: true, message: 'session_started' };
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      const message = String(msg.message || '').toLowerCase();
      if (
        message.includes('already') ||
        message.includes('exist') ||
        message.includes('session_starting')
      ) {
        return { success: true, message: 'session_exists' };
      }
      this.logger.warn(`Failed to start session ${resolvedSessionId}: ${msg.message}`);
      return { success: false, message: msg.message };
    } finally {
      this.startingSessions.delete(resolvedSessionId);
    }
  }

  /** Get session status. */
  async getSessionStatus(sessionId: string): Promise<SessionStatus> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    try {
      const data = await this.request<Record<string, unknown>>(
        'GET',
        `/api/sessions/${encodeURIComponent(resolvedSessionId)}`,
      );
      const resolvedStatus = resolveWahaSessionState(data);
      const identity = this.resolveSessionIdentity(data);
      return {
        success: true,
        state: resolvedStatus.state,
        message: resolvedStatus.rawStatus,
        phoneNumber: identity.phoneNumber,
        pushName: identity.pushName,
        selfIds: identity.selfIds,
      };
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      return { success: false, state: null, message: msg.message };
    }
  }

  /** List sessions. */
  async listSessions(): Promise<WahaSessionOverview[]> {
    try {
      const data = await this.request<unknown[]>('GET', '/api/sessions');
      if (!Array.isArray(data)) {
        return [];
      }
      return data
        .map((entry): WahaSessionOverview | null => {
          const entryRecord = this.readRecord(entry);
          const resolvedStatus = resolveWahaSessionState(entryRecord);
          const identity = this.resolveSessionIdentity(entryRecord, { allowTopLevelName: false });
          const name = this.readString(entryRecord.name);
          if (!name) {
            return null;
          }
          return {
            name,
            success: true,
            rawStatus: resolvedStatus.rawStatus,
            state: resolvedStatus.state,
            phoneNumber: identity.phoneNumber,
            pushName: identity.pushName,
          };
        })
        .filter((entry): entry is WahaSessionOverview => Boolean(entry));
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      this.logger.warn(`Failed to list WAHA sessions: ${msg.message}`);
      return [];
    }
  }

  /** List lid mappings. */
  async listLidMappings(
    sessionId: string,
    options?: { limit?: number },
  ): Promise<WahaLidMapping[]> {
    return listLidMappings(this.makeLidDeps(), this.resolveSessionName(sessionId), options);
  }

  /** Sync session config. */
  async syncSessionConfig(sessionId: string): Promise<void> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    const now = Date.now();
    const lastSyncedAt = this.sessionConfigSyncedAt.get(resolvedSessionId) || 0;

    if (now - lastSyncedAt < this.sessionConfigSyncTtlMs) {
      return;
    }

    try {
      const diagnostics = await this.getSessionConfigDiagnostics(resolvedSessionId);
      if (!diagnostics.available) {
        this.logger.warn(
          `Skipping WAHA session config sync for ${resolvedSessionId}: diagnostics unavailable (${diagnostics.error || 'unknown_error'}).`,
        );
        return;
      }
      if (diagnostics.configMismatch && diagnostics.mismatchReasons?.length) {
        this.logger.warn(
          `WAHA session ${resolvedSessionId} drift detected: ${diagnostics.mismatchReasons.join(', ')}.`,
        );
      }
      await ensureSessionConfigured(this.makeSetupDeps(), resolvedSessionId);
      this.sessionConfigSyncedAt.set(resolvedSessionId, now);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      this.logger.warn(
        `Failed to synchronize WAHA session config for ${resolvedSessionId}: ${msg.message}`,
      );
    }
  }

  /** Get qr code. */
  async getQrCode(sessionId: string): Promise<QrCodeResponse> {
    return getQrCode(this.makeQrCodeDeps(), this.resolveSessionName(sessionId));
  }

  /** Restart session. */
  async restartSession(sessionId: string): Promise<{ success: boolean; message: string }> {
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
      await this.request('POST', '/api/sessions/stop', { name: resolvedSessionId });
    } catch {
      // Ignore stop errors
    }
    return this.startSession(sessionId);
  }

  /** Terminate session. */
  async terminateSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    try {
      const directStop = await this.tryRequest(
        'POST',
        `/api/sessions/${encodeURIComponent(resolvedSessionId)}/stop`,
      );
      if (!directStop) {
        await this.request('POST', '/api/sessions/stop', { name: resolvedSessionId });
      }
      return { success: true, message: 'session_stopped' };
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      return { success: false, message: msg.message };
    }
  }

  /** Delete session. */
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
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      if (
        String(msg?.message || '')
          .toLowerCase()
          .includes('not found')
      ) {
        return true;
      }
      throw error;
    }
  }

  /** Logout session. */
  async logoutSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    const resolvedSessionId = this.resolveSessionName(sessionId);
    try {
      await this.request('POST', '/api/sessions/logout', { name: resolvedSessionId });
      return { success: true, message: 'session_logged_out' };
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      try {
        await this.request('POST', '/api/sessions/stop', { name: resolvedSessionId, logout: true });
        return { success: true, message: 'session_logged_out' };
      } catch (fallbackErr: unknown) {
        const fallbackMsg =
          fallbackErr instanceof Error
            ? fallbackErr
            : new Error(typeof fallbackErr === 'string' ? fallbackErr : 'unknown error');
        return { success: false, message: fallbackMsg?.message || msg?.message || 'logout_failed' };
      }
    }
  }
}
