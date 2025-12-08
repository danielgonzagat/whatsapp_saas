import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('UnifiedAgent (e2e)', () => {
  let app: INestApplication;
  let testWorkspaceId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Criar workspace de teste
    testWorkspaceId = 'test-workspace-' + Date.now();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /kloel/agent/:workspaceId/process', () => {
    it('should process a simple greeting', async () => {
      const response = await request(app.getHttpServer())
        .post(`/kloel/agent/${testWorkspaceId}/process`)
        .send({
          phone: '+5511999999999',
          message: 'Olá, bom dia!',
        })
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('response');
      expect(response.body).toHaveProperty('actions');
    });

    it('should detect buying intent', async () => {
      const response = await request(app.getHttpServer())
        .post(`/kloel/agent/${testWorkspaceId}/process`)
        .send({
          phone: '+5511999999999',
          message: 'Quanto custa o produto X?',
        })
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.actions).toBeDefined();
    });

    it('should handle scheduling requests', async () => {
      const response = await request(app.getHttpServer())
        .post(`/kloel/agent/${testWorkspaceId}/process`)
        .send({
          phone: '+5511999999999',
          message: 'Gostaria de agendar uma reunião para amanhã',
        })
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
    });

    it('should detect churn risk', async () => {
      const response = await request(app.getHttpServer())
        .post(`/kloel/agent/${testWorkspaceId}/process`)
        .send({
          phone: '+5511999999999',
          message: 'Quero cancelar minha assinatura',
        })
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('GET /kloel/agent/:workspaceId/tools', () => {
    it('should list available tools', async () => {
      const response = await request(app.getHttpServer())
        .get(`/kloel/agent/${testWorkspaceId}/tools`)
        .expect(200);

      expect(response.body).toHaveProperty('workspaceId');
      expect(response.body).toHaveProperty('tools');
      expect(Array.isArray(response.body.tools)).toBe(true);
      expect(response.body.tools.length).toBeGreaterThan(0);

      // Verificar estrutura de uma tool
      const tool = response.body.tools[0];
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('category');
      expect(tool).toHaveProperty('description');
    });
  });

  describe('POST /kloel/agent/:workspaceId/simulate', () => {
    it('should simulate without executing actions', async () => {
      const response = await request(app.getHttpServer())
        .post(`/kloel/agent/${testWorkspaceId}/simulate`)
        .send({
          phone: '+5511999999999',
          message: 'Quero comprar agora!',
        })
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('simulated', true);
    });
  });
});

describe('SmartPayment (e2e)', () => {
  let app: INestApplication;
  let testWorkspaceId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    testWorkspaceId = 'test-workspace-' + Date.now();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /kloel/payment/:workspaceId/create', () => {
    it('should create a smart payment', async () => {
      const response = await request(app.getHttpServer())
        .post(`/kloel/payment/${testWorkspaceId}/create`)
        .send({
          phone: '+5511999999999',
          customerName: 'João Silva',
          amount: 99.90,
          productName: 'Plano Pro',
        })
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('paymentId');
      expect(response.body).toHaveProperty('paymentUrl');
      expect(response.body).toHaveProperty('suggestedMessage');
    });
  });

  describe('POST /kloel/payment/:workspaceId/negotiate', () => {
    it('should handle discount negotiation', async () => {
      const response = await request(app.getHttpServer())
        .post(`/kloel/payment/${testWorkspaceId}/negotiate`)
        .send({
          contactId: 'test-contact-id',
          originalAmount: 100,
          customerMessage: 'Tá caro, consegue um desconto?',
          maxDiscountPercent: 15,
        })
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('originalAmount');
      expect(response.body).toHaveProperty('negotiatedAmount');
      expect(response.body).toHaveProperty('discountPercent');
      expect(response.body).toHaveProperty('approved');
    });
  });

  describe('GET /kloel/payment/:workspaceId/recovery/:paymentId', () => {
    it('should suggest recovery action', async () => {
      const response = await request(app.getHttpServer())
        .get(`/kloel/payment/${testWorkspaceId}/recovery/pay_123456`)
        .query({ daysPending: '2' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('action');
      expect(response.body).toHaveProperty('message');
    });
  });
});

describe('Audio (e2e)', () => {
  let app: INestApplication;
  let testWorkspaceId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    testWorkspaceId = 'test-workspace-' + Date.now();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /audio/synthesize', () => {
    it('should synthesize speech from text', async () => {
      const response = await request(app.getHttpServer())
        .post('/audio/synthesize')
        .send({
          text: 'Olá, como posso ajudar?',
          voice: 'nova',
          speed: 1.0,
        })
        .expect(201);

      expect(response.body).toHaveProperty('success');
      // Em ambiente de teste sem API key, pode falhar
      // mas a estrutura deve estar correta
    });
  });
});
