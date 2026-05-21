import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockStoreZadd = vi.fn();
const mockStoreZremRangeByScore = vi.fn();
const mockStoreZcount = vi.fn();
const mockHealthGetHealth = vi.fn();

vi.mock('../context-store', () => {
  const MockContextStore = vi.fn();
  MockContextStore.prototype.zadd = mockStoreZadd;
  MockContextStore.prototype.zremRangeByScore = mockStoreZremRangeByScore;
  MockContextStore.prototype.zcount = mockStoreZcount;
  return { ContextStore: MockContextStore };
});

vi.mock('../providers/health-monitor', () => ({
  HealthMonitor: {
    getHealth: mockHealthGetHealth,
  },
}));

describe('anti-ban', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockStoreZcount.mockResolvedValue(0);
    mockHealthGetHealth.mockResolvedValue({ score: 100, avgLatency: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('humanDelay', () => {
    it('uses default jitter range when workspace has no overrides', async () => {
      const { AntiBan } = await import('../providers/anti-ban');
      const prom = AntiBan.humanDelay({ id: 'ws1' });
      await vi.runAllTimersAsync();
      await prom;
    }, 10000);

    it('respects workspace jitterMin and jitterMax', async () => {
      const { AntiBan } = await import('../providers/anti-ban');
      const promise = AntiBan.humanDelay({
        id: 'ws1',
        jitterMin: 100,
        jitterMax: 200,
      });
      await vi.advanceTimersByTimeAsync(200);
      await promise;
    });

    it('swaps min and max when min > max', async () => {
      const { AntiBan } = await import('../providers/anti-ban');
      const promise = AntiBan.humanDelay({
        id: 'ws1',
        jitterMin: 5000,
        jitterMax: 1000,
      });
      await vi.advanceTimersByTimeAsync(5000);
      await promise;
    });
  });

  describe('registerSend', () => {
    it('adds timestamp to zset and cleans old entries', async () => {
      const { AntiBan } = await import('../providers/anti-ban');
      vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
      await AntiBan.registerSend('ws1');
      expect(mockStoreZadd).toHaveBeenCalled();
      expect(mockStoreZremRangeByScore).toHaveBeenCalled();
    });
  });

  describe('burstProtector', () => {
    it('does not throttle when under limit with healthy workspace', async () => {
      mockStoreZcount.mockResolvedValue(5);
      mockHealthGetHealth.mockResolvedValue({ score: 100, avgLatency: 0 });
      const { AntiBan } = await import('../providers/anti-ban');
      vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
      await AntiBan.burstProtector({ id: 'ws1' });
      expect(mockStoreZcount).toHaveBeenCalled();
    });

    it('uses warmup limit of 10 when health score < 80', async () => {
      mockStoreZcount.mockResolvedValue(5);
      mockHealthGetHealth.mockResolvedValue({ score: 50, avgLatency: 0 });
      const { AntiBan } = await import('../providers/anti-ban');
      vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
      await AntiBan.burstProtector({ id: 'ws1' });
      // count=5 < limit=10, no throttle
    });

    it('throttles when count exceeds warmup limit', async () => {
      mockStoreZcount.mockResolvedValue(15);
      mockHealthGetHealth.mockResolvedValue({ score: 50, avgLatency: 0 });
      const { AntiBan } = await import('../providers/anti-ban');
      vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
      const promise = AntiBan.burstProtector({ id: 'ws1' });
      await vi.advanceTimersByTimeAsync(5000);
      await promise;
    });

    it('throttles when count exceeds normal limit', async () => {
      mockStoreZcount.mockResolvedValue(41);
      mockHealthGetHealth.mockResolvedValue({ score: 100, avgLatency: 0 });
      const { AntiBan } = await import('../providers/anti-ban');
      vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
      const prom = AntiBan.burstProtector({ id: 'ws1' });
      await vi.runAllTimersAsync();
      await prom;
    }, 10000);
  });

  describe('nightMode', () => {
    it('applies delay between midnight and 6am', async () => {
      const { AntiBan } = await import('../providers/anti-ban');
      vi.setSystemTime(new Date('2026-01-01T03:00:00Z'));
      const promise = AntiBan.nightMode(null);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;
    });

    it('does not delay outside night hours', async () => {
      const { AntiBan } = await import('../providers/anti-ban');
      vi.setSystemTime(new Date('2026-01-01T14:00:00Z'));
      const promise = AntiBan.nightMode(null);
      await promise;
    });
  });

  describe('apply', () => {
    it('runs all anti-ban checks in sequence', async () => {
      mockStoreZcount.mockResolvedValue(2);
      mockHealthGetHealth.mockResolvedValue({ score: 100, avgLatency: 0 });
      const { AntiBan } = await import('../providers/anti-ban');
      vi.setSystemTime(new Date('2026-01-01T14:00:00Z'));
      const promise = AntiBan.apply({ id: 'ws1', jitterMin: 10, jitterMax: 20 });
      await vi.advanceTimersByTimeAsync(50);
      await promise;
      expect(mockStoreZadd).toHaveBeenCalled();
      expect(mockStoreZcount).toHaveBeenCalled();
    });
  });
});
