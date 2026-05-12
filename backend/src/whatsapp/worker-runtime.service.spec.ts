import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WorkerRuntimeService } from './worker-runtime.service';

describe('WorkerRuntimeService', () => {
  let service: WorkerRuntimeService;
  let config: { get: jest.Mock };
  const originalFetch = global.fetch;

  beforeEach(async () => {
    config = { get: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkerRuntimeService,
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = module.get(WorkerRuntimeService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('respects WORKER_FORCE_AVAILABLE=true override (no fetch)', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'WORKER_FORCE_AVAILABLE' ? 'true' : undefined,
    );
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    await expect(service.isAvailable()).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('respects WORKER_FORCE_AVAILABLE=false override (no fetch)', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'WORKER_FORCE_AVAILABLE' ? 'false' : undefined,
    );
    await expect(service.isAvailable()).resolves.toBe(false);
  });

  it('returns false when no WORKER_HEALTH_URL configured', async () => {
    config.get.mockReturnValue(undefined);
    await expect(service.isAvailable()).resolves.toBe(false);
  });

  it('returns true when worker health endpoint reports {status: "ok"}', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'WORKER_FORCE_AVAILABLE') return undefined;
      if (key === 'WORKER_HEALTH_URL') return 'http://worker/health';
      return undefined;
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    }) as typeof fetch;
    await expect(service.isAvailable()).resolves.toBe(true);
  });

  it('returns false when worker health endpoint returns non-ok HTTP', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'WORKER_HEALTH_URL' ? 'http://worker/health' : undefined,
    );
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as typeof fetch;
    await expect(service.isAvailable()).resolves.toBe(false);
  });

  it('returns false when fetch throws', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'WORKER_HEALTH_URL' ? 'http://worker/health' : undefined,
    );
    global.fetch = jest.fn().mockRejectedValue(new Error('down')) as typeof fetch;
    await expect(service.isAvailable()).resolves.toBe(false);
  });

  it('caches the result and serves from cache within TTL', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'WORKER_HEALTH_URL' ? 'http://worker/health' : undefined,
    );
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });
    global.fetch = fetchMock as typeof fetch;
    await service.isAvailable();
    await service.isAvailable();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('forceRefresh=true bypasses cache', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'WORKER_HEALTH_URL' ? 'http://worker/health' : undefined,
    );
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });
    global.fetch = fetchMock as typeof fetch;
    await service.isAvailable();
    await service.isAvailable(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends Authorization header when WORKER_METRICS_TOKEN configured', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'WORKER_HEALTH_URL') return 'http://worker/health';
      if (key === 'WORKER_METRICS_TOKEN') return 'sk-test-token';
      return undefined;
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });
    global.fetch = fetchMock as typeof fetch;
    await service.isAvailable();
    const init = fetchMock.mock.calls[0][1] as { headers?: Record<string, string> };
    expect(init.headers?.Authorization).toBe('Bearer sk-test-token');
  });
});
