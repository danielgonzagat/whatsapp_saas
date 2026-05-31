import { WhatsappService } from './whatsapp.service';

/**
 * Capability-resolver wiring proof for WhatsappService.
 *
 * The Capability Registry V2 declares some capabilities under the canonical
 * name `WhatsAppService` (CamelCase). The domain-service-resolver maps that
 * canonical name to the real `WhatsappService` class (mixed-case). For the
 * resolver to actually invoke a method, the canonical method name on
 * `WhatsAppService` must exist on `WhatsappService` too. This spec proves
 * the two alias methods `status` and `syncHistory` exist and delegate to
 * the pre-existing canonical implementations (`getConnectionStatus` and
 * `triggerSync`).
 */
type StatusFn = (ws: string) => Promise<unknown>;
type SyncHistoryFn = (ws: string, args?: { reason?: string }) => Promise<unknown>;

const callStatus = (
  instance: { getConnectionStatus: (ws: string) => Promise<unknown> },
  ws: string,
): Promise<unknown> => (WhatsappService.prototype.status as StatusFn).call(instance, ws);

const callSyncHistory = (
  instance: { triggerSync: (ws: string, reason: string) => Promise<unknown> },
  ws: string,
  args?: { reason?: string },
): Promise<unknown> =>
  (WhatsappService.prototype.syncHistory as SyncHistoryFn).call(instance, ws, args);

describe('WhatsappService canonical-name aliases (capability resolver wiring)', () => {
  describe('status()', () => {
    it('delegates to getConnectionStatus with the same workspace', async () => {
      const delegate = jest.fn().mockResolvedValue({ ok: true, connected: true });
      const result = await callStatus({ getConnectionStatus: delegate }, 'ws-status-1');

      const calls = delegate.mock.calls as Array<[string]>;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe('ws-status-1');
      expect(result).toEqual({ ok: true, connected: true });
    });

    it('forwards rejections from the underlying session service', async () => {
      const delegate = jest.fn().mockRejectedValue(new Error('session lookup failed'));
      await expect(callStatus({ getConnectionStatus: delegate }, 'ws-status-2')).rejects.toThrow(
        'session lookup failed',
      );
    });
  });

  describe('syncHistory()', () => {
    it('delegates to triggerSync with the default reason when args is empty', async () => {
      const delegate = jest.fn().mockResolvedValue({ triggered: true });
      await callSyncHistory({ triggerSync: delegate }, 'ws-sync-1');

      const calls = delegate.mock.calls as Array<[string, string]>;
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual(['ws-sync-1', 'manual_sync']);
    });

    it('uses args.reason when provided as a string', async () => {
      const delegate = jest.fn().mockResolvedValue({ triggered: true });
      await callSyncHistory({ triggerSync: delegate }, 'ws-sync-2', { reason: 'webhook_replay' });

      const calls = delegate.mock.calls as Array<[string, string]>;
      expect(calls[0]).toEqual(['ws-sync-2', 'webhook_replay']);
    });

    it('falls back to default when args.reason is undefined', async () => {
      const delegate = jest.fn().mockResolvedValue({ triggered: true });
      await callSyncHistory({ triggerSync: delegate }, 'ws-sync-3', { reason: undefined });

      const calls = delegate.mock.calls as Array<[string, string]>;
      expect(calls[0]).toEqual(['ws-sync-3', 'manual_sync']);
    });

    it('falls back to default when args is undefined', async () => {
      const delegate = jest.fn().mockResolvedValue({ triggered: true });
      await callSyncHistory({ triggerSync: delegate }, 'ws-sync-4', undefined);

      const calls = delegate.mock.calls as Array<[string, string]>;
      expect(calls[0]).toEqual(['ws-sync-4', 'manual_sync']);
    });

    it('forwards rejections from the underlying sync trigger', async () => {
      const delegate = jest.fn().mockRejectedValue(new Error('sync queue full'));
      await expect(
        callSyncHistory({ triggerSync: delegate }, 'ws-sync-5', { reason: 'manual' }),
      ).rejects.toThrow('sync queue full');
    });
  });
});
