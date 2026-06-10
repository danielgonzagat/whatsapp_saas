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
import { PlanLimitsService } from '../src/billing/plan-limits.service';

describe('Flows run (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const workspaceId = 'e2e-ws-flowrun';
  const phone = '5511999997777';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PlanLimitsService)
      .useValue({
        ensureFlowLimit: jest.fn(),
        ensureCampaignLimit: jest.fn(),
        ensureSubscriptionActive: jest.fn(),
        ensureFlowRunRate: jest.fn(),
        trackMessageSend: jest.fn(),
        trackAiUsage: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();

    await prisma.workspace.upsert({
      where: { id: workspaceId },
      update: {},
      create: { id: workspaceId, name: 'E2E FlowRun' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create an execution when running a flow', async () => {
    const flow = {
      nodes: [
        { id: 'start', type: 'start', data: {} },
        { id: 'msg', type: 'message', data: { text: 'Hello' } },
      ],
      edges: [{ id: 'e1', source: 'start', target: 'msg' }],
    };

    const res = await request(app.getHttpServer() as App)
      .post('/flows/run')
      .send({ workspaceId, flow, startNode: 'start', user: phone })
      .expect(201);

    const runBody = res.body as { executionId?: string };
    expect(runBody.executionId).toBeDefined();

    const exec = await prisma.flowExecution.findUnique({
      where: { id: runBody.executionId ?? '' },
    });
    expect(exec).toBeTruthy();
    expect(exec?.workspaceId).toBe(workspaceId);
  });
});
