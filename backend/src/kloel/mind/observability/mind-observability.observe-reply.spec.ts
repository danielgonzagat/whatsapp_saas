import { MindObservabilityService } from './mind-observability.service';

describe('MindObservabilityService — observeReply / getSnapshot', () => {
  let service: MindObservabilityService;

  beforeEach(() => {
    service = new MindObservabilityService(
      undefined as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
  });

  describe('observeReply', () => {
    it('increments totalReplies and successReplies for a workspace', () => {
      service.observeReply('ws-1', { surface: 'guest', durationMs: 120, success: true });
      service.observeReply('ws-1', { surface: 'guest', durationMs: 85, success: true });

      const snapshot = service.getSnapshot('ws-1');
      expect(snapshot.totalReplies).toBe(2);
      expect(snapshot.successReplies).toBe(2);
      expect(snapshot.failureReplies).toBe(0);
    });

    it('increments failureReplies when success is false', () => {
      service.observeReply('ws-1', { surface: 'whatsapp', durationMs: 250, success: false });
      service.observeReply('ws-1', { surface: 'whatsapp', durationMs: 100, success: true });

      const snapshot = service.getSnapshot('ws-1');
      expect(snapshot.totalReplies).toBe(2);
      expect(snapshot.successReplies).toBe(1);
      expect(snapshot.failureReplies).toBe(1);
    });

    it('accumulates duration and computes avgDurationMs', () => {
      service.observeReply('ws-1', { surface: 'admin', durationMs: 200, success: true });
      service.observeReply('ws-1', { surface: 'admin', durationMs: 100, success: true });

      const snapshot = service.getSnapshot('ws-1');
      expect(snapshot.avgDurationMs).toBe(150);
    });

    it('accumulates surprise values and computes avgSurprise', () => {
      service.observeReply('ws-1', {
        surface: 'guest',
        durationMs: 50,
        success: true,
        surpriseValue: 0.3,
      });
      service.observeReply('ws-1', {
        surface: 'guest',
        durationMs: 50,
        success: true,
        surpriseValue: 0.7,
      });

      const snapshot = service.getSnapshot('ws-1');
      expect(snapshot.avgSurprise).toBeCloseTo(0.5);
    });

    it('tracks per-surface metrics within a workspace', () => {
      service.observeReply('ws-1', { surface: 'guest', durationMs: 50, success: true });
      service.observeReply('ws-1', { surface: 'admin', durationMs: 80, success: true });
      service.observeReply('ws-1', { surface: 'guest', durationMs: 60, success: false });

      const snapshot = service.getSnapshot('ws-1');
      expect(snapshot.bySurface).toEqual({
        guest: { count: 2, successCount: 1 },
        admin: { count: 1, successCount: 1 },
      });
    });

    it('sets lastReplyAt to a recent ISO string', () => {
      const before = new Date().toISOString();
      service.observeReply('ws-1', { surface: 'guest', durationMs: 42, success: true });
      const after = new Date().toISOString();

      const snapshot = service.getSnapshot('ws-1');
      expect(snapshot.lastReplyAt).toBeTruthy();
      expect(snapshot.lastReplyAt >= before).toBe(true);
      expect(snapshot.lastReplyAt <= after).toBe(true);
    });
  });

  describe('workspace isolation', () => {
    it('keeps metrics separate per workspaceId', () => {
      service.observeReply('ws-a', { surface: 'guest', durationMs: 10, success: true });
      service.observeReply('ws-a', { surface: 'guest', durationMs: 20, success: true });
      service.observeReply('ws-b', { surface: 'admin', durationMs: 30, success: false });

      const snapA = service.getSnapshot('ws-a');
      expect(snapA.totalReplies).toBe(2);
      expect(snapA.successReplies).toBe(2);
      expect(snapA.bySurface).toEqual({ guest: { count: 2, successCount: 2 } });

      const snapB = service.getSnapshot('ws-b');
      expect(snapB.totalReplies).toBe(1);
      expect(snapB.successReplies).toBe(0);
      expect(snapB.failureReplies).toBe(1);
      expect(snapB.bySurface).toEqual({ admin: { count: 1, successCount: 0 } });
    });

    it('getSnapshot on unknown workspace returns zeroes', () => {
      const snapshot = service.getSnapshot('unknown-ws');
      expect(snapshot.workspaceId).toBe('unknown-ws');
      expect(snapshot.totalReplies).toBe(0);
      expect(snapshot.successReplies).toBe(0);
      expect(snapshot.failureReplies).toBe(0);
      expect(snapshot.avgDurationMs).toBe(0);
      expect(snapshot.avgSurprise).toBeNull();
      expect(snapshot.lastReplyAt).toBeNull();
      expect(snapshot.bySurface).toEqual({});
    });
  });

  describe('getSnapshot aggregates', () => {
    it('avgSurprise is null when no surprise values recorded', () => {
      service.observeReply('ws-1', { surface: 'guest', durationMs: 10, success: true });
      expect(service.getSnapshot('ws-1').avgSurprise).toBeNull();
    });

    it('avgDurationMs is 0 when no replies recorded', () => {
      expect(service.getSnapshot('ws-1').avgDurationMs).toBe(0);
    });

    it('handles mixed success/failure and multiple surfaces correctly', () => {
      service.observeReply('ws-1', {
        surface: 'guest',
        durationMs: 100,
        success: true,
        surpriseValue: 0.2,
      });
      service.observeReply('ws-1', {
        surface: 'guest',
        durationMs: 200,
        success: false,
        surpriseValue: 0.9,
      });
      service.observeReply('ws-1', { surface: 'whatsapp', durationMs: 300, success: true });

      const snapshot = service.getSnapshot('ws-1');
      expect(snapshot.totalReplies).toBe(3);
      expect(snapshot.successReplies).toBe(2);
      expect(snapshot.failureReplies).toBe(1);
      expect(snapshot.avgDurationMs).toBe(200);
      expect(snapshot.avgSurprise).toBeCloseTo(0.55);
      expect(snapshot.bySurface).toEqual({
        guest: { count: 2, successCount: 1 },
        whatsapp: { count: 1, successCount: 1 },
      });
    });
  });
});
