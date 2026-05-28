import { describe, expect, it } from 'vitest';

import {
  AUTONOMY_ACTIONS,
  CIA_ACTIVE_MODES,
  CIA_MANUAL_PAUSE_MODES,
  PENDING_QR_STATUSES,
  POLL_INTERVALS,
  SESSION_COPY,
  STATUS_RESPONSES,
  TIMEOUTS,
  createSessionError,
  isCiaAutonomyActive,
  isPendingQrStatus,
  normalizeStatusKey,
  resolveStatusMessage,
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
