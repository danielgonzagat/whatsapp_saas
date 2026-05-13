import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockRedis = {
  set: vi.fn(),
  publish: vi.fn(),
  lpush: vi.fn(),
  ltrim: vi.fn(),
  expire: vi.fn(),
  lrange: vi.fn(),
};

vi.mock('../redis-client', () => ({
  redis: mockRedis,
}));

describe('HealthMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('reportStatus', () => {
    it('saves status to Redis with expiry', async () => {
      const { HealthMonitor } = await import('../providers/health-monitor');
      await HealthMonitor.reportStatus('ws1', 'CONNECTED', { region: 'br' });
      expect(mockRedis.set).toHaveBeenCalledWith(
        'health:instance:ws1',
        expect.stringContaining('CONNECTED'),
        'EX',
        86400,
      );
    });

    it('publishes ban event when status is BANNED', async () => {
      const { HealthMonitor } = await import('../providers/health-monitor');
      await HealthMonitor.reportStatus('ws1', 'BANNED', { reason: 'abuse' });
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'events:ban',
        expect.stringContaining('ws1'),
      );
    });

    it('does not publish ban event for non-banned status', async () => {
      const { HealthMonitor } = await import('../providers/health-monitor');
      await HealthMonitor.reportStatus('ws1', 'DISCONNECTED');
      expect(mockRedis.publish).not.toHaveBeenCalled();
    });

    it('stores empty meta by default', async () => {
      const { HealthMonitor } = await import('../providers/health-monitor');
      await HealthMonitor.reportStatus('ws1', 'QRCODE');
      const call = mockRedis.set.mock.calls[0][1];
      const data = JSON.parse(call);
      expect(data.meta).toEqual({});
    });
  });

  describe('updateMetrics', () => {
    it('stores success event with latency', async () => {
      const { HealthMonitor } = await import('../providers/health-monitor');
      await HealthMonitor.updateMetrics('ws1', true, 250);
      expect(mockRedis.lpush).toHaveBeenCalledWith('metrics:ws1', '1:250');
      expect(mockRedis.ltrim).toHaveBeenCalledWith('metrics:ws1', 0, 49);
      expect(mockRedis.expire).toHaveBeenCalledWith('metrics:ws1', 3600);
    });

    it('stores failure event', async () => {
      const { HealthMonitor } = await import('../providers/health-monitor');
      await HealthMonitor.updateMetrics('ws1', false, 0);
      expect(mockRedis.lpush).toHaveBeenCalledWith('metrics:ws1', '0:0');
    });
  });

  describe('getHealth', () => {
    it('returns score 100 with 0 latency when no events', async () => {
      mockRedis.lrange.mockResolvedValue([]);
      const { HealthMonitor } = await import('../providers/health-monitor');
      const result = await HealthMonitor.getHealth('ws1');
      expect(result).toEqual({ score: 100, avgLatency: 0 });
    });

    it('calculates score from events', async () => {
      mockRedis.lrange.mockResolvedValue(['1:100', '0:200', '1:150', '1:50']);
      const { HealthMonitor } = await import('../providers/health-monitor');
      const result = await HealthMonitor.getHealth('ws1');
      expect(result.score).toBe(75);
      expect(result.avgLatency).toBe(125);
    });

    it('calculates score 0 for all failures', async () => {
      mockRedis.lrange.mockResolvedValue(['0:100', '0:100']);
      const { HealthMonitor } = await import('../providers/health-monitor');
      const result = await HealthMonitor.getHealth('ws1');
      expect(result.score).toBe(0);
    });

    it('calculates score 100 for all successes', async () => {
      mockRedis.lrange.mockResolvedValue(['1:300', '1:100']);
      const { HealthMonitor } = await import('../providers/health-monitor');
      const result = await HealthMonitor.getHealth('ws1');
      expect(result.score).toBe(100);
      expect(result.avgLatency).toBe(200);
    });
  });

  describe('pushAlert', () => {
    it('publishes alert payload to Redis', async () => {
      const { HealthMonitor } = await import('../providers/health-monitor');
      await HealthMonitor.pushAlert('ws1', 'instance-disconnected', { reason: 'timeout' });
      expect(mockRedis.publish).toHaveBeenCalledWith(
        'alerts',
        expect.stringContaining('instance-disconnected'),
      );
      const payload = JSON.parse(mockRedis.publish.mock.calls[0][1]);
      expect(payload.workspaceId).toBe('ws1');
      expect(payload.kind).toBe('instance-disconnected');
      expect(payload.meta).toEqual({ reason: 'timeout' });
      expect(payload.ts).toBe(1767268800000);
    });
  });
});

describe('providerStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('success', () => {
    it('initializes and increments success counter', async () => {
      const { providerStatus } = await import('../providers/health-monitor');
      providerStatus.success('meta-cloud', 120);
      providerStatus.success('meta-cloud', 80);
      const ranking = providerStatus.getHealthRanking();
      expect(ranking).toContain('meta-cloud');
    });
  });

  describe('error', () => {
    it('increments fail counter', async () => {
      const { providerStatus } = await import('../providers/health-monitor');
      providerStatus.error('meta-cloud');
      providerStatus.error('meta-cloud');
      const ranking = providerStatus.getHealthRanking();
      expect(ranking).toContain('meta-cloud');
    });
  });

  describe('getHealthRanking', () => {
    it('returns defaults when no providers registered', async () => {
      const { providerStatus } = await import('../providers/health-monitor');
      const ranking = providerStatus.getHealthRanking();
      expect(ranking).toEqual(['meta-cloud']);
    });

    it('ranks providers by success rate', async () => {
      const { providerStatus } = await import('../providers/health-monitor');
      providerStatus.success('provider-a', 100);
      providerStatus.success('provider-a', 100);
      providerStatus.error('provider-b');
      providerStatus.success('provider-b', 100);
      const ranking = providerStatus.getHealthRanking();
      expect(ranking[0]).toBe('provider-a');
    });

    it('ranks by latency when scores tie', async () => {
      const { providerStatus } = await import('../providers/health-monitor');
      providerStatus.success('fast', 50);
      providerStatus.success('slow', 200);
      const ranking = providerStatus.getHealthRanking();
      expect(ranking[0]).toBe('fast');
    });

    it('appends meta-cloud default when missing', async () => {
      const { providerStatus } = await import('../providers/health-monitor');
      providerStatus.success('custom', 100);
      const ranking = providerStatus.getHealthRanking();
      expect(ranking).toContain('meta-cloud');
    });
  });
});
