import { ServiceUnavailableException } from '@nestjs/common';
import { SystemHealthController } from './system-health.controller';
import type { SystemHealthService } from './system-health.service';

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  init: jest.fn(),
  setUser: jest.fn(),
  setContext: jest.fn(),
  setTag: jest.fn(),
  setExtra: jest.fn(),
  withScope: jest.fn((callback) => callback({ setTag: jest.fn(), setExtra: jest.fn() })),
}));

describe('SystemHealthController', () => {
  const mockDeepReadiness = jest.fn();
  const mockLiveness = jest.fn();
  const mockReadiness = jest.fn();
  const mockCheck = jest.fn();
  const mockDeepDiagnostic = jest.fn();

  let controller: SystemHealthController;

  beforeEach(() => {
    const healthService = {
      liveness: mockLiveness,
      readiness: mockReadiness,
      deepReadiness: mockDeepReadiness,
      check: mockCheck,
      deepDiagnostic: mockDeepDiagnostic,
    };

    controller = new SystemHealthController(healthService as SystemHealthService);
    jest.clearAllMocks();
  });

  describe('GET /health/liveness', () => {
    it('returns 200 with UP status, uptime and timestamp', () => {
      mockLiveness.mockReturnValue({
        status: 'UP',
        uptime: 123.456,
        timestamp: '2024-01-01T00:00:00.000Z',
      });

      const result = controller.healthLiveness();

      expect(result).toEqual({
        status: 'UP',
        uptime: 123.456,
        timestamp: '2024-01-01T00:00:00.000Z',
      });
      expect(mockLiveness).toHaveBeenCalled();
    });
  });

  describe('GET /health', () => {
    it('returns liveness result', () => {
      mockLiveness.mockReturnValue({
        status: 'UP',
        uptime: 123.456,
        timestamp: '2024-01-01T00:00:00.000Z',
      });

      const result = controller.liveness();

      expect(result).toEqual({
        status: 'UP',
        uptime: 123.456,
        timestamp: '2024-01-01T00:00:00.000Z',
      });
    });
  });

  describe('GET /health/readiness', () => {
    it('returns 200 with full details when all dependencies are UP', async () => {
      mockDeepReadiness.mockResolvedValue({
        status: 'UP',
        timestamp: '2024-01-01T00:00:00.000Z',
        failures: [],
        details: {
          postgres: { status: 'UP', latencyMs: 1 },
          redis: { status: 'UP', latencyMs: 2 },
          stripe: { status: 'UP', latencyMs: 50 },
          metacloud: { status: 'UP', latencyMs: 200 },
          openai: { status: 'UP', latencyMs: 150 },
          anthropic: { status: 'UP', latencyMs: 300 },
        },
      });

      const result = await controller.readiness();

      expect(result.status).toBe('UP');
      expect(result.failures).toHaveLength(0);
    });

    it('throws ServiceUnavailableException (503) when any dependency is DOWN', async () => {
      mockDeepReadiness.mockResolvedValue({
        status: 'DOWN',
        timestamp: '2024-01-01T00:00:00.000Z',
        failures: ['postgres', 'redis'],
        details: {
          postgres: { status: 'DOWN', error: 'connection refused', latencyMs: 2001 },
          redis: { status: 'DOWN', error: 'ECONNREFUSED', latencyMs: 2001 },
          stripe: { status: 'UP', latencyMs: 50 },
          metacloud: { status: 'UP', latencyMs: 200 },
          openai: { status: 'UP', latencyMs: 150 },
          anthropic: { status: 'UP', latencyMs: 300 },
        },
      });

      await expect(controller.readiness()).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('GET /health/deep', () => {
    it('returns deep diagnostic payload from service', async () => {
      mockDeepDiagnostic.mockResolvedValue({
        status: 'UP',
        timestamp: '2024-01-01T00:00:00.000Z',
        uptime: 999.123,
        failures: [],
        indicators: {
          postgres: { status: 'UP', latencyMs: 5 },
          redis: { status: 'UP', latencyMs: 3 },
        },
        queues: {
          count: 1,
          details: [
            {
              name: 'autopilot',
              waiting: 0,
              active: 0,
              delayed: 0,
              failed: 0,
              dlqWaiting: 0,
              dlqFailed: 0,
            },
          ],
          totalWaiting: 0,
          totalFailed: 0,
          totalDlqWaiting: 0,
          totalDlqFailed: 0,
        },
        performance: {
          memory: { heapUsedMb: 50, heapTotalMb: 100, rssMb: 120 },
          diagnosticDurationMs: 15,
        },
      });

      const result = await controller.deep();

      expect(result.status).toBe('UP');
      expect(result.queues.count).toBe(1);
      expect(result.performance.memory.heapUsedMb).toBe(50);
      expect(mockDeepDiagnostic).toHaveBeenCalled();
    });
  });
});
