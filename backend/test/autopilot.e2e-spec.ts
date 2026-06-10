process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/whatsapp_saas';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.AUTH_OPTIONAL = 'true';

jest.mock('ioredis', () => {
  const Redis = class RedisMock {
    private store = new Map<string, unknown>();
    constructor(..._args: unknown[]) {}
    getMaxListeners = () => 10;
    setMaxListeners = (_n: number) => this;
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
    subscribe = async () => {};
    publish = async () => 1;
    duplicate = () => new RedisMock();
    on = () => {};
    quit = async () => {};
    disconnect = () => {};
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

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Autopilot inbound (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const workspaceId = 'e2e-ws-autopilot';
  const phone = '5511999995555';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    await prisma.workspace.upsert({
      where: { id: workspaceId },
      update: {
        providerSettings: {
          whatsappProvider: 'meta',
          meta: { token: 'dummy', phoneId: '123', wabaId: '456' },
          autopilot: { enabled: true },
        },
      },
      create: {
        id: workspaceId,
        name: 'E2E Autopilot',
        providerSettings: {
          whatsappProvider: 'meta',
          meta: { token: 'dummy', phoneId: '123', wabaId: '456' },
          autopilot: { enabled: true },
        },
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('should accept incoming message and not error when autopilot is enabled', async () => {
    await request(app.getHttpServer() as App)
      .post(`/whatsapp/${workspaceId}/incoming`)
      .send({ from: phone, message: 'oi, quero comprar' })
      .expect(201);
  });
});
