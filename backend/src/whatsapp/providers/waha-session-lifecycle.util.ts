/**
 * Pure utility functions for WAHA session lifecycle helpers.
 * Handles session setup (ensureSessionExists, ensureSessionConfigured),
 * QR code retrieval, and LID mapping pagination.
 *
 * Extracted from WahaSessionProvider to keep that file under 400 lines.
 */

import { Logger } from '@nestjs/common';
import type { QrCodeResponse, WahaLidMapping, WahaSessionConfigDiagnostics } from './waha-types';
import { extractLidMappingsPayload } from './waha-session-config.util';
import { findFirstSequential } from '../../common/async-sequence';

// ─── Callback-based deps (avoids protected/public conflicts) ──

export interface SessionSetupDeps {
  requestFn: (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ) => Promise<unknown>;
  getSessionStatus: (id: string) => Promise<{ state: string | null } | null>;
  deleteSession: (id: string) => Promise<boolean>;
  syncSessionConfig: (id: string) => Promise<void>;
  buildSessionConfig: () => unknown;
  getSessionConfigDiagnostics: (id: string) => Promise<WahaSessionConfigDiagnostics | null>;
  allowConnectedSessionConfigSync: boolean;
  logger: Logger;
}

export interface QrCodeDeps {
  rawRequestFn: (
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    options?: { headers?: Record<string, string>; timeoutMs?: number },
  ) => Promise<Response>;
  parseJsonSafelyFn: <T>(res: Response, fallback: T) => Promise<T>;
  logger: Logger;
}

export interface LidMappingDeps {
  tryRequestFn: <T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string) => Promise<T | null>;
  logger: Logger;
}

// ─── Session setup helpers ─────────────────────────────────

function isAlreadyExistsMessage(message?: string): boolean {
  const lower = String(message || '').toLowerCase();
  return lower.includes('already') || lower.includes('exist') || lower.includes('conflict');
}

export async function ensureSessionConfigured(
  deps: SessionSetupDeps,
  sessionId: string,
): Promise<void> {
  const diagnostics = await deps.getSessionConfigDiagnostics(sessionId).catch(() => null);
  const mismatchReasons = diagnostics?.mismatchReasons || [];
  const sessionState = diagnostics?.state || null;
  const sessionIsMutable =
    !sessionState ||
    sessionState === 'DISCONNECTED' ||
    sessionState === 'FAILED' ||
    sessionState === 'SCAN_QR_CODE';

  if (diagnostics?.available && diagnostics.configPresent && mismatchReasons.length === 0) {
    return;
  }
  if (
    diagnostics?.available &&
    mismatchReasons.length > 0 &&
    !sessionIsMutable &&
    !deps.allowConnectedSessionConfigSync
  ) {
    deps.logger.error(
      `WAHA session ${sessionId} config drift detected (${mismatchReasons.join(', ')}) while state=${sessionState}. Skipping PUT to avoid restarting a connected session.`,
    );
    return;
  }

  const config = deps.buildSessionConfig();
  const path = `/api/sessions/${encodeURIComponent(sessionId)}`;
  const payloadVariants = [{ config }, config];

  const updated = await findFirstSequential(payloadVariants, async (payload) => {
    try {
      await deps.requestFn('PUT', path, payload);
      return true;
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      const message = String(msg?.message || '');
      if (message.includes('404') || message.toLowerCase().includes('not found')) {
        return true;
      }
      return false;
    }
  });

  if (!updated) {
    deps.logger.warn(
      `Failed to update WAHA session config for ${sessionId}. Session may be missing webhooks/store settings.`,
    );
  }
}

export async function ensureSessionExists(
  deps: SessionSetupDeps,
  sessionId: string,
): Promise<void> {
  const currentStatus = await deps.getSessionStatus(sessionId).catch(() => null);
  if (currentStatus?.state === 'FAILED') {
    deps.logger.warn(
      `WAHA session ${sessionId} is FAILED. Deleting it before recreating a clean session.`,
    );
    await deps.deleteSession(sessionId).catch((error: unknown) => {
      deps.logger.warn(
        `Failed to delete FAILED WAHA session ${sessionId}: ${error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown error'}`,
      );
    });
  }

  const createPayload = { name: sessionId, config: deps.buildSessionConfig() };
  try {
    await deps.requestFn('POST', '/api/sessions', createPayload);
    return;
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    if (isAlreadyExistsMessage(msg?.message)) {
      await deps.syncSessionConfig(sessionId);
      return;
    }
  }

  try {
    await deps.requestFn('POST', '/api/sessions/start', { name: sessionId });
    await deps.syncSessionConfig(sessionId);
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    if (!isAlreadyExistsMessage(msg?.message)) {
      throw err;
    }
    await deps.syncSessionConfig(sessionId);
  }
}

// ─── QR code helper ───────────────────────────────────────

async function tryGetQrImage(
  deps: QrCodeDeps,
  method: 'GET' | 'POST',
  path: string,
): Promise<Response | null> {
  try {
    const res = await deps.rawRequestFn(method, path, undefined, {
      headers: { Accept: 'image/png, application/json' },
      timeoutMs: 1500,
    });
    if (!res.ok) {
      return null;
    }
    return res;
  } catch {
    return null;
  }
}

export async function getQrCode(
  deps: QrCodeDeps,
  resolvedSessionId: string,
): Promise<QrCodeResponse> {
  try {
    const res =
      (await tryGetQrImage(
        deps,
        'POST',
        `/api/${encodeURIComponent(resolvedSessionId)}/auth/qr`,
      )) ||
      (await tryGetQrImage(deps, 'GET', `/api/${encodeURIComponent(resolvedSessionId)}/auth/qr`)) ||
      (await tryGetQrImage(
        deps,
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

    const data = await deps.parseJsonSafelyFn<Record<string, unknown> | null>(res, null);
    if (typeof data?.value === 'string') {
      return { success: true, qr: data.value };
    }
    if (
      typeof data?.value === 'number' ||
      typeof data?.value === 'boolean' ||
      typeof data?.value === 'bigint'
    ) {
      return { success: true, qr: String(data.value) };
    }
    if (typeof data?.qr === 'string') {
      return { success: true, qr: data.qr };
    }
    if (
      typeof data?.qr === 'number' ||
      typeof data?.qr === 'boolean' ||
      typeof data?.qr === 'bigint'
    ) {
      return { success: true, qr: String(data.qr) };
    }
    return { success: false, message: 'QR not available in response' };
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    deps.logger.warn(`Failed to get QR code: ${msg.message}`);
    return { success: false, message: msg.message };
  }
}

// ─── LID mapping pagination ───────────────────────────────

export async function listLidMappings(
  deps: LidMappingDeps,
  resolvedSessionId: string,
  options?: { limit?: number },
): Promise<WahaLidMapping[]> {
  const pageSize = Math.max(1, Math.min(200, Number(options?.limit || 200) || 200));
  const maxPages = Math.max(
    1,
    Math.min(20, Math.ceil((Number(options?.limit || 4000) || 4000) / pageSize)),
  );
  const collected: WahaLidMapping[] = [];
  const seen = new Set<string>();

  const fetchPage = async (page: number): Promise<void> => {
    if (page >= maxPages) {
      return;
    }
    const offset = page * pageSize;
    const payload = await deps.tryRequestFn<Record<string, unknown> | unknown[]>(
      'GET',
      `/api/${encodeURIComponent(resolvedSessionId)}/lids?limit=${pageSize}&offset=${offset}`,
    );
    if (!payload) {
      return;
    }
    const rows = extractLidMappingsPayload(payload);
    if (!rows.length) {
      return;
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
      return;
    }
    await fetchPage(page + 1);
  };

  await fetchPage(0);
  return collected;
}
