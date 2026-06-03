import { describe, expect, it, vi } from 'vitest';

import {
  AUTONOMY_ACTIONS,
  CIA_ACTIVE_MODES,
  CIA_MANUAL_PAUSE_MODES,
  PENDING_META_STATUSES,
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
  isPendingMetaStatus,
  isSessionPollEnabled,
  isTrustedMetaAuthorizationUrl,
  needsWorkspaceRecovery,
  normalizeStatusKey,
  pickRecoveredWorkspaceId,
  resolveStatusMessage,
  shouldSkipCiaRuntimeSync,
} from './useWhatsAppSession.helpers';

describe('normalizeStatusKey', () => {
  it('trims and lowercases the status string', () => {
    expect(normalizeStatusKey('  CONNECTION_INCOMPLETE ')).toBe('connection_incomplete');
    expect(normalizeStatusKey('CONNECTING')).toBe('connecting');
  });

  it('coerces null and undefined to an empty string', () => {
    expect(normalizeStatusKey(null)).toBe('');
    expect(normalizeStatusKey(undefined)).toBe('');
    expect(normalizeStatusKey('')).toBe('');
  });
});

describe('isPendingMetaStatus', () => {
  it('returns true for every pending Meta status', () => {
    for (const status of PENDING_META_STATUSES) {
      expect(isPendingMetaStatus(status)).toBe(true);
      expect(isPendingMetaStatus(status.toUpperCase())).toBe(true);
    }
  });

  it('does not treat legacy non-Meta statuses as valid pending states', () => {
    expect(isPendingMetaStatus('legacy_pending')).toBe(false);
    expect(isPendingMetaStatus('external_scan_required')).toBe(false);
  });

  it('returns false for connected/disconnected/unknown statuses', () => {
    expect(isPendingMetaStatus('connected')).toBe(false);
    expect(isPendingMetaStatus('disconnected')).toBe(false);
    expect(isPendingMetaStatus('totally_unknown')).toBe(false);
    expect(isPendingMetaStatus(null)).toBe(false);
    expect(isPendingMetaStatus(undefined)).toBe(false);
  });
});

describe('resolveStatusMessage', () => {
  it('returns the active copy when connected, regardless of status string', () => {
    expect(resolveStatusMessage({ connected: true })).toBe(SESSION_COPY.active);
    expect(resolveStatusMessage({ connected: true, status: 'connection_incomplete' })).toBe(
      SESSION_COPY.active,
    );
  });

  it('returns Meta authorization copy when not connected but Meta is pending', () => {
    expect(resolveStatusMessage({ connected: false, status: 'connection_incomplete' })).toBe(
      SESSION_COPY.authorizingMeta,
    );
    expect(resolveStatusMessage({ connected: false, status: 'CONNECT_REQUIRED' })).toBe(
      SESSION_COPY.authorizingMeta,
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
    expect(isCiaAutonomyActive({ mode: 'live' })).toBe(true);
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

  it('returns false when token is missing', () => {
    expect(needsWorkspaceRecovery({ authToken: '', workspaceId: 'w' })).toBe(false);
    expect(needsWorkspaceRecovery({ authToken: '', workspaceId: '' })).toBe(false);
    expect(needsWorkspaceRecovery({ authToken: null, workspaceId: 'w' })).toBe(false);
  });
});

describe('isTrustedMetaAuthorizationUrl', () => {
  it('accepts official Meta/Facebook HTTPS authorization hosts', () => {
    expect(isTrustedMetaAuthorizationUrl('https://www.facebook.com/v20.0/dialog/oauth')).toBe(true);
    expect(isTrustedMetaAuthorizationUrl('https://business.facebook.com/latest/whatsapp/signup')).toBe(true);
    expect(isTrustedMetaAuthorizationUrl('https://www.meta.com/business')).toBe(true);
  });

  it('rejects non-Meta, non-HTTPS, and malformed URLs', () => {
    expect(isTrustedMetaAuthorizationUrl('http://www.facebook.com/dialog/oauth')).toBe(false);
    expect(isTrustedMetaAuthorizationUrl('https://evil.example.com/oauth')).toBe(false);
    expect(isTrustedMetaAuthorizationUrl('not-a-url')).toBe(false);
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

  it('classifies official Meta authorization URLs as connect_required', () => {
    const authUrl = 'https://www.facebook.com/v20.0/dialog/oauth?client_id=app';
    expect(classifyConnectResponse({ status: STATUS_RESPONSES.connectRequired, authUrl })).toEqual({
      kind: 'connect_required',
      authUrl,
      message: SESSION_COPY.redirectingMeta,
    });
  });

  it('rejects connect_required responses without a trusted Meta URL', () => {
    expect(classifyConnectResponse({ status: STATUS_RESPONSES.connectRequired })).toEqual({
      kind: 'error',
      message: SESSION_COPY.invalidMetaRedirect,
    });
    expect(
      classifyConnectResponse({
        status: STATUS_RESPONSES.connectRequired,
        authUrl: 'https://evil.example.com/oauth',
      }),
    ).toEqual({
      kind: 'error',
      message: SESSION_COPY.invalidMetaRedirect,
    });
  });

  it('returns pending for unknown/missing statuses without starting any legacy fallback', () => {
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
  it('returns a fresh Meta Cloud disconnected snapshot every call', () => {
    const a = buildDisconnectedStatus();
    const b = buildDisconnectedStatus();
    expect(a).toEqual({ connected: false, status: STATUS_RESPONSES.disconnected, provider: 'meta-cloud' });
    expect(b).toEqual({ connected: false, status: STATUS_RESPONSES.disconnected, provider: 'meta-cloud' });
    expect(a).not.toBe(b);
  });
});

describe('isSessionPollEnabled', () => {
  it('returns true only when enabled and both credentials are present', () => {
    expect(isSessionPollEnabled({ enabled: true, workspaceId: 'w', authToken: 't' })).toBe(true);
  });

  it('returns false when each leg is missing', () => {
    expect(isSessionPollEnabled({ enabled: false, workspaceId: 'w', authToken: 't' })).toBe(false);
    expect(isSessionPollEnabled({ enabled: true, workspaceId: '', authToken: 't' })).toBe(false);
    expect(isSessionPollEnabled({ enabled: true, workspaceId: 'w', authToken: '' })).toBe(false);
    expect(isSessionPollEnabled({ enabled: false, workspaceId: '', authToken: '' })).toBe(false);
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
  it('STATUS_RESPONSES is the Meta-only wire-value set', () => {
    expect(Object.keys(STATUS_RESPONSES)).toEqual([
      'alreadyConnected',
      'connectRequired',
      'disconnected',
    ]);
    expect(STATUS_RESPONSES.alreadyConnected).toBe('already_connected');
    expect(STATUS_RESPONSES.connectRequired).toBe('connect_required');
    expect(STATUS_RESPONSES.disconnected).toBe('disconnected');
  });

  it('POLL_INTERVALS / TIMEOUTS expose only the Meta connection timers', () => {
    expect(Object.keys(POLL_INTERVALS)).toEqual(['statusMs']);
    expect(POLL_INTERVALS.statusMs).toBeGreaterThan(0);
    expect(Object.keys(TIMEOUTS)).toEqual(['connectFeedbackMs']);
    expect(TIMEOUTS.connectFeedbackMs).toBeGreaterThan(0);
  });

  it('CIA_ACTIVE_MODES and CIA_MANUAL_PAUSE_MODES do not overlap', () => {
    for (const mode of CIA_ACTIVE_MODES) {
      expect(CIA_MANUAL_PAUSE_MODES.has(mode)).toBe(false);
    }
  });
});
