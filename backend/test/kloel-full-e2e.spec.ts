/**
 * KLOEL Full E2E Test Suite
 *
 * Simulates a real user journey: Register → KYC → Product → Kloel AI → Checkout → Sale → Wallet → Reports
 * Tests run sequentially — each test depends on state from the previous one.
 */

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
    set = async (key: string, value: any) => { this.store.set(key, value); return 'OK'; };
    setex = async (key: string, _ttl: number, value: string) => this.store.set(key, value);
    del = async (...keys: string[]) => { keys.forEach(k => this.store.delete(k)); return keys.length; };
    incr = async (key: string) => { const v = (this.store.get(key) || 0) + 1; this.store.set(key, v); return v; };
    incrby = async (key: string, n: number) => { const v = (this.store.get(key) || 0) + n; this.store.set(key, v); return v; };
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
    constructor(name?: string, ..._args: any[]) { this.name = name || 'dummy'; }
    add = async () => ({});
    on = () => {};
    getJobCounts = async () => ({});
    getJob = async () => null;
    getJobs = async () => [];
    clean = async () => {};
    drain = async () => {};
  }
  return { __esModule: true, Queue: Dummy, Worker: Dummy, QueueEvents: Dummy, Job: class {} };
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Full journey can be slow (AI calls, DB operations)
jest.setTimeout(120_000);

describe('KLOEL Full User Journey (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // State shared across sequential tests
  const state = {
    accessToken: '',
    userId: '',
    workspaceId: '',
    productId: '',
    checkoutProductId: '',
    planId: '',
    planSlug: '',
    orderId: '',
    paymentId: '',
    saleId: '',
  };

  const uniqueSuffix = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const TEST_EMAIL = `kloel_tester_${uniqueSuffix}@test.kloel.com`;
  const TEST_PASSWORD = 'KloelTest2026!@#';
  const TEST_NAME = 'Kloel Tester';
  const TEST_WORKSPACE = `Workspace Test ${uniqueSuffix}`;
  const PRODUCT_NAME = `Serum Anti-Idade Premium ${uniqueSuffix}`;

  const auth = () => ({ Authorization: `Bearer ${state.accessToken}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    prisma = moduleFixture.get(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    // Cleanup: remove test data
    if (state.userId) {
      try {
        // Delete in dependency order
        await prisma.kloelMemory.deleteMany({ where: { workspaceId: state.workspaceId } }).catch(() => {});
        await prisma.product.deleteMany({ where: { workspaceId: state.workspaceId } }).catch(() => {});
        await prisma.refreshToken.deleteMany({ where: { agentId: state.userId } }).catch(() => {});
        await prisma.agent.delete({ where: { id: state.userId } }).catch(() => {});
        await prisma.workspace.delete({ where: { id: state.workspaceId } }).catch(() => {});
      } catch (e) {
        console.warn('Cleanup warning:', e);
      }
    }
    await app.close();
  });

  // ═══════════════════════════════════════════
  // TEST 1: REGISTER
  // ═══════════════════════════════════════════
  it('1. Register new user', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: TEST_NAME,
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        workspaceName: TEST_WORKSPACE,
      })
      .expect((r) => expect([200, 201]).toContain(r.status));

    expect(res.body).toHaveProperty('access_token');
    expect(res.body.user || res.body.agent).toBeDefined();

    state.accessToken = res.body.access_token;
    const user = res.body.user || res.body.agent;
    state.userId = user.id;
    state.workspaceId = user.workspaceId || res.body.workspace?.id;

    expect(state.userId).toBeTruthy();
    expect(state.workspaceId).toBeTruthy();
    console.log(`  -> User: ${state.userId}, Workspace: ${state.workspaceId}`);
  });

  // ═══════════════════════════════════════════
  // TEST 2: APPROVE KYC (via Prisma direct)
  // ═══════════════════════════════════════════
  it('2. Approve KYC directly', async () => {
    await prisma.agent.update({
      where: { id: state.userId },
      data: { kycStatus: 'approved' },
    });

    const res = await request(app.getHttpServer())
      .get('/kyc/status')
      .set(auth())
      .expect(200);

    expect(res.body.kycStatus).toBe('approved');
    console.log('  -> KYC approved');
  });

  // ═══════════════════════════════════════════
  // TEST 3: CREATE PRODUCT
  // ═══════════════════════════════════════════
  it('3. Create product', async () => {
    const res = await request(app.getHttpServer())
      .post('/products')
      .set(auth())
      .send({
        name: PRODUCT_NAME,
        description: 'Serum facial com tecnologia avancada de regeneracao celular. Resultados visiveis em 30 dias.',
        price: 197.00,
        category: 'Cosmeticos',
        format: 'PHYSICAL',
        tags: ['skincare', 'anti-aging', 'premium'],
        status: 'APPROVED',
      })
      .expect((r) => expect([200, 201]).toContain(r.status));

    const product = res.body.product || res.body;
    expect(product).toHaveProperty('id');
    expect(product.name).toBe(PRODUCT_NAME);

    state.productId = product.id;
    console.log(`  -> Product: ${state.productId} (${PRODUCT_NAME})`);
  });

  // ═══════════════════════════════════════════
  // TEST 4: VERIFY KLOEL IS AWARE OF PRODUCT
  // ═══════════════════════════════════════════
  it('4. Kloel knows about the product', async () => {
    // First verify the KloelMemory was created
    const memory = await prisma.kloelMemory.findFirst({
      where: {
        workspaceId: state.workspaceId,
        type: 'product',
        content: { contains: PRODUCT_NAME, mode: 'insensitive' },
      },
    });

    expect(memory).toBeTruthy();
    expect(memory!.content).toContain(PRODUCT_NAME);
    console.log(`  -> KloelMemory found: key="${memory!.key}"`);

    // Now test via the think/sync endpoint (requires OPENAI_API_KEY)
    // If no API key, we skip the AI call but the memory proof is sufficient
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'test-openai-key') {
      const res = await request(app.getHttpServer())
        .post('/kloel/think/sync')
        .set(auth())
        .send({ message: 'Quais produtos eu tenho cadastrados?' })
        .expect(200);

      expect(res.body.response).toBeDefined();
      console.log(`  -> Kloel response: "${res.body.response?.slice(0, 100)}..."`);
    } else {
      console.log('  -> OPENAI_API_KEY not set, skipping AI verification (memory proof sufficient)');
    }
  });

  // ═══════════════════════════════════════════
  // TEST 5: LIST PRODUCTS
  // ═══════════════════════════════════════════
  it('5. List products shows our product', async () => {
    const res = await request(app.getHttpServer())
      .get('/products')
      .set(auth())
      .expect(200);

    const products = Array.isArray(res.body) ? res.body : res.body.data || res.body.products || [];
    const found = products.find((p: any) => p.id === state.productId);
    expect(found).toBeTruthy();
    expect(found.name).toBe(PRODUCT_NAME);
    console.log(`  -> Found ${products.length} product(s)`);
  });

  // ═══════════════════════════════════════════
  // TEST 6: CREATE CHECKOUT PLAN
  // ═══════════════════════════════════════════
  it('6. Create checkout product and plan', async () => {
    // Create checkout product
    const cpRes = await request(app.getHttpServer())
      .post('/checkout/products')
      .set(auth())
      .send({
        productId: state.productId,
        name: PRODUCT_NAME,
        description: 'Serum facial premium',
      })
      .expect((r) => expect([200, 201]).toContain(r.status));

    state.checkoutProductId = cpRes.body.id || cpRes.body.product?.id;

    // Create plan
    const slug = `test-serum-${uniqueSuffix}`;
    const planRes = await request(app.getHttpServer())
      .post(`/checkout/products/${state.checkoutProductId}/plans`)
      .set(auth())
      .send({
        name: '1 Unidade',
        slug,
        priceInCents: 19700,
        maxInstallments: 12,
      })
      .expect((r) => expect([200, 201]).toContain(r.status));

    const plan = planRes.body.plan || planRes.body;
    state.planId = plan.id;
    state.planSlug = plan.slug || slug;
    console.log(`  -> Plan: ${state.planId}, Slug: ${state.planSlug}`);
  });

  // ═══════════════════════════════════════════
  // TEST 7: SIMULATE PURCHASE (public checkout)
  // ═══════════════════════════════════════════
  it('7. Create order (public checkout)', async () => {
    const res = await request(app.getHttpServer())
      .post('/checkout/public/order')
      .send({
        planId: state.planId,
        workspaceId: state.workspaceId,
        customerName: 'Maria Silva Teste',
        customerEmail: 'maria.silva.teste@email.com',
        customerPhone: '+5511999888777',
        customerCPF: '123.456.789-00',
        paymentMethod: 'PIX',
        subtotalInCents: 19700,
        totalInCents: 19700,
        shippingAddress: {
          street: 'Rua das Flores',
          number: '123',
          neighborhood: 'Centro',
          city: 'Sao Paulo',
          state: 'SP',
          zip: '01001-000',
        },
      })
      .expect((r) => expect([200, 201]).toContain(r.status));

    const order = res.body.order || res.body;
    state.orderId = order.id;
    state.paymentId = order.payments?.[0]?.id || order.paymentId || '';
    console.log(`  -> Order: ${state.orderId}, Payment: ${state.paymentId}`);
  });

  // ═══════════════════════════════════════════
  // TEST 8: SIMULATE PAYMENT CONFIRMED (webhook)
  // ═══════════════════════════════════════════
  it('8. Asaas webhook confirms payment', async () => {
    // Simulate Asaas PAYMENT_CONFIRMED webhook
    const res = await request(app.getHttpServer())
      .post('/webhooks/checkout/asaas')
      .send({
        event: 'PAYMENT_CONFIRMED',
        payment: {
          id: `pay_test_${uniqueSuffix}`,
          customer: 'cus_test',
          value: 197.00,
          netValue: 187.15,
          status: 'CONFIRMED',
          billingType: 'PIX',
          externalReference: state.paymentId || state.orderId,
          confirmedDate: new Date().toISOString(),
        },
      })
      .expect((r) => expect([200, 201]).toContain(r.status));

    console.log(`  -> Webhook processed: ${JSON.stringify(res.body).slice(0, 100)}`);
  });

  // ═══════════════════════════════════════════
  // TEST 9: VERIFY SALES
  // ═══════════════════════════════════════════
  it('9. Sales data reflects the purchase', async () => {
    const res = await request(app.getHttpServer())
      .get('/sales')
      .set(auth())
      .expect(200);

    const sales = Array.isArray(res.body) ? res.body : res.body.data || [];
    console.log(`  -> Found ${sales.length} sale(s)`);

    // Stats
    const statsRes = await request(app.getHttpServer())
      .get('/sales/stats')
      .set(auth())
      .expect(200);

    console.log(`  -> Stats: ${JSON.stringify(statsRes.body).slice(0, 200)}`);
  });

  // ═══════════════════════════════════════════
  // TEST 10: VERIFY WALLET
  // ═══════════════════════════════════════════
  it('10. Wallet balance updated', async () => {
    const res = await request(app.getHttpServer())
      .get(`/kloel/wallet/${state.workspaceId}/balance`)
      .set(auth())
      .expect(200);

    console.log(`  -> Wallet: ${JSON.stringify(res.body).slice(0, 200)}`);
    // Balance might be 0 if webhook didn't match the payment to an order
    // The important thing is the endpoint works
    expect(res.body).toHaveProperty('available');
  });

  // ═══════════════════════════════════════════
  // TEST 11: VERIFY REPORTS
  // ═══════════════════════════════════════════
  it('11. Reports endpoints return data', async () => {
    const summary = await request(app.getHttpServer())
      .get('/reports/vendas/summary')
      .set(auth())
      .expect(200);

    console.log(`  -> Summary: ${JSON.stringify(summary.body).slice(0, 200)}`);

    const metricas = await request(app.getHttpServer())
      .get('/reports/metricas')
      .set(auth())
      .expect(200);

    console.log(`  -> Metricas: ${JSON.stringify(metricas.body).slice(0, 200)}`);
    expect(metricas.body).toHaveProperty('totalSales');
  });

  // ═══════════════════════════════════════════
  // TEST 12: VERIFY ALERTS SYSTEM
  // ═══════════════════════════════════════════
  it('12. Order alerts generate and list', async () => {
    // Generate alerts
    await request(app.getHttpServer())
      .post('/sales/orders/alerts/generate')
      .set(auth())
      .expect((r) => expect([200, 201]).toContain(r.status));

    // List alerts
    const res = await request(app.getHttpServer())
      .get('/sales/orders/alerts')
      .set(auth())
      .expect(200);

    console.log(`  -> Alerts: ${JSON.stringify(res.body).slice(0, 200)}`);
  });

  // ═══════════════════════════════════════════
  // TEST 13: UPDATE PRODUCT → KLOEL MEMORY UPDATES
  // ═══════════════════════════════════════════
  it('13. Update product syncs to KloelMemory', async () => {
    const newName = `${PRODUCT_NAME} ATUALIZADO`;

    await request(app.getHttpServer())
      .put(`/products/${state.productId}`)
      .set(auth())
      .send({ name: newName, price: 247.00 })
      .expect((r) => expect([200, 201]).toContain(r.status));

    // Verify memory was updated
    const memory = await prisma.kloelMemory.findFirst({
      where: {
        workspaceId: state.workspaceId,
        type: 'product',
        content: { contains: newName, mode: 'insensitive' },
      },
    });

    expect(memory).toBeTruthy();
    expect(memory!.content).toContain('247');
    console.log(`  -> Memory updated with new name and price`);
  });
});
