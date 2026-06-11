jest.mock('ioredis', () => {
  const Redis = class RedisMock {
    private store = new Map<string, unknown>();
    constructor(..._args: unknown[]) {}
    get = async (key: string) => this.store.get(key);
    setex = async (key: string, _ttl: number, value: string) => this.store.set(key, value);
    incr = async (key: string) => {
      const current = this.store.get(key);
      const v = (typeof current === 'number' ? current : 0) + 1;
      this.store.set(key, v);
      return v;
    };
    incrby = async (key: string, n: number) => {
      const current = this.store.get(key);
      const v = (typeof current === 'number' ? current : 0) + n;
      this.store.set(key, v);
      return v;
    };
    expire = async () => {};
    lrange = async () => [];
    rpush = async () => {};
    psubscribe = async () => {};
    on = () => {};
    subscribe = async () => {};
    publish = async () => 1;
    duplicate = () => new RedisMock();
    quit = async () => {};
    disconnect = () => {};
    private maxListeners = 10;
    getMaxListeners = () => this.maxListeners;
    setMaxListeners = (n: number) => {
      this.maxListeners = n;
      return this;
    };
  };
  return { __esModule: true, default: Redis };
});

jest.mock('bullmq', () => {
  class Dummy {
    name: string;
    constructor(name?: string, ..._args: unknown[]) {
      this.name = name || 'dummy';
    }
    add = async () => {};
    on = () => {};
    close = async () => {};
    getJobCounts = async () => ({});
    getJob = async () => null;
    getJobs = async () => [];
    clean = async () => {};
    drain = async () => {};
  }
  return {
    __esModule: true,
    Queue: Dummy,
    Worker: Dummy,
    QueueEvents: Dummy,
    Job: class {},
  };
});

process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/whatsapp_saas';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.AUTH_OPTIONAL = 'true';
process.env.METRICS_TOKEN = 'test-metrics-token';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import { AppModule } from '../src/app.module';
import { NeuroCrmService } from '../src/crm/neuro-crm.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { injectHttpRequest } from './helpers/in-process-http';

/**
 * Stub mínimo do PrismaService: o endpoint /metrics só usa workspace.count,
 * e o ambiente de verificação não tem Postgres alcançável. Cobre também os
 * hooks de ciclo de vida chamados em app.init()/app.close().
 */
const prismaStub = {
  onModuleInit: async () => undefined,
  onModuleDestroy: async () => undefined,
  beforeApplicationShutdown: async () => undefined,
  $connect: async () => undefined,
  $disconnect: async () => undefined,
  $queryRaw: async () => [],
  $executeRaw: async () => 0,
  setCheckoutEmailSender: () => undefined,
  workspace: { count: async () => 0 },
  auditLog: { create: async () => ({}) },
};

describe('Metrics (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NeuroCrmService)
      .useValue({})
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/metrics without token should 401', async () => {
    const response = await injectHttpRequest(app.getHttpServer() as Server, {
      method: 'GET',
      path: '/metrics',
    });
    expect(response.status).toBe(401);
  });

  it('/metrics with token should 200', async () => {
    const response = await injectHttpRequest(app.getHttpServer() as Server, {
      method: 'GET',
      path: '/metrics',
      headers: { authorization: 'Bearer test-metrics-token' },
    });
    expect(response.status).toBe(200);
  });
});
