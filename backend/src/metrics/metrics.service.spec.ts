import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';

jest.mock('prom-client', () => {
  const counterInc = jest.fn();
  const histogramObserve = jest.fn();
  const gaugeSet = jest.fn();
  const registryMetrics = jest
    .fn()
    .mockResolvedValue('# HELP http_requests_total\nhttp_requests_total 42');
  const internalCollectDefaultMetrics = jest.fn();

  return {
    Registry: jest.fn().mockImplementation(() => ({
      metrics: registryMetrics,
    })),
    Counter: jest.fn().mockImplementation(() => ({
      inc: counterInc,
    })),
    Gauge: jest.fn().mockImplementation(() => ({
      set: gaugeSet,
    })),
    Histogram: jest.fn().mockImplementation(() => ({
      observe: histogramObserve,
    })),
    collectDefaultMetrics: internalCollectDefaultMetrics,
    __counterInc: counterInc,
    __histogramObserve: histogramObserve,
    __gaugeSet: gaugeSet,
    __registryMetrics: registryMetrics,
    __collectDefaultMetrics: internalCollectDefaultMetrics,
  };
});

describe('MetricsService', () => {
  let service: MetricsService;
  let counterInc: jest.Mock;
  let histogramObserve: jest.Mock;
  let gaugeSet: jest.Mock;
  let registryMetrics: jest.Mock;
  let _collectDefaultMetricsMock: jest.Mock;

  beforeEach(async () => {
    const promClient = jest.requireMock('prom-client');
    counterInc = promClient.__counterInc;
    histogramObserve = promClient.__histogramObserve;
    gaugeSet = promClient.__gaugeSet;
    registryMetrics = promClient.__registryMetrics;
    _collectDefaultMetricsMock = promClient.__collectDefaultMetrics;

    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  describe('getMetrics', () => {
    it('returns prometheus metrics text from the registry', async () => {
      const result = await service.getMetrics();

      expect(result).toBe('# HELP http_requests_total\nhttp_requests_total 42');
      expect(registryMetrics).toHaveBeenCalledTimes(1);
    });
  });

  describe('observeHttp', () => {
    it('increments http counter and records duration in histogram', () => {
      service.observeHttp('GET', '/users/:id', 200, 0.15);

      expect(counterInc).toHaveBeenCalledWith({
        method: 'GET',
        route: '/users/:id',
        status: '200',
      });
      expect(histogramObserve).toHaveBeenCalledWith(
        { method: 'GET', route: '/users/:id', status: '200' },
        0.15,
      );
    });

    it('converts numeric status to string label', () => {
      service.observeHttp('POST', '/contacts', 201, 0.3);

      expect(counterInc).toHaveBeenCalledWith(expect.objectContaining({ status: '201' }));
      expect(histogramObserve).toHaveBeenCalledWith(
        expect.objectContaining({ status: '201' }),
        0.3,
      );
    });
  });

  describe('updateQueueMetrics', () => {
    it('sets gauge values for each queue, pipe and state', () => {
      const summaries = [
        {
          name: 'autopilot',
          main: { waiting: 5, active: 2, delayed: 0, failed: 1 },
          dlq: { waiting: 0, active: 0, delayed: 0, failed: 0 },
        },
        {
          name: 'flow',
          main: { waiting: 10, active: 3, delayed: 1, failed: 0 },
          dlq: { waiting: 1, active: 0, delayed: 0, failed: 2 },
        },
      ];

      service.updateQueueMetrics(summaries);

      expect(gaugeSet).toHaveBeenCalledTimes(16);

      expect(gaugeSet).toHaveBeenCalledWith(
        { queue: 'autopilot', pipe: 'main', state: 'waiting' },
        5,
      );
      expect(gaugeSet).toHaveBeenCalledWith(
        { queue: 'autopilot', pipe: 'dlq', state: 'failed' },
        0,
      );
      expect(gaugeSet).toHaveBeenCalledWith({ queue: 'flow', pipe: 'main', state: 'active' }, 3);
      expect(gaugeSet).toHaveBeenCalledWith({ queue: 'flow', pipe: 'dlq', state: 'failed' }, 2);
    });

    it('treats missing state counts as 0', () => {
      const summaries = [
        {
          name: 'scraper',
          main: { waiting: 1 },
          dlq: {},
        },
      ];

      service.updateQueueMetrics(summaries);

      expect(gaugeSet).toHaveBeenCalledWith({ queue: 'scraper', pipe: 'main', state: 'failed' }, 0);
    });
  });

  describe('updateBillingSuspensionMetrics', () => {
    it('sets suspended, active, and total gauge labels', () => {
      service.updateBillingSuspensionMetrics({ suspended: 3, total: 10 });

      expect(gaugeSet).toHaveBeenCalledWith({ status: 'suspended' }, 3);
      expect(gaugeSet).toHaveBeenCalledWith({ status: 'active' }, 7);
      expect(gaugeSet).toHaveBeenCalledWith({ status: 'total' }, 10);
    });

    it('clamps active count to 0 when suspended exceeds total', () => {
      service.updateBillingSuspensionMetrics({ suspended: 15, total: 10 });

      expect(gaugeSet).toHaveBeenCalledWith({ status: 'active' }, 0);
    });
  });
});
