import { ChannelHealthMonitorService } from './channel-health.monitor.service';
import { ChannelHealth, RECENT_WINDOW_SIZE } from './channel-health.types';

function makeEvent(
  workspaceId: string,
  channel: string,
  overrides: { eventName?: string; occurredAt?: string; success?: boolean } = {},
) {
  return {
    workspaceId,
    channel,
    eventName: overrides.eventName ?? 'commerce.whatsapp.message_replied',
    occurredAt: overrides.occurredAt ?? new Date().toISOString(),
    success: overrides.success ?? true,
  };
}

function recordEvents(
  service: ChannelHealthMonitorService,
  workspaceId: string,
  channel: string,
  count: number,
  success: boolean,
  eventName = 'commerce.whatsapp.message_replied',
) {
  for (let i = 0; i < count; i++) {
    const occurredAt = new Date(Date.now() - i * 60000).toISOString();
    service.recordEvent(workspaceId, channel, eventName, occurredAt, success);
  }
}

describe('ChannelHealthMonitorService', () => {
  let service: ChannelHealthMonitorService;

  beforeEach(() => {
    service = new ChannelHealthMonitorService();
  });

  describe('recordEvent', () => {
    it('stores event and increases totalSent', () => {
      service.recordEvent('wks_1', 'whatsapp', 'commerce.whatsapp.message_replied', new Date().toISOString(), true);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.totalSent).toBe(1);
    });

    it('stores multiple events correctly', () => {
      recordEvents(service, 'wks_1', 'whatsapp', 5, true);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.totalSent).toBe(5);
    });
  });

  describe('getChannelHealth — unknown channel', () => {
    it('returns defaults for channel with no events', () => {
      const health = service.getChannelHealth('wks_1', 'unknown');
      expect(health).toEqual<ChannelHealth>({
        totalSent: 0,
        deliveryRate: 1,
        errorRate: 0,
        banRiskScore: 0,
        policyViolationCount: 0,
        recentFailureBurst: false,
        healthStatus: 'healthy',
      });
    });

    it('returns defaults for unknown workspace', () => {
      service.recordEvent('wks_1', 'whatsapp', 'commerce.whatsapp.message_replied', new Date().toISOString(), true);
      const health = service.getChannelHealth('wks_2', 'whatsapp');
      expect(health.totalSent).toBe(0);
    });
  });

  describe('deliveryRate and errorRate', () => {
    it('deliveryRate = 1.0 and errorRate = 0 when all events succeed', () => {
      recordEvents(service, 'wks_1', 'whatsapp', 10, true);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.deliveryRate).toBe(1);
      expect(health.errorRate).toBe(0);
    });

    it('deliveryRate = 0 and errorRate = 1.0 when all events fail', () => {
      recordEvents(service, 'wks_1', 'whatsapp', 10, false);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.deliveryRate).toBe(0);
      expect(health.errorRate).toBe(1);
    });

    it('correct mixed rates with 7 success and 3 failures', () => {
      recordEvents(service, 'wks_1', 'whatsapp', 7, true);
      recordEvents(service, 'wks_1', 'whatsapp', 3, false);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.deliveryRate).toBe(0.7);
      expect(health.errorRate).toBe(0.3);
    });

    it('rounds to 2 decimal places', () => {
      service.recordEvent('wks_1', 'whatsapp', 'commerce.whatsapp.message_replied', new Date().toISOString(), true);
      service.recordEvent('wks_1', 'whatsapp', 'commerce.whatsapp.message_replied', new Date().toISOString(), true);
      service.recordEvent('wks_1', 'whatsapp', 'commerce.whatsapp.message_replied', new Date().toISOString(), false);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.deliveryRate).toBe(0.67);
      expect(health.errorRate).toBe(0.33);
    });
  });

  describe('healthStatus', () => {
    it('returns healthy when deliveryRate >= 0.95', () => {
      recordEvents(service, 'wks_1', 'whatsapp', 19, true);
      recordEvents(service, 'wks_1', 'whatsapp', 1, false);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.healthStatus).toBe('healthy');
    });

    it('returns degraded when deliveryRate < 0.95 and >= 0.85', () => {
      recordEvents(service, 'wks_1', 'whatsapp', 9, true);
      recordEvents(service, 'wks_1', 'whatsapp', 1, false);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.healthStatus).toBe('degraded');
    });

    it('returns at_risk when deliveryRate < 0.85 and >= 0.70', () => {
      recordEvents(service, 'wks_1', 'whatsapp', 8, true);
      recordEvents(service, 'wks_1', 'whatsapp', 2, false);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.healthStatus).toBe('at_risk');
    });

    it('returns critical when deliveryRate < 0.70', () => {
      recordEvents(service, 'wks_1', 'whatsapp', 3, true);
      recordEvents(service, 'wks_1', 'whatsapp', 7, false);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.healthStatus).toBe('critical');
    });

    it('healthy when all events succeed', () => {
      recordEvents(service, 'wks_1', 'whatsapp', 100, true);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.healthStatus).toBe('healthy');
    });
  });

  describe('recentFailureBurst', () => {
    it('true when >50% of recent events fail', () => {
      recordEvents(service, 'wks_1', 'whatsapp', RECENT_WINDOW_SIZE, false);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.recentFailureBurst).toBe(true);
    });

    it('false when recent events are balanced', () => {
      recordEvents(service, 'wks_1', 'whatsapp', 5, true);
      recordEvents(service, 'wks_1', 'whatsapp', 5, false);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.recentFailureBurst).toBe(false);
    });

    it('false when fewer events than recent window and balanced', () => {
      service.recordEvent('wks_1', 'whatsapp', 'commerce.whatsapp.message_replied', new Date().toISOString(), true);
      service.recordEvent('wks_1', 'whatsapp', 'commerce.whatsapp.message_replied', new Date().toISOString(), false);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.recentFailureBurst).toBe(false);
    });

    it('true when fewer than window but majority fail', () => {
      service.recordEvent('wks_1', 'whatsapp', 'commerce.whatsapp.message_replied', new Date().toISOString(), false);
      service.recordEvent('wks_1', 'whatsapp', 'commerce.whatsapp.message_replied', new Date().toISOString(), false);
      service.recordEvent('wks_1', 'whatsapp', 'commerce.whatsapp.message_replied', new Date().toISOString(), true);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.recentFailureBurst).toBe(true);
    });
  });

  describe('banRiskScore', () => {
    it('increases with failure rate', () => {
      recordEvents(service, 'wks_1', 'whatsapp', 10, false);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.banRiskScore).toBeGreaterThan(0);
    });

    it('is 0 when all events succeed with balanced channels (no concentration)', () => {
      recordEvents(service, 'wks_1', 'whatsapp', 5, true);
      recordEvents(service, 'wks_1', 'email', 5, true);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.banRiskScore).toBe(0);
    });

    it('includes policy violations in score', () => {
      recordEvents(service, 'wks_1', 'whatsapp', 5, false, 'commerce.whatsapp.session_lifecycle');
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.policyViolationCount).toBe(5);
      expect(health.banRiskScore).toBeGreaterThan(0);
    });

    it('capped at 1.0', () => {
      recordEvents(service, 'wks_1', 'whatsapp', 100, false, 'commerce.whatsapp.session_lifecycle');
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.banRiskScore).toBe(1);
    });
  });

  describe('concentration detection', () => {
    it('adds to banRiskScore when channel has >70% of workspace events', () => {
      recordEvents(service, 'wks_1', 'whatsapp', 8, true);
      recordEvents(service, 'wks_1', 'email', 2, true);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.banRiskScore).toBe(0.2);
    });

    it('does not add to score when channel <= 70%', () => {
      recordEvents(service, 'wks_1', 'whatsapp', 5, true);
      recordEvents(service, 'wks_1', 'email', 5, true);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.banRiskScore).toBe(0);
    });

    it('when only one channel exists it still hits concentration', () => {
      recordEvents(service, 'wks_1', 'whatsapp', 10, true);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.banRiskScore).toBe(0.2);
    });
  });

  describe('workspace isolation', () => {
    it('events from different workspace do not leak', () => {
      recordEvents(service, 'wks_1', 'whatsapp', 10, true);
      recordEvents(service, 'wks_2', 'whatsapp', 10, false);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.totalSent).toBe(10);
      expect(health.deliveryRate).toBe(1);
    });
  });

  describe('channel isolation', () => {
    it('getChannelHealth only counts events from the specific channel', () => {
      recordEvents(service, 'wks_1', 'whatsapp', 5, true);
      recordEvents(service, 'wks_1', 'email', 5, false);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.totalSent).toBe(5);
      expect(health.deliveryRate).toBe(1);
    });
  });

  describe('policyViolationCount', () => {
    it('counts only failed session_lifecycle events', () => {
      service.recordEvent('wks_1', 'whatsapp', 'commerce.whatsapp.session_lifecycle', new Date().toISOString(), false);
      service.recordEvent('wks_1', 'whatsapp', 'commerce.whatsapp.session_lifecycle', new Date().toISOString(), false);
      service.recordEvent('wks_1', 'whatsapp', 'commerce.whatsapp.session_lifecycle', new Date().toISOString(), true);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.policyViolationCount).toBe(2);
    });

    it('does not count failed non-policy events as violations', () => {
      service.recordEvent('wks_1', 'whatsapp', 'commerce.whatsapp.message_replied', new Date().toISOString(), false);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.policyViolationCount).toBe(0);
    });

    it('does not count successful session_lifecycle as violation', () => {
      service.recordEvent('wks_1', 'whatsapp', 'commerce.whatsapp.session_lifecycle', new Date().toISOString(), true);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health.policyViolationCount).toBe(0);
    });
  });

  describe('result shape', () => {
    it('returns all required fields with correct types', () => {
      service.recordEvent('wks_1', 'whatsapp', 'commerce.whatsapp.message_replied', new Date().toISOString(), true);
      const health = service.getChannelHealth('wks_1', 'whatsapp');
      expect(health).toMatchObject({
        totalSent: expect.any(Number),
        deliveryRate: expect.any(Number),
        errorRate: expect.any(Number),
        banRiskScore: expect.any(Number),
        policyViolationCount: expect.any(Number),
        recentFailureBurst: expect.any(Boolean),
        healthStatus: expect.stringMatching(/^(healthy|degraded|at_risk|critical)$/),
      });
    });
  });
});
