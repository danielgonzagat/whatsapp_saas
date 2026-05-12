import { WorkerRuntimeService } from './worker-runtime.service';

describe('WorkerRuntimeService', () => {
  let service: WorkerRuntimeService;
  let config: { get: jest.Mock };
  let fetchSpy: jest.Mock;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    config = { get: jest.fn().mockReturnValue(undefined) };
    service = new WorkerRuntimeService(config as never);
    fetchSpy = jest.fn();
    originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('isAvailable', () => {
    it('returns true when WORKER_FORCE_AVAILABLE=true', async () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'WORKER_FORCE_AVAILABLE') return 'true';
        return undefined;
      });

      const result = await service.isAvailable();

      expect(result).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns false when WORKER_FORCE_AVAILABLE=false', async () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'WORKER_FORCE_AVAILABLE') return 'false';
        return undefined;
      });

      const result = await service.isAvailable();

      expect(result).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns false when no health URL configured', async () => {
      config.get.mockReturnValue(undefined);

      const result = await service.isAvailable(true);

      expect(result).toBe(false);
    });

    it('uses cached result within TTL window', async () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'WORKER_HEALTH_URL') return 'http://localhost:3001/health';
        return undefined;
      });
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });

      const first = await service.isAvailable();
      expect(first).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const second = await service.isAvailable();
      expect(second).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1); // cached
    });

    it('returns false on fetch error', async () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'WORKER_HEALTH_URL') return 'http://localhost:3001/health';
        return undefined;
      });
      fetchSpy.mockRejectedValue(new Error('Connection refused'));

      const result = await service.isAvailable(true);

      expect(result).toBe(false);
    });

    it('refetches when forceRefresh is true even within TTL', async () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'WORKER_HEALTH_URL') return 'http://localhost:3001/health';
        return undefined;
      });
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });

      await service.isAvailable();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      await service.isAvailable(true);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('interprets status=healthy as available', async () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'WORKER_HEALTH_URL') return 'http://localhost:3001/health';
        return undefined;
      });
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      const result = await service.isAvailable(true);

      expect(result).toBe(true);
    });

    it('interprets non-ok HTTP response as unavailable', async () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'WORKER_HEALTH_URL') return 'http://localhost:3001/health';
        return undefined;
      });
      fetchSpy.mockResolvedValue({
        ok: false,
        json: async () => ({ status: 'healthy' }),
      });

      const result = await service.isAvailable(true);

      expect(result).toBe(false);
    });
  });
});
