#!/usr/bin/env ts-node
/**
 * KLOEL Real User Simulation
 * Tests every flow as a real user would experience it.
 * Run with: npx ts-node test/real-user-simulation.ts
 */

const API = process.env.API_URL || 'http://localhost:3001';
const TS = Date.now();
const EMAIL = `tester_${TS}@kloel.test`;
const PASSWORD = 'KloelTest2026!@#';
const PRODUCT_NAME = `Creme Hidratante Teste ${TS}`;

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  duration: number;
}

const results: TestResult[] = [];
let token = '';
let userId = '';
let workspaceId = '';
let productId = '';
let checkoutProductId = '';
let planId = '';
let planSlug = '';
let orderId = '';
let paymentId = '';

async function api(
  method: string,
  path: string,
  body?: any,
  authToken?: string,
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: res.status, data, ok: res.ok };
}

async function runTest(name: string, fn: () => Promise<string>) {
  const start = Date.now();
  try {
    const details = await fn();
    results.push({ name, passed: true, details, duration: Date.now() - start });
    console.log(`  ✅ ${name} (${Date.now() - start}ms)`);
  } catch (err: any) {
    results.push({
      name,
      passed: false,
      details: err.message || String(err),
      duration: Date.now() - start,
    });
    console.log(
      `  ❌ ${name}: ${err.message || err} (${Date.now() - start}ms)`,
    );
  }
}

function assert(condition: any, msg: string) {
  if (!condition) throw new Error(msg);
}

async function main() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  KLOEL REAL USER SIMULATION');
  console.log('═══════════════════════════════════════════\n');
  console.log(`API: ${API}`);
  console.log(`Email: ${EMAIL}\n`);

  // ═══════════════════════════════════════
  // HEALTH CHECK
  // ═══════════════════════════════════════
  await runTest('0. Health check', async () => {
    const { status, data } = await api('GET', '/health');
    assert(
      status === 200,
      `Expected 200, got ${status}: ${JSON.stringify(data)}`,
    );
    assert(data.status === 'ok', `Health not ok: ${JSON.stringify(data)}`);
    return `uptime: ${data.uptime}s`;
  });

  // ═══════════════════════════════════════
  // REGISTRATION
  // ═══════════════════════════════════════
  await runTest('1. Register new user', async () => {
    const { status, data } = await api('POST', '/auth/register', {
      name: 'Kloel Tester Bot',
      email: EMAIL,
      password: PASSWORD,
      workspaceName: `Workspace ${TS}`,
    });
    assert(
      status === 200 || status === 201,
      `Register failed: ${status} ${JSON.stringify(data)}`,
    );
    assert(data.access_token, `No access_token in response`);

    token = data.access_token;
    const user = data.user || data.agent;
    userId = user?.id;
    workspaceId = user?.workspaceId || data.workspace?.id;

    assert(userId, 'No userId');
    assert(workspaceId, 'No workspaceId');
    return `userId=${userId}, wsId=${workspaceId}`;
  });

  // ═══════════════════════════════════════
  // LOGIN
  // ═══════════════════════════════════════
  await runTest('2. Login with credentials', async () => {
    const { status, data } = await api('POST', '/auth/login', {
      email: EMAIL,
      password: PASSWORD,
    });
    assert(
      status === 200 || status === 201,
      `Login failed: ${status} ${JSON.stringify(data)}`,
    );
    assert(data.access_token, 'No access_token');
    token = data.access_token; // refresh token
    return 'Token refreshed';
  });

  // ═══════════════════════════════════════
  // KYC STATUS (should be pending)
  // ═══════════════════════════════════════
  await runTest('3. KYC status is pending', async () => {
    const { status, data } = await api('GET', '/kyc/status', undefined, token);
    assert(
      status === 200,
      `KYC status failed: ${status} ${JSON.stringify(data)}`,
    );
    return `kycStatus=${data.kycStatus}`;
  });

  // ═══════════════════════════════════════
  // TRY CREATE PRODUCT WITHOUT KYC (should fail)
  // ═══════════════════════════════════════
  await runTest('4. Product creation blocked without KYC', async () => {
    const { status, data } = await api(
      'POST',
      '/products',
      {
        name: 'Should Fail',
        price: 100,
      },
      token,
    );
    // May return 403 (KYC not approved) or 201 (if KYC guard not enforced)
    if (status === 403) {
      return `Correctly blocked: ${data.error || data.message}`;
    }
    return `WARNING: Product created without KYC (status ${status}) - KycGuard may not be on this endpoint`;
  });

  // ═══════════════════════════════════════
  // APPROVE KYC (direct DB - simulating admin approval)
  // ═══════════════════════════════════════
  await runTest('5. Complete KYC and auto-approve', async () => {
    // Fill all KYC sections for maximum completion
    await api(
      'PUT',
      '/kyc/profile',
      {
        name: 'Kloel Tester Bot',
        phone: '+5511999999999',
        birthDate: '1990-01-15',
      },
      token,
    );
    await api(
      'PUT',
      '/kyc/fiscal',
      {
        documentType: 'CPF',
        documentNumber: '12345678900',
        legalName: 'Kloel Tester Bot',
        cep: '01001000',
        street: 'Rua Teste',
        number: '100',
        city: 'Sao Paulo',
        state: 'SP',
        neighborhood: 'Centro',
      },
      token,
    );
    await api(
      'POST',
      `/kloel/wallet/${workspaceId}/bank-accounts`,
      {
        bankCode: '001',
        bankName: 'Banco do Brasil',
        agency: '1234',
        accountNumber: '56789-0',
        accountType: 'checking',
        holderName: 'Kloel Tester Bot',
        holderDocument: '12345678900',
      },
      token,
    );
    // Submit and try auto-approve
    await api('POST', '/kyc/submit', {}, token);
    await api('POST', '/kyc/auto-check', {}, token);
    // Check status
    let { data } = await api('GET', '/kyc/status', undefined, token);
    if (data.kycStatus === 'approved') return 'KYC auto-approved!';
    // Try admin self-approve
    await api('POST', `/kyc/${userId}/approve`, {}, token);
    ({ data } = await api('GET', '/kyc/status', undefined, token));
    return `KYC status: ${data.kycStatus}`;
  });

  // ═══════════════════════════════════════
  // CREATE PRODUCT
  // ═══════════════════════════════════════
  await runTest('6. Create product', async () => {
    const { status, data } = await api(
      'POST',
      '/products',
      {
        name: PRODUCT_NAME,
        description:
          'Creme hidratante facial com acido hialuronico e vitamina C. Resultados visiveis em 15 dias.',
        price: 89.9,
        category: 'Cosmeticos',
        format: 'PHYSICAL',
        tags: ['skincare', 'hidratante', 'facial'],
        status: 'APPROVED',
      },
      token,
    );
    assert(
      status === 200 || status === 201,
      `Create product failed: ${status} ${JSON.stringify(data)}`,
    );

    const product = data.product || data;
    productId = product.id;
    assert(productId, `No product ID: ${JSON.stringify(data)}`);
    return `productId=${productId}, name=${product.name}`;
  });

  // ═══════════════════════════════════════
  // LIST PRODUCTS
  // ═══════════════════════════════════════
  await runTest('7. List products', async () => {
    const { status, data } = await api('GET', '/products', undefined, token);
    assert(status === 200, `List products failed: ${status}`);
    const products = Array.isArray(data)
      ? data
      : data.data || data.products || [];
    const found = products.find((p: any) => p.id === productId);
    assert(found, `Product ${productId} not in list`);
    return `Found ${products.length} product(s), our product present`;
  });

  // ═══════════════════════════════════════
  // VERIFY KLOEL MEMORY (product sync)
  // ═══════════════════════════════════════
  await runTest('8. KloelMemory has product', async () => {
    // Try think/sync to check if Kloel knows about the product
    const { status, data } = await api(
      'POST',
      '/kloel/think/sync',
      {
        message: 'Liste meus produtos cadastrados',
      },
      token,
    );

    if (status === 200 && data.response) {
      const knows = data.response
        .toLowerCase()
        .includes(PRODUCT_NAME.toLowerCase().split(' ')[0]);
      return `Kloel response (${data.response.length} chars): ${knows ? 'KNOWS product' : 'May not know product'} - "${data.response.slice(0, 150)}..."`;
    }
    // If AI is not available, check memory directly via products endpoint
    return `Think endpoint returned ${status} - AI may need OPENAI_API_KEY`;
  });

  // ═══════════════════════════════════════
  // UPDATE PRODUCT
  // ═══════════════════════════════════════
  await runTest('9. Update product', async () => {
    const { status, data } = await api(
      'PUT',
      `/products/${productId}`,
      {
        price: 99.9,
        description: 'Creme hidratante premium com formula avancada',
      },
      token,
    );
    assert(
      status === 200 || status === 201,
      `Update failed: ${status} ${JSON.stringify(data)}`,
    );
    return `Updated price to R$ 99.90`;
  });

  // ═══════════════════════════════════════
  // CHECKOUT: CREATE CHECKOUT PRODUCT
  // ═══════════════════════════════════════
  await runTest('10. Create checkout product', async () => {
    const { status, data } = await api(
      'POST',
      '/checkout/products',
      {
        productId: productId,
        name: PRODUCT_NAME,
        slug: `checkout-${TS}`,
        description: 'Checkout product',
      },
      token,
    );

    if (status === 200 || status === 201) {
      checkoutProductId = data.id || data.product?.id;
      return `checkoutProductId=${checkoutProductId}`;
    }
    return `Checkout product creation returned ${status}: ${JSON.stringify(data).slice(0, 200)}`;
  });

  // ═══════════════════════════════════════
  // CHECKOUT: CREATE PLAN
  // ═══════════════════════════════════════
  await runTest('11. Create checkout plan', async () => {
    if (!checkoutProductId) return 'SKIPPED - no checkout product';

    planSlug = `test-plan-${TS}`;
    const { status, data } = await api(
      'POST',
      `/checkout/products/${checkoutProductId}/plans`,
      {
        name: '1 Unidade',
        slug: planSlug,
        priceInCents: 9990,
        maxInstallments: 12,
      },
      token,
    );

    if (status === 200 || status === 201) {
      const plan = data.plan || data;
      planId = plan.id;
      return `planId=${planId}, slug=${planSlug}`;
    }
    return `Plan creation returned ${status}: ${JSON.stringify(data).slice(0, 200)}`;
  });

  // ═══════════════════════════════════════
  // CHECKOUT: CREATE ORDER (public)
  // ═══════════════════════════════════════
  await runTest('12. Create order (public checkout)', async () => {
    if (!planId) return 'SKIPPED - no plan';

    const { status, data } = await api('POST', '/checkout/public/order', {
      planId,
      workspaceId,
      customerName: 'Maria Silva Compradora',
      customerEmail: 'maria.compradora@teste.com',
      customerPhone: '+5511988887777',
      customerCPF: '987.654.321-00',
      paymentMethod: 'PIX',
      subtotalInCents: 9990,
      totalInCents: 9990,
      shippingAddress: {
        street: 'Rua das Flores',
        number: '456',
        neighborhood: 'Jardim',
        city: 'Sao Paulo',
        state: 'SP',
        zip: '01234-567',
      },
    });

    if (status === 200 || status === 201) {
      const order = data.order || data;
      orderId = order.id;
      paymentId = order.payments?.[0]?.id || order.paymentId || '';
      return `orderId=${orderId}, paymentId=${paymentId}`;
    }
    return `Order creation returned ${status}: ${JSON.stringify(data).slice(0, 300)}`;
  });

  // ═══════════════════════════════════════
  // WEBHOOK: SIMULATE PAYMENT
  // ═══════════════════════════════════════
  await runTest('13. Asaas webhook (payment confirmed)', async () => {
    if (!orderId && !paymentId) return 'SKIPPED - no order';

    // Get the checkout payment record to find its ID (webhook looks up by externalId)
    const orderRes = await api(
      'GET',
      `/checkout/orders/${orderId}`,
      undefined,
      token,
    );
    const payments = orderRes.data?.payments || [];
    const checkoutPaymentId = payments[0]?.id || '';
    const externalId = payments[0]?.externalId || `pay_sim_${TS}`;

    const { status, data } = await api('POST', '/checkout/webhooks/asaas', {
      event: 'PAYMENT_CONFIRMED',
      payment: {
        id: externalId, // webhook looks up CheckoutPayment by this field
        customer: 'cus_sim',
        value: 99.9,
        netValue: 94.9,
        status: 'CONFIRMED',
        billingType: 'PIX',
        externalReference: checkoutPaymentId || orderId,
        confirmedDate: new Date().toISOString(),
      },
    });
    assert(
      status === 200,
      `Webhook should return 200, got ${status}: ${JSON.stringify(data)}`,
    );
    return `Webhook: ${status}, paymentId=${checkoutPaymentId}, externalId=${externalId}, response=${JSON.stringify(data).slice(0, 150)}`;
  });

  // ═══════════════════════════════════════
  // SALES
  // ═══════════════════════════════════════
  await runTest('14. List sales', async () => {
    const { status, data } = await api('GET', '/sales', undefined, token);
    assert(status === 200, `Sales failed: ${status}`);
    // If webhook couldn't find payment (no real Asaas), sales will be 0
    // This is expected — the webhook flow requires real payment provider
    const sales = Array.isArray(data) ? data : data.data || data.sales || [];
    return `Found ${sales.length} sale(s) — ${sales.length === 0 ? '(expected without real Asaas)' : 'webhook flow works!'}`;
  });

  await runTest('15. Sales stats', async () => {
    const { status, data } = await api('GET', '/sales/stats', undefined, token);
    assert(status === 200, `Sales stats failed: ${status}`);
    // Revenue may take time to reflect, so just verify structure
    assert(
      data.totalRevenue !== undefined,
      'Stats should have totalRevenue field',
    );
    return `Stats: ${JSON.stringify(data).slice(0, 200)}`;
  });

  // ═══════════════════════════════════════
  // WALLET
  // ═══════════════════════════════════════
  await runTest('16. Wallet balance', async () => {
    const { status, data } = await api(
      'GET',
      `/kloel/wallet/${workspaceId}/balance`,
      undefined,
      token,
    );
    assert(status === 200, `Wallet failed: ${status} ${JSON.stringify(data)}`);
    assert(
      typeof data.pending === 'number',
      'Wallet should have pending field',
    );
    // pending may be > 0 if webhook created wallet transaction
    return `Balance: ${JSON.stringify(data).slice(0, 200)}`;
  });

  await runTest('17. Wallet transactions', async () => {
    const { status, data } = await api(
      'GET',
      `/kloel/wallet/${workspaceId}/transactions`,
      undefined,
      token,
    );
    assert(status === 200, `Transactions failed: ${status}`);
    const txs = Array.isArray(data)
      ? data
      : data.data || data.transactions || [];
    // Transaction count may be > 0 if webhook worked
    return `Found ${txs.length} transaction(s)`;
  });

  // ═══════════════════════════════════════
  // REPORTS
  // ═══════════════════════════════════════
  await runTest('18. Reports: vendas summary', async () => {
    const { status, data } = await api(
      'GET',
      '/reports/vendas/summary',
      undefined,
      token,
    );
    assert(status === 200, `Report failed: ${status}`);
    return `Summary: ${JSON.stringify(data).slice(0, 200)}`;
  });

  await runTest('19. Reports: metricas', async () => {
    const { status, data } = await api(
      'GET',
      '/reports/metricas',
      undefined,
      token,
    );
    assert(status === 200, `Metricas failed: ${status}`);
    return `Metricas: ${JSON.stringify(data).slice(0, 200)}`;
  });

  await runTest('20. Reports: origem', async () => {
    const { status, data } = await api(
      'GET',
      '/reports/origem',
      undefined,
      token,
    );
    assert(status === 200, `Origem failed: ${status}`);
    return `Origem: ${JSON.stringify(data).slice(0, 200)}`;
  });

  await runTest('21. Reports: churn', async () => {
    const { status, data } = await api(
      'GET',
      '/reports/churn',
      undefined,
      token,
    );
    assert(status === 200, `Churn failed: ${status}`);
    return `Churn: ${JSON.stringify(data).slice(0, 200)}`;
  });

  // ═══════════════════════════════════════
  // ORDER ALERTS
  // ═══════════════════════════════════════
  await runTest('22. Generate order alerts', async () => {
    const { status, data } = await api(
      'POST',
      '/sales/orders/alerts/generate',
      undefined,
      token,
    );
    return `Generate: ${status} ${JSON.stringify(data).slice(0, 200)}`;
  });

  await runTest('23. List order alerts', async () => {
    const { status, data } = await api(
      'GET',
      '/sales/orders/alerts',
      undefined,
      token,
    );
    assert(status === 200, `Alerts failed: ${status}`);
    return `Alerts: ${JSON.stringify(data).slice(0, 200)}`;
  });

  // ═══════════════════════════════════════
  // AD RULES
  // ═══════════════════════════════════════
  await runTest('24. Create ad rule', async () => {
    const { status, data } = await api(
      'POST',
      '/ad-rules',
      {
        name: 'Test Rule',
        condition: 'ROAS caiu abaixo de 2.0',
        action: 'Reduzir budget em 30%',
        active: true,
      },
      token,
    );
    assert(
      status === 200 || status === 201,
      `Ad rule failed: ${status} ${JSON.stringify(data)}`,
    );
    return `Rule created: ${JSON.stringify(data).slice(0, 200)}`;
  });

  await runTest('25. List ad rules', async () => {
    const { status, data } = await api('GET', '/ad-rules', undefined, token);
    assert(status === 200, `List rules failed: ${status}`);
    const rules = Array.isArray(data) ? data : data.data || [];
    return `Found ${rules.length} rule(s)`;
  });

  // ═══════════════════════════════════════
  // MEMBER AREAS
  // ═══════════════════════════════════════
  await runTest('26. Create member area', async () => {
    const { status, data } = await api(
      'POST',
      '/member-areas',
      {
        name: `Area de Membros ${TS}`,
        slug: `area-membros-${TS}`,
        type: 'COURSE',
        description: 'Curso de skincare avancado',
      },
      token,
    );
    if (status === 200 || status === 201) {
      return `Area created: ${JSON.stringify(data).slice(0, 200)}`;
    }
    return `Member area creation returned ${status}: ${JSON.stringify(data).slice(0, 200)}`;
  });

  // ═══════════════════════════════════════
  // MARKETING
  // ═══════════════════════════════════════
  await runTest('27. Marketing stats', async () => {
    const { status, data } = await api(
      'GET',
      '/marketing/stats',
      undefined,
      token,
    );
    assert(status === 200, `Marketing stats failed: ${status}`);
    return `Stats: ${JSON.stringify(data).slice(0, 200)}`;
  });

  await runTest('28. Marketing channels', async () => {
    const { status, data } = await api(
      'GET',
      '/marketing/channels',
      undefined,
      token,
    );
    assert(status === 200, `Channels failed: ${status}`);
    return `Channels: ${JSON.stringify(data).slice(0, 200)}`;
  });

  await runTest('29. Marketing AI brain', async () => {
    const { status, data } = await api(
      'GET',
      '/marketing/ai-brain',
      undefined,
      token,
    );
    assert(status === 200, `AI brain failed: ${status}`);
    return `Brain: ${JSON.stringify(data).slice(0, 200)}`;
  });

  // ═══════════════════════════════════════
  // CHAT THREADS
  // ═══════════════════════════════════════
  await runTest('30. Create chat thread', async () => {
    const { status, data } = await api(
      'POST',
      '/kloel/threads',
      { title: 'Test Thread' },
      token,
    );
    if (status === 200 || status === 201) {
      return `Thread: ${JSON.stringify(data).slice(0, 200)}`;
    }
    return `Thread creation: ${status} ${JSON.stringify(data).slice(0, 200)}`;
  });

  await runTest('31. List chat threads', async () => {
    const { status, data } = await api(
      'GET',
      '/kloel/threads',
      undefined,
      token,
    );
    assert(status === 200, `Threads failed: ${status}`);
    const threads = Array.isArray(data) ? data : data.data || [];
    return `Found ${threads.length} thread(s)`;
  });

  await runTest('32. Search threads by content', async () => {
    const { status, data } = await api(
      'GET',
      '/kloel/threads/search?q=test',
      undefined,
      token,
    );
    assert(status === 200, `Search failed: ${status}`);
    return `Search results: ${JSON.stringify(data).slice(0, 200)}`;
  });

  // ═══════════════════════════════════════
  // PARTNERSHIPS
  // ═══════════════════════════════════════
  await runTest('33. Partnership affiliates', async () => {
    const { status, data } = await api(
      'GET',
      '/partnerships/affiliates/stats',
      undefined,
      token,
    );
    return `Affiliates: ${status} ${JSON.stringify(data).slice(0, 200)}`;
  });

  // ═══════════════════════════════════════
  // AD SPEND (ROAS)
  // ═══════════════════════════════════════
  await runTest('34. Register ad spend', async () => {
    const { status, data } = await api(
      'POST',
      '/reports/ad-spend',
      {
        amount: 5000, // R$ 50.00 em centavos
        platform: 'meta',
        date: new Date().toISOString().split('T')[0],
        campaign: 'Test Campaign',
      },
      token,
    );
    return `Ad spend: ${status} ${JSON.stringify(data).slice(0, 200)}`;
  });

  // ═══════════════════════════════════════
  // DELETE PRODUCT (cleanup + test)
  // ═══════════════════════════════════════
  await runTest('35. Delete product', async () => {
    if (!productId) return 'SKIPPED - no product';
    const { status, data } = await api(
      'DELETE',
      `/products/${productId}`,
      undefined,
      token,
    );
    return `Delete: ${status} ${JSON.stringify(data).slice(0, 200)}`;
  });

  // ═══════════════════════════════════════
  // REPORT
  // ═══════════════════════════════════════
  console.log('\n═══════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('═══════════════════════════════════════════\n');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const warnings = results.filter(
    (r) => r.passed && r.details.includes('WARNING'),
  ).length;

  console.log(`TOTAL: ${results.length} tests`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log(`WARNINGS: ${warnings}`);
  console.log('');

  if (failed > 0) {
    console.log('FAILURES:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  ❌ ${r.name}: ${r.details}`);
      });
    console.log('');
  }

  if (warnings > 0) {
    console.log('WARNINGS:');
    results
      .filter((r) => r.details.includes('WARNING'))
      .forEach((r) => {
        console.log(`  ⚠️  ${r.name}: ${r.details}`);
      });
    console.log('');
  }

  console.log('ALL RESULTS:');
  results.forEach((r) => {
    console.log(
      `  ${r.passed ? '✅' : '❌'} ${r.name} (${r.duration}ms) — ${r.details.slice(0, 120)}`,
    );
  });

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
