process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/whatsapp_saas';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.AUTH_OPTIONAL = 'true';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Inbox/Incoming (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const workspaceId = 'e2e-ws-inbox';
  const phone = '5511999996666';

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
      create: { id: workspaceId, name: 'E2E Inbox' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create conversation on incoming webhook', async () => {
    await request(app.getHttpServer() as App)
      .post(`/whatsapp/${workspaceId}/incoming`)
      .send({ from: phone, message: 'hello there' })
      .expect(201);

    const convs = await request(app.getHttpServer() as App)
      .get(`/inbox/${workspaceId}/conversations`)
      .expect(200);

    const conversations = convs.body as Array<{ id?: string }>;
    expect(Array.isArray(conversations)).toBe(true);
    expect(conversations.length).toBeGreaterThan(0);
  });
});
