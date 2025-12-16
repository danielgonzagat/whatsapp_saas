process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:password@localhost:5432/whatsapp_saas';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.AUTH_OPTIONAL = 'true';

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
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('register/login/check-email + oauth conflict', async () => {
    const email = `e2e_${Date.now()}_${Math.random().toString(16).slice(2)}@example.com`;
    const password = 'SenhaForte123';

    await request(app.getHttpServer())
      .get('/auth/check-email')
      .query({ email })
      .expect(200)
      .expect({ exists: false });

    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'E2E',
        email,
        password,
        workspaceName: 'E2E Workspace',
      })
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });

    expect(registerRes.body).toHaveProperty('access_token');
    expect(registerRes.body).toHaveProperty('refresh_token');

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'E2E', email, password })
      .expect(409)
      .expect({ error: 'Email já em uso' });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });

    expect(loginRes.body).toHaveProperty('access_token');

    await request(app.getHttpServer())
      .post('/auth/oauth')
      .send({
        provider: 'google',
        providerId: `gid_${Date.now()}`,
        email,
        name: 'E2E OAuth',
      })
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });

    await request(app.getHttpServer())
      .post('/auth/oauth')
      .send({
        provider: 'apple',
        providerId: `aid_${Date.now()}`,
        email,
        name: 'E2E OAuth',
      })
      .expect(409);

    // Cleanup best-effort
    const agent = await prisma.agent.findFirst({ where: { email } });
    if (agent) {
      await prisma.refreshToken.deleteMany({ where: { agentId: agent.id } });
      await prisma.agent.delete({ where: { id: agent.id } });
    }
  });

  it('rate limit: too many login attempts (429)', async () => {
    const email = `e2e_rate_${Date.now()}_${Math.random().toString(16).slice(2)}@example.com`;
    const password = 'SenhaForte123';

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'E2E', email, password, workspaceName: 'E2E Workspace' })
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });

    // Pode virar 429 antes por rate limit adicional (IP e IP+email)
    let blocked = false;
    for (let i = 0; i < 10; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'wrong' });

      if (res.status === 429) {
        blocked = true;
        break;
      }

      expect(res.status).toBe(401);
    }

    expect(blocked).toBe(true);

    // Cleanup best-effort
    const agent = await prisma.agent.findFirst({ where: { email } });
    if (agent) {
      await prisma.refreshToken.deleteMany({ where: { agentId: agent.id } });
      await prisma.agent.delete({ where: { id: agent.id } });
    }
  });
});
