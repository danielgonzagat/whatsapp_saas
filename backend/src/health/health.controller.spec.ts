import { HealthController } from './health.controller';

describe('HealthController', () => {
  const getHealth = jest.fn();

  let controller: HealthController;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new HealthController({ getHealth } as never);
  });

  describe('getHealth', () => {
    const healthPayload = {
      status: 'UP',
      score: 100,
      latency: 5,
      lastCheck: 1715698800,
      db: 'up',
      queue: { waiting: 0, failed: 0, dlqWaiting: 0, dlqFailed: 0, threshold: 200 },
      queueAlert: false,
    };

    it('delegates to service and returns health data (happy path)', async () => {
      getHealth.mockResolvedValue(healthPayload);

      const result = await controller.getHealth('ws-1');

      expect(getHealth).toHaveBeenCalledWith('ws-1');
      expect(result).toEqual(healthPayload);
    });

    it('passes the workspaceId param into the service call (identity propagated)', async () => {
      getHealth.mockResolvedValue({ status: 'UP' });

      await controller.getHealth('ws-unique');

      expect(getHealth).toHaveBeenCalledWith('ws-unique');
    });

    it('propagates errors when service rejects (error path)', async () => {
      const error = new Error('Redis connection failed');
      getHealth.mockRejectedValue(error);

      await expect(controller.getHealth('ws-1')).rejects.toThrow('Redis connection failed');

      expect(getHealth).toHaveBeenCalledWith('ws-1');
    });

    it('isolates calls by workspaceId — independent health per workspace', async () => {
      getHealth.mockResolvedValueOnce({ status: 'UP' }).mockResolvedValueOnce({ status: 'DOWN' });

      const upResult = await controller.getHealth('ws-a');
      const downResult = await controller.getHealth('ws-b');

      expect(getHealth).toHaveBeenNthCalledWith(1, 'ws-a');
      expect(getHealth).toHaveBeenNthCalledWith(2, 'ws-b');
      expect(upResult).toEqual({ status: 'UP' });
      expect(downResult).toEqual({ status: 'DOWN' });
    });
  });
});
