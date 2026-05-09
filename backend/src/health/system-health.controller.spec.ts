import { ServiceUnavailableException } from '@nestjs/common';
import { SystemHealthController } from './system-health.controller';

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

  let controller: SystemHealthController;

  beforeEach(() => {
    const healthService = {
      liveness: mockLiveness,
      readiness: mockReadiness,
      deepReadiness: mockDeepReadiness,
      check: mockCheck,
    };

    controller = new SystemHealthController(healthService as never);
    jest.clearAllMocks();
  });

  describe('GET /health/liveness', () => {
    it('returns 200 with UP status from SystemHealthService', () => {
      mockLiveness.mockReturnValue({ status: 'UP', timestamp: '2024-01-01T00:00:00.000Z' });

      const result = controller.healthLiveness();

      expect(result).toEqual({ status: 'UP', timestamp: '2024-01-01T00:00:00.000Z' });
      expect(mockLiveness).toHaveBeenCalled();
    });
  });

  describe('GET /health', () => {
    it('returns liveness result', () => {
      mockLiveness.mockReturnValue({ status: 'UP', timestamp: '2024-01-01T00:00:00.000Z' });

      const result = controller.liveness();

      expect(result).toEqual({ status: 'UP', timestamp: '2024-01-01T00:00:00.000Z' });
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
});
