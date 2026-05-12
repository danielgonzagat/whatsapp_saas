import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

const REDIS_TOKEN = 'default_IORedisModuleConnectionToken';

jest.mock('../queue/queue', () => {
  const fakeQueue = {
    name: 'test-queue',
    getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, delayed: 0, failed: 0 }),
  };
  return {
    queueRegistry: { test: fakeQueue },
    getDlqQueue: () => fakeQueue,
    autopilotQueue: fakeQueue,
    flowQueue: fakeQueue,
  };
});

describe('HealthService', () => {
  let service: HealthService;
  let redis: { get: jest.Mock; lrange: jest.Mock };
  let prisma: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    redis = {
      get: jest.fn().mockResolvedValue(null),
      lrange: jest.fn().mockResolvedValue([]),
    };
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prisma },
        { provide: REDIS_TOKEN, useValue: redis },
      ],
    }).compile();
    service = module.get(HealthService);
  });

  it('defaults to UNKNOWN when no Redis health entry exists', async () => {
    const result = await service.getHealth('ws-1');
    expect(result.status).toBe('UNKNOWN');
    expect(result.lastCheck).toBe(0);
  });

  it('parses status JSON from Redis', async () => {
    redis.get.mockResolvedValue(JSON.stringify({ status: 'OK', lastCheck: 12345 }));
    const result = await service.getHealth('ws-1');
    expect(result.status).toBe('OK');
    expect(result.lastCheck).toBe(12345);
  });

  it('computes healthScore from success ratio of metrics list', async () => {
    redis.lrange.mockResolvedValue(['1:100', '1:200', '0:0']);
    const result = await service.getHealth('ws-1');
    expect(result.score).toBe(67); // 2/3 ≈ 67
    expect(result.latency).toBeGreaterThan(0);
  });

  it('defaults score=100 and latency=0 when no metrics', async () => {
    redis.lrange.mockResolvedValue([]);
    const result = await service.getHealth('ws-1');
    expect(result.score).toBe(100);
    expect(result.latency).toBe(0);
  });

  it('reports db=down when SELECT 1 fails', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    const result = await service.getHealth('ws-1');
    expect(result.db).toBe('down');
  });

  it('reports db=up when SELECT 1 succeeds', async () => {
    const result = await service.getHealth('ws-1');
    expect(result.db).toBe('up');
  });

  it('uses per-workspace Redis keys (health:instance + metrics)', async () => {
    await service.getHealth('ws-tenant-A');
    expect(redis.get).toHaveBeenCalledWith('health:instance:ws-tenant-A');
    expect(redis.lrange).toHaveBeenCalledWith('metrics:ws-tenant-A', 0, -1);
  });

  it('attaches queue snapshot with threshold from env', async () => {
    const result = await service.getHealth('ws-1');
    expect(result.queue).toEqual(
      expect.objectContaining({
        waiting: 0,
        failed: 0,
        threshold: expect.any(Number),
      }),
    );
  });
});
