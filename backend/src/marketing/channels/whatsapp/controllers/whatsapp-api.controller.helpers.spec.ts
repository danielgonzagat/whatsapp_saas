import type { ProviderSessionSnapshot } from '../provider-settings.types';
import type { SessionStatus } from '../providers/provider-registry.types';
import type {
  MetaWhatsAppRuntimeConfigDiagnostics,
  MetaWhatsAppSessionConfigDiagnostics,
} from '../providers/whatsapp-api.provider.types';

import {
  buildProviderStatusCatchup,
  deriveProviderStatusDegradedReasons,
  readBacklogMode,
  readSessionSnapshot,
  readText,
} from './whatsapp-api.controller.helpers';

const runtimeHealthy = (): MetaWhatsAppRuntimeConfigDiagnostics => ({
  provider: 'meta-cloud',
  webhookConfigured: true,
  inboundEventsConfigured: true,
  events: ['messages'],
  secretConfigured: true,
  storeEnabled: true,
  storeFullSync: true,
  appIdConfigured: true,
  appSecretConfigured: true,
  accessTokenConfigured: true,
  phoneNumberIdConfigured: true,
});

const sessionHealthy = (): MetaWhatsAppSessionConfigDiagnostics => ({
  sessionName: 'workspace-1',
  available: true,
  rawStatus: 'WORKING',
  state: 'CONNECTED',
  webhookConfigured: true,
  inboundEventsConfigured: true,
  events: ['messages'],
  secretConfigured: true,
  storeEnabled: true,
  storeFullSync: true,
  configPresent: true,
});

const connectedStatus = (): SessionStatus => ({ connected: true, status: 'WORKING' });

describe('whatsapp-api.controller.helpers', () => {
  describe('readText', () => {
    it('returns the string when value is a string', () => {
      expect(readText('hello')).toBe('hello');
    });

    it('returns the fallback when value is not a string', () => {
      expect(readText(undefined)).toBe('');
      expect(readText(null, 'fallback')).toBe('fallback');
      expect(readText(42, 'fallback')).toBe('fallback');
      expect(readText({ a: 1 })).toBe('');
    });
  });

  describe('readBacklogMode', () => {
    it.each(['reply_only_new', 'prioritize_hot', 'reply_all_recent_first'] as const)(
      'passes through %s',
      (mode) => {
        expect(readBacklogMode(mode)).toBe(mode);
      },
    );

    it('falls back to reply_all_recent_first for unknown values', () => {
      expect(readBacklogMode('garbage')).toBe('reply_all_recent_first');
      expect(readBacklogMode(undefined)).toBe('reply_all_recent_first');
      expect(readBacklogMode(null)).toBe('reply_all_recent_first');
      expect(readBacklogMode(123)).toBe('reply_all_recent_first');
    });
  });

  describe('readSessionSnapshot', () => {
    it('prefers whatsappWebSession over whatsappApiSession', () => {
      const webSession = { sessionName: 'web' };
      const apiSession = { sessionName: 'api' };
      expect(
        readSessionSnapshot({ whatsappWebSession: webSession, whatsappApiSession: apiSession }),
      ).toEqual(webSession);
    });

    it('falls back to whatsappApiSession when web is missing', () => {
      const apiSession = { sessionName: 'api' };
      expect(readSessionSnapshot({ whatsappApiSession: apiSession })).toEqual(apiSession);
    });

    it('returns null when no session metadata is present', () => {
      expect(readSessionSnapshot({})).toBeNull();
      expect(readSessionSnapshot(null)).toBeNull();
      expect(readSessionSnapshot(undefined)).toBeNull();
    });
  });

  describe('deriveProviderStatusDegradedReasons', () => {
    it('returns an empty array when everything is healthy', () => {
      expect(
        deriveProviderStatusDegradedReasons({
          runtimeDiagnostics: runtimeHealthy(),
          sessionDiagnostics: sessionHealthy(),
          sessionStatus: connectedStatus(),
          sessionMeta: null,
          backlog: null,
        }),
      ).toEqual([]);
    });

    it('flags meta_webhook_missing when runtime has no webhook', () => {
      const runtime = runtimeHealthy();
      runtime.webhookConfigured = false;
      const reasons = deriveProviderStatusDegradedReasons({
        runtimeDiagnostics: runtime,
        sessionDiagnostics: sessionHealthy(),
        sessionStatus: connectedStatus(),
        sessionMeta: null,
        backlog: null,
      });
      expect(reasons).toContain('meta_webhook_missing');
      expect(reasons).not.toContain('meta_webhook_events_missing_inbound');
    });

    it('flags meta_webhook_events_missing_inbound only when webhook is present but events are not', () => {
      const runtime = runtimeHealthy();
      runtime.inboundEventsConfigured = false;
      const reasons = deriveProviderStatusDegradedReasons({
        runtimeDiagnostics: runtime,
        sessionDiagnostics: sessionHealthy(),
        sessionStatus: connectedStatus(),
        sessionMeta: null,
        backlog: null,
      });
      expect(reasons).toContain('meta_webhook_events_missing_inbound');
    });

    it('flags both store flags when runtime store is disabled', () => {
      const runtime = runtimeHealthy();
      runtime.storeEnabled = false;
      runtime.storeFullSync = false;
      const reasons = deriveProviderStatusDegradedReasons({
        runtimeDiagnostics: runtime,
        sessionDiagnostics: sessionHealthy(),
        sessionStatus: connectedStatus(),
        sessionMeta: null,
        backlog: null,
      });
      expect(reasons).toEqual(
        expect.arrayContaining([
          'meta_store_disabled_in_runtime',
          'meta_store_full_sync_disabled_in_runtime',
        ]),
      );
    });

    it('flags session config issues only when sessionDiagnostics.available is true', () => {
      const sessionDiag = sessionHealthy();
      sessionDiag.configPresent = false;
      sessionDiag.webhookConfigured = false;
      sessionDiag.storeEnabled = false;
      sessionDiag.storeFullSync = false;
      const reasons = deriveProviderStatusDegradedReasons({
        runtimeDiagnostics: runtimeHealthy(),
        sessionDiagnostics: sessionDiag,
        sessionStatus: connectedStatus(),
        sessionMeta: null,
        backlog: null,
      });
      expect(reasons).toEqual(
        expect.arrayContaining([
          'meta_session_config_missing',
          'meta_session_webhook_missing',
          'meta_session_store_disabled',
          'meta_session_store_full_sync_disabled',
        ]),
      );
    });

    it('flags meta_session_config_unavailable when diagnostics offline but session is connected', () => {
      const sessionDiag: MetaWhatsAppSessionConfigDiagnostics = {
        ...sessionHealthy(),
        available: false,
      };
      const reasons = deriveProviderStatusDegradedReasons({
        runtimeDiagnostics: runtimeHealthy(),
        sessionDiagnostics: sessionDiag,
        sessionStatus: connectedStatus(),
        sessionMeta: null,
        backlog: null,
      });
      expect(reasons).toContain('meta_session_config_unavailable');
    });

    it('omits meta_session_config_unavailable when session is disconnected', () => {
      const sessionDiag: MetaWhatsAppSessionConfigDiagnostics = {
        ...sessionHealthy(),
        available: false,
      };
      const reasons = deriveProviderStatusDegradedReasons({
        runtimeDiagnostics: runtimeHealthy(),
        sessionDiagnostics: sessionDiag,
        sessionStatus: { connected: false, status: 'DISCONNECTED' },
        sessionMeta: null,
        backlog: null,
      });
      expect(reasons).not.toContain('meta_session_config_unavailable');
    });

    it('surfaces the recoveryBlockedReason carried in session meta', () => {
      const sessionMeta: ProviderSessionSnapshot = {
        recoveryBlockedReason: 'manual_pause',
      };
      const reasons = deriveProviderStatusDegradedReasons({
        runtimeDiagnostics: runtimeHealthy(),
        sessionDiagnostics: sessionHealthy(),
        sessionStatus: connectedStatus(),
        sessionMeta,
        backlog: null,
      });
      expect(reasons).toContain('manual_pause');
    });

    it('ignores empty / whitespace recoveryBlockedReason values', () => {
      const sessionMeta: ProviderSessionSnapshot = { recoveryBlockedReason: '   ' };
      const reasons = deriveProviderStatusDegradedReasons({
        runtimeDiagnostics: runtimeHealthy(),
        sessionDiagnostics: sessionHealthy(),
        sessionStatus: connectedStatus(),
        sessionMeta,
        backlog: null,
      });
      expect(reasons).toEqual([]);
    });

    it('flags backlog_empty_after_catchup_error only when all heuristic conditions hold', () => {
      const sessionMeta: ProviderSessionSnapshot = { lastCatchupError: 'rate_limited' };
      const reasons = deriveProviderStatusDegradedReasons({
        runtimeDiagnostics: runtimeHealthy(),
        sessionDiagnostics: sessionHealthy(),
        sessionStatus: connectedStatus(),
        sessionMeta,
        backlog: { pendingConversations: 0 },
      });
      expect(reasons).toContain('backlog_empty_after_catchup_error');
    });

    it('does not flag backlog_empty_after_catchup_error when pendingConversations > 0', () => {
      const sessionMeta: ProviderSessionSnapshot = { lastCatchupError: 'rate_limited' };
      const reasons = deriveProviderStatusDegradedReasons({
        runtimeDiagnostics: runtimeHealthy(),
        sessionDiagnostics: sessionHealthy(),
        sessionStatus: connectedStatus(),
        sessionMeta,
        backlog: { pendingConversations: 5 },
      });
      expect(reasons).not.toContain('backlog_empty_after_catchup_error');
    });

    it('does not flag backlog_empty_after_catchup_error when not connected', () => {
      const sessionMeta: ProviderSessionSnapshot = { lastCatchupError: 'rate_limited' };
      const reasons = deriveProviderStatusDegradedReasons({
        runtimeDiagnostics: runtimeHealthy(),
        sessionDiagnostics: sessionHealthy(),
        sessionStatus: { connected: false, status: 'DISCONNECTED' },
        sessionMeta,
        backlog: { pendingConversations: 0 },
      });
      expect(reasons).not.toContain('backlog_empty_after_catchup_error');
    });

    it('preserves the legacy ordering: runtime, session, recoveryBlocked, backlog', () => {
      const runtime = runtimeHealthy();
      runtime.webhookConfigured = false;
      runtime.storeEnabled = false;
      const sessionDiag = sessionHealthy();
      sessionDiag.configPresent = false;
      const sessionMeta: ProviderSessionSnapshot = {
        recoveryBlockedReason: 'awaiting_owner',
        lastCatchupError: 'rate_limited',
      };
      const reasons = deriveProviderStatusDegradedReasons({
        runtimeDiagnostics: runtime,
        sessionDiagnostics: sessionDiag,
        sessionStatus: connectedStatus(),
        sessionMeta,
        backlog: { pendingConversations: 0 },
      });
      expect(reasons).toEqual([
        'meta_webhook_missing',
        'meta_store_disabled_in_runtime',
        'meta_session_config_missing',
        'awaiting_owner',
        'backlog_empty_after_catchup_error',
      ]);
    });
  });

  describe('buildProviderStatusCatchup', () => {
    it('returns a fully-null block when session meta is null', () => {
      expect(buildProviderStatusCatchup(null)).toEqual({
        lastCatchupAt: null,
        lastCatchupReason: null,
        lastCatchupImportedMessages: null,
        lastCatchupTouchedChats: null,
        lastCatchupProcessedChats: null,
        lastCatchupOverflow: null,
        lastCatchupError: null,
        lastCatchupFailedAt: null,
        recoveryBlockedReason: null,
        recoveryBlockedAt: null,
        backfillCursor: null,
      });
    });

    it('projects meta fields while preserving 0 numeric values via ?? null', () => {
      const sessionMeta: ProviderSessionSnapshot = {
        lastCatchupAt: '2026-01-01T00:00:00Z',
        lastCatchupImportedMessages: 0,
        lastCatchupTouchedChats: 0,
        lastCatchupProcessedChats: 12,
        lastCatchupOverflow: false,
      };
      const out = buildProviderStatusCatchup(sessionMeta);
      expect(out.lastCatchupAt).toBe('2026-01-01T00:00:00Z');
      expect(out.lastCatchupImportedMessages).toBe(0);
      expect(out.lastCatchupTouchedChats).toBe(0);
      expect(out.lastCatchupProcessedChats).toBe(12);
      expect(out.lastCatchupOverflow).toBe(false);
    });
  });
});
