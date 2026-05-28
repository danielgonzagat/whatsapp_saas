import { UnauthorizedException } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

jest.mock('@sentry/node', () => ({}), { virtual: true });

jest.mock('../common/utils/crypto-compare.util', () => ({
  safeCompareStrings: jest.fn(),
}));

describe('MetricsController', () => {
  const metricsGetMetrics = jest.fn();
  const metricsUpdateQueue = jest.fn();
  const metricsUpdateBilling = jest.fn();
  const queueGetStatus = jest.fn();
  let controller: MetricsController;

  const prismaMock = createPartialPrismaMock({ workspace: ['count'] });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.METRICS_TOKEN;
    process.env.NODE_ENV = 'test';

    controller = new MetricsController(
      {
        getMetrics: metricsGetMetrics,
        updateQueueMetrics: metricsUpdateQueue,
        updateBillingSuspensionMetrics: metricsUpdateBilling,
      } as never,
      { getQueuesStatus: queueGetStatus } as never,
      prismaMock as never,
    );
  });

  describe('GET /metrics', () => {
    it('calls queue health, updates metrics, queries workspace counts, returns prometheus text', async () => {
      queueGetStatus.mockResolvedValue([{ name: 'flow', main: { waiting: 1 }, dlq: {} }]);
      (prismaMock.workspace.count as jest.Mock).mockResolvedValueOnce(3).mockResolvedValueOnce(10);
      metricsGetMetrics.mockResolvedValue('# HELP http_requests_total\n');

      const res = { setHeader: jest.fn(), send: jest.fn() } as never;
      const req = { headers: {} } as never;

      await controller.getMetrics(req, res);

      expect(queueGetStatus).toHaveBeenCalledTimes(1);
      expect(metricsUpdateQueue).toHaveBeenCalledWith([
        { name: 'flow', main: { waiting: 1 }, dlq: {} },
      ]);
      expect(prismaMock.workspace.count as jest.Mock).toHaveBeenCalledTimes(2);
      expect(prismaMock.workspace.count as jest.Mock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            providerSettings: expect.objectContaining({
              path: ['billingSuspended'],
              equals: true,
            }),
          }),
        }),
      );
      expect(metricsUpdateBilling).toHaveBeenCalledWith({ suspended: 3, total: 10 });
      expect(metricsGetMetrics).toHaveBeenCalledTimes(1);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
      expect(res.send).toHaveBeenCalledWith('# HELP http_requests_total\n');
    });
  });

  describe('GET /metrics/queues', () => {
    it('returns queue summaries from health service', async () => {
      const summaries = [{ name: 'flow', main: { waiting: 1 }, dlq: {} }];
      queueGetStatus.mockResolvedValue(summaries);

      const req = { headers: {} } as never;
      const result = await controller.getQueues(req);

      expect(queueGetStatus).toHaveBeenCalledTimes(1);
      expect(result).toEqual(summaries);
    });
  });

  describe('GET /metrics error path', () => {
    it('throws UnauthorizedException when METRICS_TOKEN is set and no token supplied', async () => {
      process.env.METRICS_TOKEN = 'secret-token';

      const req = { headers: {} } as never;
      const res = {} as never;

      await expect(controller.getMetrics(req, res)).rejects.toThrow(UnauthorizedException);
    });

    it('propagates when queue health service rejects with error', async () => {
      queueGetStatus.mockRejectedValueOnce(new Error('Redis connection refused'));

      const req = { headers: {} } as never;
      const res = { setHeader: jest.fn(), send: jest.fn() } as never;

      await expect(controller.getMetrics(req, res)).rejects.toThrow('Redis connection refused');
    });
  });

  describe('token identity propagated', () => {
    it('grants access when valid bearer token matches METRICS_TOKEN', async () => {
      process.env.METRICS_TOKEN = 'secret-token';
      const { safeCompareStrings } = require('../common/utils/crypto-compare.util');
      safeCompareStrings.mockReturnValue(true);

      queueGetStatus.mockResolvedValue([]);
      (prismaMock.workspace.count as jest.Mock).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      metricsGetMetrics.mockResolvedValue('');

      const req = { headers: { authorization: 'Bearer secret-token' } } as never;
      const res = { setHeader: jest.fn(), send: jest.fn() } as never;

      await controller.getMetrics(req, res);

      expect(safeCompareStrings).toHaveBeenCalledWith('secret-token', 'secret-token');
      expect(metricsGetMetrics).toHaveBeenCalledTimes(1);
    });

    it('grants access when valid x-metrics-token header matches METRICS_TOKEN', async () => {
      process.env.METRICS_TOKEN = 'secret-token';
      const { safeCompareStrings } = require('../common/utils/crypto-compare.util');
      safeCompareStrings.mockReturnValue(true);

      queueGetStatus.mockResolvedValue([]);
      metricsGetMetrics.mockResolvedValue('');

      const req = {
        headers: { 'x-metrics-token': 'secret-token' },
      } as never;

      await controller.getQueues(req);

      expect(safeCompareStrings).toHaveBeenCalledWith('secret-token', 'secret-token');
      expect(queueGetStatus).toHaveBeenCalledTimes(1);
    });
  });
});
