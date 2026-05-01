import { Logger } from '@nestjs/common';
import type { WahaSessionOverview } from '../waha-types';
import { resolveWahaSessionState } from '../waha-types';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type ListSessionsHelperDeps = {
  request: (method: HttpMethod, path: string) => Promise<unknown>;
  readRecord: (value: unknown) => Record<string, unknown>;
  readString: (value: unknown) => string | null;
  resolveSessionIdentity: (
    payload: unknown,
    options?: { allowTopLevelName?: boolean },
  ) => { phoneNumber: string | null; pushName: string | null; selfIds: string[] };
};

export type LogoutSessionHelperDeps = {
  request: (method: HttpMethod, path: string, body?: unknown) => Promise<unknown>;
};

export async function listSessionsHelper(
  deps: ListSessionsHelperDeps,
  logger: Logger,
  opsAlert:
    | { alertOnDegradation: (msg: string, loc: string, meta?: Record<string, unknown>) => void }
    | undefined,
): Promise<WahaSessionOverview[]> {
  try {
    const data = await deps.request('GET', '/api/sessions');
    if (!Array.isArray(data)) {
      return [];
    }
    return data
      .map((entry): WahaSessionOverview | null => {
        const entryRecord = deps.readRecord(entry);
        const resolvedStatus = resolveWahaSessionState(entryRecord);
        const identity = deps.resolveSessionIdentity(entryRecord, { allowTopLevelName: false });
        const name = deps.readString(entryRecord.name);
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
    opsAlert?.alertOnDegradation(msg.message, 'WahaSessionProvider.listSessions');
    logger.warn(`Failed to list WAHA sessions: ${msg.message}`);
    return [];
  }
}

export async function logoutSessionHelper(
  deps: LogoutSessionHelperDeps,
  resolvedSessionId: string,
  opsAlert:
    | {
        alertOnDegradation: (msg: string, loc: string, meta?: Record<string, unknown>) => void;
        alertOnCriticalError: (err: unknown, loc: string, meta?: Record<string, unknown>) => void;
      }
    | undefined,
): Promise<{ success: boolean; message: string }> {
  try {
    await deps.request('POST', '/api/sessions/logout', { name: resolvedSessionId });
    return { success: true, message: 'session_logged_out' };
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    try {
      opsAlert?.alertOnDegradation(msg.message, 'WahaSessionProvider.logoutSession.primary', {
        metadata: { sessionId: resolvedSessionId },
      });
      await deps.request('POST', '/api/sessions/stop', { name: resolvedSessionId, logout: true });
      return { success: true, message: 'session_logged_out' };
    } catch (fallbackErr: unknown) {
      const fallbackMsg =
        fallbackErr instanceof Error
          ? fallbackErr
          : new Error(typeof fallbackErr === 'string' ? fallbackErr : 'unknown error');
      opsAlert?.alertOnCriticalError(fallbackErr, 'WahaSessionProvider.logoutSession.fallback', {
        metadata: { sessionId: resolvedSessionId },
      });
      return { success: false, message: fallbackMsg?.message || msg?.message || 'logout_failed' };
    }
  }
}
