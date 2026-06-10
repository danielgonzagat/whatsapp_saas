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

interface FlowTemplateListItem {
  id: string;
  downloads?: number;
}

describe('Flow Templates (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const workspaceId = 'e2e-ws-flowtpl';

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
      create: { id: workspaceId, name: 'E2E FlowTpl' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('should seed and list public templates', async () => {
    await prisma.flowTemplate.create({
      data: {
        name: 'E2E Template',
        category: 'TEST',
        nodes: [],
        edges: [],
        isPublic: true,
      },
    });

    const res = await request(app.getHttpServer() as App)
      .get('/flow-templates/public')
      .expect(200);

    const templates = res.body as FlowTemplateListItem[];
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThan(0);
  });

  it('should get a template by ID', async () => {
    const listRes = await request(app.getHttpServer() as App)
      .get('/flow-templates/public')
      .expect(200);
    const templates = listRes.body as FlowTemplateListItem[];
    const templateId = templates[0]?.id ?? '';
    expect(templateId).toBeTruthy();

    const res = await request(app.getHttpServer() as App)
      .get(`/flow-templates/${templateId}`)
      .expect(200);
    expect(res.body).toHaveProperty('id', templateId);
    expect(res.body).toHaveProperty('name');
    expect(res.body).toHaveProperty('category');
    expect(res.body).toHaveProperty('nodes');
    expect(res.body).toHaveProperty('edges');
  });

  it('should increment download count on a template', async () => {
    const listRes = await request(app.getHttpServer() as App)
      .get('/flow-templates/public')
      .expect(200);
    const templates = listRes.body as FlowTemplateListItem[];
    const templateId = templates[0]?.id ?? '';
    expect(templateId).toBeTruthy();

    const before = templates[0]?.downloads ?? 0;
    const res = await request(app.getHttpServer() as App)
      .post(`/flow-templates/${templateId}/download`)
      .expect(201);
    expect(res.body).toHaveProperty('downloads', before + 1);
  });
});
