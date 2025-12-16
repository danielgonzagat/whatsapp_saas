process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:password@localhost:5432/whatsapp_saas';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.AUTH_OPTIONAL = 'true';
process.env.ENFORCE_OPTIN = 'true';

jest.mock('ioredis', () => {
  const Redis = class {
    private store = new Map<string, any>();
    constructor(..._args: any[]) {}
    get = async (key: string) => this.store.get(key);
    setex = async (key: string, _ttl: number, value: string) =>
      this.store.set(key, value);
    incr = async (key: string) => {
      const v = (this.store.get(key) || 0) + 1;
      this.store.set(key, v);
      return v;
    };
    incrby = async (key: string, n: number) => {
      const v = (this.store.get(key) || 0) + n;
      this.store.set(key, v);
      return v;
    };
    expire = async () => {};
    lrange = async () => [];
    rpush = async () => {};
    psubscribe = async () => {};
    subscribe = async () => {};
    publish = async () => 1;
    duplicate = () => new (Redis as any)();
    on = () => {};
    quit = async () => {};
    disconnect = () => {};
  };
  return { __esModule: true, default: Redis };
});

jest.mock('bullmq', () => {
  class Dummy {
    name: string;
    constructor(name?: string, ..._args: any[]) {
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
  return { __esModule: true, Queue: Dummy, Worker: Dummy, QueueEvents: Dummy, Job: class {} };
});

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PlanLimitsService } from '../src/billing/plan-limits.service';

describe('WhatsApp Send with Opt-in enforcement (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const workspaceId = 'e2e-ws-send';
  const phone = '5511999999998';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PlanLimitsService)
      .useValue({
        trackMessageSend: jest.fn(),
        ensureSubscriptionActive: jest.fn(),
        ensureFlowRunRate: jest.fn(),
        ensureFlowLimit: jest.fn(),
        ensureCampaignLimit: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    await prisma.workspace.upsert({
      where: { id: workspaceId },
      update: {},
      create: { id: workspaceId, name: 'E2E WS Send' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('should block send when opt-in is required and missing', async () => {
    await request(app.getHttpServer())
      .post(`/whatsapp/${workspaceId}/send`)
      .send({ to: phone, message: 'hello' })
      .expect(403);
  });
});
