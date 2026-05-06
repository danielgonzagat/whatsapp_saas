import { test, expect } from '@playwright/test';
import { ensureE2EAdmin, getE2EBaseUrls } from './e2e-helpers';

/**
 * E2E: Product creation flow
 * Verifies that a product can be created via the API and retrieved.
 */

test.describe('Product Creation Flow', () => {
  // Cold-start auth bootstrap can exceed 30s on a fresh CI worker; widen
  // the budget for tests and the beforeAll hook.
  test.describe.configure({ timeout: 90_000 });

  let token: string;
  const { apiUrl } = getE2EBaseUrls();
  const api = (path: string) => `${apiUrl}${path}`;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(90_000);
    const session = await ensureE2EAdmin(request);
    token = session.token;
  });

  test('POST /products creates a new product', async ({ request }) => {
    const res = await request.post(api('/products'), {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: `E2E Test Product ${Date.now()}`,
        description: 'Produto criado pelo teste e2e',
        price: 9700,
        category: 'DIGITAL',
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    // Backend returns { product, success } envelope on /products POST.
    const created = body.product ?? body;
    expect(created.id).toBeTruthy();
    expect(created.name).toContain('E2E Test Product');
    expect(created.price).toBe(9700);

    // Verify retrieval
    const getRes = await request.get(api(`/products/${created.id}`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(getRes.status()).toBe(200);
    const fetched = await getRes.json();
    const product = fetched.product ?? fetched;
    expect(product.id).toBe(created.id);
  });

  test('POST /products rejects missing name', async ({ request }) => {
    const res = await request.post(api('/products'), {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        description: 'No name provided',
        price: 5000,
      },
    });

    // Should fail validation
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
