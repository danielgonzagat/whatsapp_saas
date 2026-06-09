// Unifica a identidade dos pacotes Nest no jest-e2e local: o resolver do jest resolve
// '@nestjs/core' a partir de '@nestjs/testing' para a cópia instalada na RAIZ do repo,
// enquanto src/** resolve para backend/node_modules — duas classes Reflector/HttpException
// distintas quebram a DI do AuditInterceptor e transformam respostas HTTP em 500.
jest.mock('@nestjs/core', () =>
  jest.requireActual<typeof import('@nestjs/core')>('../../node_modules/@nestjs/core'),
);
jest.mock('../../node_modules/@nestjs/common', () =>
  jest.requireActual<typeof import('@nestjs/common')>('@nestjs/common'),
);

process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/whatsapp_saas';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.AUTH_OPTIONAL = 'true';
process.env.ENFORCE_OPTIN = 'true';

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
    on = () => {};
    subscribe = async () => {};
    publish = async () => 1;
    duplicate = () => new RedisMock();
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
    close = async () => {};
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

describe('WhatsApp Opt-in (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const workspaceId = 'e2e-ws';
  const phone = '5511999999999';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    await prisma.workspace.upsert({
      where: { id: workspaceId },
      update: {},
      create: { id: workspaceId, name: 'E2E Workspace' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('should opt-in bulk and return status true', async () => {
    await request(app.getHttpServer() as App)
      .post(`/whatsapp/${workspaceId}/opt-in/bulk`)
      .send({ phones: [phone] })
      .expect(201);

    const res = await request(app.getHttpServer() as App)
      .get(`/whatsapp/${workspaceId}/opt-status/${phone}`)
      .expect(200);

    const body = res.body as { optIn?: boolean; contactExists?: boolean };
    expect(body.optIn).toBe(true);
    expect(body.contactExists).toBe(true);
  });

  it('should opt-out bulk and return status false', async () => {
    await request(app.getHttpServer() as App)
      .post(`/whatsapp/${workspaceId}/opt-out/bulk`)
      .send({ phones: [phone] })
      .expect(201);

    const res = await request(app.getHttpServer() as App)
      .get(`/whatsapp/${workspaceId}/opt-status/${phone}`)
      .expect(200);

    const body = res.body as { optIn?: boolean };
    expect(body.optIn).toBe(false);
  });
});
