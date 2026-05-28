import { describe, expect, it, vi } from 'vitest';

import {
  AUTONOMY_ACTIONS,
  CIA_ACTIVE_MODES,
  CIA_MANUAL_PAUSE_MODES,
  PENDING_QR_STATUSES,
  POLL_INTERVALS,
  SESSION_COPY,
  STATUS_RESPONSES,
  TIMEOUTS,
  buildDisconnectedStatus,
  classifyConnectResponse,
  createSessionError,
  hasCompleteCredentials,
  hasConnectionStateChanged,
  isCiaAutonomyActive,
  isPendingQrStatus,
  isQrPollEnabled,
  isSessionPollEnabled,
  needsWorkspaceRecovery,
  normalizeStatusKey,
  pickRecoveredWorkspaceId,
  resolveStatusMessage,
  selectQrCodeFromResponse,
  shouldSkipCiaRuntimeSync,
} from './useWhatsAppSession.helpers';

describe('normalizeStatusKey', () => {
  it('trims and lowercases the status string', () => {
    expect(normalizeStatusKey('  QR_Pending ')).toBe('qr_pending');
    expect(normalizeStatusKey('CONNECTING')).toBe('connecting');
  });

  it('coerces null and undefined to an empty string', () => {
    expect(normalizeStatusKey(null)).toBe('');
    expect(normalizeStatusKey(undefined)).toBe('');
    expect(normalizeStatusKey('')).toBe('');
  });
});

describe('isPendingQrStatus', () => {
  it('returns true for every pending QR status (case-insensitive)', () => {
    for (const s of PENDING_QR_STATUSES) {
      expect(isPendingQrStatus(s)).toBe(true);
      expect(isPendingQrStatus(s.toUpperCase())).toBe(true);
    }
  });

  it('returns false for connected/disconnected/unknown statuses', () => {
    expect(isPendingQrStatus('connected')).toBe(false);
    expect(isPendingQrStatus('disconnected')).toBe(false);
    expect(isPendingQrStatus('totally_unknown')).toBe(false);
    expect(isPendingQrStatus(null)).toBe(false);
    expect(isPendingQrStatus(undefined)).toBe(false);
  });
});

describe('resolveStatusMessage', () => {
  it('returns the active copy when connected, regardless of status string', () => {
    expect(resolveStatusMessage({ connected: true })).toBe(SESSION_COPY.active);
    expect(resolveStatusMessage({ connected: true, status: 'qr_pending' })).toBe(
      SESSION_COPY.active,
    );
  });

  it('returns waiting-QR copy when not connected but mid-handshake', () => {
    expect(resolveStatusMessage({ connected: false, status: 'qr_pending' })).toBe(
      SESSION_COPY.waitingQr,
    );
    expect(resolveStatusMessage({ connected: false, status: 'CONNECTING' })).toBe(
      SESSION_COPY.waitingQr,
    );
  });

  it('returns disconnected copy otherwise', () => {
    expect(resolveStatusMessage({ connected: false })).toBe(SESSION_COPY.disconnected);
    expect(resolveStatusMessage({ connected: false, status: 'failed' })).toBe(
      SESSION_COPY.disconnected,
    );
    expect(resolveStatusMessage({ connected: false, status: null })).toBe(
      SESSION_COPY.disconnected,
    );
  });
});

describe('isCiaAutonomyActive', () => {
  it('returns true for active modes without manual-pause markers', () => {
    expect(isCiaAutonomyActive({ mode: 'LIVE' })).toBe(true);
    expect(isCiaAutonomyActive({ mode: 'BACKLOG' })).toBe(true);
    expect(isCiaAutonomyActive({ mode: 'FULL' })).toBe(true);
    expect(isCiaAutonomyActive({ mode: 'live' })).toBe(true); // case-insensitive
  });

  it('returns false when reason indicates a manual pause even on active mode', () => {
    expect(isCiaAutonomyActive({ mode: 'LIVE', reason: AUTONOMY_ACTIONS.manualPause })).toBe(false);
  });

  it('returns false for manual-pause modes', () => {
    for (const mode of CIA_MANUAL_PAUSE_MODES) {
      expect(isCiaAutonomyActive({ mode })).toBe(false);
    }
  });

  it('returns false for OFF / unknown / null / undefined autonomy payloads', () => {
    expect(isCiaAutonomyActive({ mode: 'OFF' })).toBe(false);
    expect(isCiaAutonomyActive({ mode: 'WHATEVER' })).toBe(false);
    expect(isCiaAutonomyActive({})).toBe(false);
    expect(isCiaAutonomyActive(null)).toBe(false);
    expect(isCiaAutonomyActive(undefined)).toBe(false);
  });
});

describe('createSessionError', () => {
  it('returns an Error instance carrying the message verbatim', () => {
    const err = createSessionError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('boom');
  });
});

describe('hasCompleteCredentials', () => {
  it('returns true only when both token and workspaceId are present', () => {
    expect(hasCompleteCredentials({ authToken: 't', workspaceId: 'w' })).toBe(true);
  });

  it('returns false when either side is missing or falsy', () => {
    expect(hasCompleteCredentials({ authToken: '', workspaceId: 'w' })).toBe(false);
    expect(hasCompleteCredentials({ authToken: 't', workspaceId: '' })).toBe(false);
    expect(hasCompleteCredentials({ authToken: '', workspaceId: '' })).toBe(false);
    expect(hasCompleteCredentials({ authToken: null, workspaceId: 'w' })).toBe(false);
    expect(hasCompleteCredentials({ authToken: 't', workspaceId: null })).toBe(false);
    expect(hasCompleteCredentials({ authToken: undefined, workspaceId: undefined })).toBe(false);
  });
});

describe('needsWorkspaceRecovery', () => {
  it('returns true when token is present but workspaceId is missing', () => {
    expect(needsWorkspaceRecovery({ authToken: 't', workspaceId: '' })).toBe(true);
    expect(needsWorkspaceRecovery({ authToken: 't', workspaceId: null })).toBe(true);
    expect(needsWorkspaceRecovery({ authToken: 't', workspaceId: undefined })).toBe(true);
  });

  it('returns false when both credentials are present', () => {
    expect(needsWorkspaceRecovery({ authToken: 't', workspaceId: 'w' })).toBe(false);
  });

  it('returns false when token is missing (anonymous-fallback territory)', () => {
    expect(needsWorkspaceRecovery({ authToken: '', workspaceId: 'w' })).toBe(false);
    expect(needsWorkspaceRecovery({ authToken: '', workspaceId: '' })).toBe(false);
    expect(needsWorkspaceRecovery({ authToken: null, workspaceId: 'w' })).toBe(false);
  });
});

describe('selectQrCodeFromResponse', () => {
  it('prefers qrCode over qrCodeImage', () => {
    expect(selectQrCodeFromResponse({ qrCode: 'A', qrCodeImage: 'B' })).toBe('A');
  });

  it('falls back to qrCodeImage when qrCode is missing', () => {
    expect(selectQrCodeFromResponse({ qrCodeImage: 'B' })).toBe('B');
    expect(selectQrCodeFromResponse({ qrCode: '', qrCodeImage: 'B' })).toBe('B');
    expect(selectQrCodeFromResponse({ qrCode: null, qrCodeImage: 'B' })).toBe('B');
  });

  it('returns null when neither field has content', () => {
    expect(selectQrCodeFromResponse({})).toBeNull();
    expect(selectQrCodeFromResponse({ qrCode: '', qrCodeImage: '' })).toBeNull();
    expect(selectQrCodeFromResponse({ qrCode: null, qrCodeImage: null })).toBeNull();
  });
});

describe('classifyConnectResponse', () => {
  it('classifies a truthy error field as error and uses its message when provided', () => {
    expect(classifyConnectResponse({ error: 'boom', message: 'kaboom' })).toEqual({
      kind: 'error',
      message: 'kaboom',
    });
  });

  it('classifies status === "error" as error and falls back to default copy', () => {
    expect(classifyConnectResponse({ status: 'error' })).toEqual({
      kind: 'error',
      message: SESSION_COPY.connectFailed,
    });
  });

  it('classifies STATUS_RESPONSES.alreadyConnected', () => {
    expect(classifyConnectResponse({ status: STATUS_RESPONSES.alreadyConnected })).toEqual({
      kind: 'already_connected',
    });
  });

  it('classifies STATUS_RESPONSES.qrReady and lifts qrCode + message', () => {
    const outcome = classifyConnectResponse({
      status: STATUS_RESPONSES.qrReady,
      qrCode: 'data:image/png;base64,AAA',
      message: 'scan it',
    });
    expect(outcome).toEqual({
      kind: 'qr_ready',
      qrCode: 'data:image/png;base64,AAA',
      message: 'scan it',
    });
  });

  it('falls back to qrCodeImage and default copy when qr_ready omits qrCode/message', () => {
    expect(
      classifyConnectResponse({
        status: STATUS_RESPONSES.qrReady,
        qrCodeImage: 'data:image/png;base64,BBB',
      }),
    ).toEqual({
      kind: 'qr_ready',
      qrCode: 'data:image/png;base64,BBB',
      message: SESSION_COPY.scanQr,
    });
  });

  it('returns pending for unknown/missing statuses (driving the QR poll fallback)', () => {
    expect(classifyConnectResponse({})).toEqual({ kind: 'pending' });
    expect(classifyConnectResponse({ status: 'starting' })).toEqual({ kind: 'pending' });
    expect(classifyConnectResponse({ status: null })).toEqual({ kind: 'pending' });
  });

  it('error wins over a successful status code', () => {
    expect(
      classifyConnectResponse({
        status: STATUS_RESPONSES.alreadyConnected,
        error: 'something',
      }),
    ).toEqual({
      kind: 'error',
      message: SESSION_COPY.connectFailed,
    });
  });
});

describe('buildDisconnectedStatus', () => {
  it('returns a fresh disconnected snapshot every call', () => {
    const a = buildDisconnectedStatus();
    const b = buildDisconnectedStatus();
    expect(a).toEqual({ connected: false, status: STATUS_RESPONSES.disconnected });
    expect(b).toEqual({ connected: false, status: STATUS_RESPONSES.disconnected });
    expect(a).not.toBe(b);
  });
});

describe('isSessionPollEnabled', () => {
  it('returns true only when enabled and both credentials are present', () => {
    expect(isSessionPollEnabled({ enabled: true, workspaceId: 'w', authToken: 't' })).toBe(true);
  });

  it('returns false when any leg is missing', () => {
    expect(isSessionPollEnabled({ enabled: false, workspaceId: 'w', authToken: 't' })).toBe(false);
    expect(isSessionPollEnabled({ enabled: true, workspaceId: '', authToken: 't' })).toBe(false);
    expect(isSessionPollEnabled({ enabled: true, workspaceId: 'w', authToken: '' })).toBe(false);
    expect(isSessionPollEnabled({ enabled: false, workspaceId: '', authToken: '' })).toBe(false);
  });
});

describe('isQrPollEnabled', () => {
  const base = { enabled: true, workspaceId: 'w', authToken: 't' };

  it('returns true while mid-connect and not yet connected', () => {
    expect(isQrPollEnabled({ ...base, connecting: true, connected: false })).toBe(true);
  });

  it('returns false once the session reports connected', () => {
    expect(isQrPollEnabled({ ...base, connecting: true, connected: true })).toBe(false);
  });

  it('returns false when no connect attempt is in flight', () => {
    expect(isQrPollEnabled({ ...base, connecting: false, connected: false })).toBe(false);
  });

  it('returns false when the base poll gate is closed', () => {
    expect(
      isQrPollEnabled({
        enabled: false,
        workspaceId: 'w',
        authToken: 't',
        connecting: true,
        connected: false,
      }),
    ).toBe(false);
    expect(
      isQrPollEnabled({
        enabled: true,
        workspaceId: '',
        authToken: 't',
        connecting: true,
        connected: false,
      }),
    ).toBe(false);
  });
});

describe('shouldSkipCiaRuntimeSync', () => {
  const base = {
    enabled: true,
    workspaceId: 'w',
    authToken: 't',
    connected: true,
    guardedWorkspaceId: null as string | null,
  };

  it('runs sync (returns false) when fully wired and unclaimed', () => {
    expect(shouldSkipCiaRuntimeSync(base)).toBe(false);
  });

  it('skips when the bootstrap guard already owns this workspaceId', () => {
    expect(shouldSkipCiaRuntimeSync({ ...base, guardedWorkspaceId: 'w' })).toBe(true);
  });

  it('skips when the session is not connected', () => {
    expect(shouldSkipCiaRuntimeSync({ ...base, connected: false })).toBe(true);
  });

  it('skips when the base poll gate is closed', () => {
    expect(shouldSkipCiaRuntimeSync({ ...base, enabled: false })).toBe(true);
    expect(shouldSkipCiaRuntimeSync({ ...base, workspaceId: '' })).toBe(true);
    expect(shouldSkipCiaRuntimeSync({ ...base, authToken: '' })).toBe(true);
  });

  it('runs sync when guardedWorkspaceId tracks a different workspace', () => {
    expect(shouldSkipCiaRuntimeSync({ ...base, guardedWorkspaceId: 'other-ws' })).toBe(false);
  });
});

describe('pickRecoveredWorkspaceId', () => {
  it('returns the resolved workspace id when present', () => {
    const payload = { user: 'u' };
    expect(pickRecoveredWorkspaceId(payload, () => ({ id: 'ws-1' }))).toBe('ws-1');
  });

  it('returns the empty string when the resolver yields null/undefined', () => {
    expect(pickRecoveredWorkspaceId({}, () => null)).toBe('');
    expect(pickRecoveredWorkspaceId({}, () => undefined)).toBe('');
  });

  it('returns the empty string when the resolved workspace lacks an id', () => {
    expect(pickRecoveredWorkspaceId({}, () => ({ id: null }))).toBe('');
    expect(pickRecoveredWorkspaceId({}, () => ({ id: '' }))).toBe('');
    expect(pickRecoveredWorkspaceId({}, () => ({}))).toBe('');
  });

  it('passes the payload through to the resolver verbatim', () => {
    const payload = { marker: Symbol('m') };
    const resolver = vi.fn(() => ({ id: 'ws-2' }));
    pickRecoveredWorkspaceId(payload, resolver);
    expect(resolver).toHaveBeenCalledWith(payload);
  });
});

describe('hasConnectionStateChanged', () => {
  it('returns true when the boolean flips', () => {
    expect(hasConnectionStateChanged(false, true)).toBe(true);
    expect(hasConnectionStateChanged(true, false)).toBe(true);
  });

  it('returns false when the boolean is unchanged', () => {
    expect(hasConnectionStateChanged(false, false)).toBe(false);
    expect(hasConnectionStateChanged(true, true)).toBe(false);
  });
});

describe('exported constants', () => {
  it('STATUS_RESPONSES is the canonical wire-value set', () => {
    expect(STATUS_RESPONSES.alreadyConnected).toBe('already_connected');
    expect(STATUS_RESPONSES.qrReady).toBe('qr_ready');
    expect(STATUS_RESPONSES.disconnected).toBe('disconnected');
  });

  it('POLL_INTERVALS / TIMEOUTS are positive ms values', () => {
    expect(POLL_INTERVALS.statusMs).toBeGreaterThan(0);
    expect(POLL_INTERVALS.qrMs).toBeGreaterThan(0);
    expect(TIMEOUTS.connectFeedbackMs).toBeGreaterThan(0);
    expect(TIMEOUTS.qrGenerationMs).toBeGreaterThan(0);
  });

  it('CIA_ACTIVE_MODES and CIA_MANUAL_PAUSE_MODES do not overlap', () => {
    for (const m of CIA_ACTIVE_MODES) {
      expect(CIA_MANUAL_PAUSE_MODES.has(m)).toBe(false);
    }
  });
});
