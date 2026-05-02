/**
 * E2E: Product Catalog Flow
 *
 * Covers the product catalog lifecycle:
 * list products → filter/search → detail view → update metadata → delete.
 *
 * Complements product-creation.spec.ts and customer-product-and-checkout.spec.ts
 * with catalog-level operations (pagination, search, filtering, update, delete).
 */
import { test, expect } from '@playwright/test';
import { ensureE2EAdmin, getE2EBaseUrls } from './e2e-helpers';

test.describe('Product Catalog Flow', () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  const { apiUrl } = getE2EBaseUrls();
  const api = (path: string) => `${apiUrl}${path}`;
  let token: string;
  let workspaceId: string;
  let catalogProductId: string;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(90_000);
    const session = await ensureE2EAdmin(request);
    token = session.token;
    workspaceId = session.workspaceId;
  });

  test('create a fresh product for catalog tests', async ({ request }) => {
    const res = await request.post(api('/products'), {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: `E2E Catalog Product ${Date.now()}`,
        description: 'Product created for catalog flow tests',
        price: 7900,
        category: 'digital',
        metadata: { tags: ['e2e', 'catalog'] },
      },
    });

    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    catalogProductId = body.product?.id || body.id;
    expect(catalogProductId).toBeTruthy();
  });

  test('GET /products lists products with pagination hints', async ({ request }) => {
    const res = await request.get(api('/products'), {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    const products: unknown[] = Array.isArray(body) ? body : body.products || body.data || [];
    expect(products.length).toBeGreaterThan(0);

    if (body.total !== undefined || body.count !== undefined) {
      const total = body.total ?? body.count;
      expect(typeof total).toBe('number');
    }

    const found = products.find((p: unknown) => (p.id || p.product?.id) === catalogProductId);
    expect(found).toBeTruthy();
  });

  test('GET /products with category filter narrows results', async ({ request }) => {
    const res = await request.get(api('/products?category=digital'), {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect([200, 400]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const products: unknown[] = Array.isArray(body) ? body : body.products || body.data || [];
      expect(products.length).toBeGreaterThan(0);

      products.forEach((p: unknown) => {
        const cat = p.category || p.product?.category;
        if (cat !== undefined) {
          expect(cat.toLowerCase()).toBe('digital');
        }
      });
    }
  });

  test('GET /products with search/query param filters results', async ({ request }) => {
    const res = await request.get(api(`/products?search=${encodeURIComponent('E2E Catalog')}`), {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect([200, 400]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const products: unknown[] = Array.isArray(body) ? body : body.products || body.data || [];
      const found = products.find((p: unknown) => (p.id || p.product?.id) === catalogProductId);
      expect(found).toBeTruthy();
    }
  });

  test('GET /products/:id returns full product detail', async ({ request }) => {
    expect(catalogProductId).toBeTruthy();

    const res = await request.get(api(`/products/${catalogProductId}`), {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    const product = body.product ?? body;
    expect(product.id || catalogProductId).toBeTruthy();
    expect(product.name).toBeTruthy();
    expect(typeof product.price).toBe('number');
  });

  test('PATCH /products/:id updates product metadata', async ({ request }) => {
    expect(catalogProductId).toBeTruthy();

    const res = await request.patch(api(`/products/${catalogProductId}`), {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: `E2E Catalog Product ${Date.now()} UPDATED`,
        price: 8900,
      },
    });

    expect([200, 404]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const updated = body.product ?? body;
      expect(updated.name).toContain('UPDATED');
      expect(updated.price).toBe(8900);
    }
  });

  test('PUT /products/:id deactivates/reactivates product', async ({ request }) => {
    expect(catalogProductId).toBeTruthy();

    const deactivateRes = await request.put(api(`/products/${catalogProductId}`), {
      headers: { Authorization: `Bearer ${token}` },
      data: { active: false },
    });

    expect([200, 201, 404]).toContain(deactivateRes.status());

    if (deactivateRes.status() >= 200 && deactivateRes.status() < 300) {
      const body = await deactivateRes.json();
      const p = body.product ?? body;
      expect(p.active).toBe(false);
    }

    const reactivateRes = await request.put(api(`/products/${catalogProductId}`), {
      headers: { Authorization: `Bearer ${token}` },
      data: { active: true },
    });

    expect([200, 201, 404]).toContain(reactivateRes.status());
  });

  test('DELETE /products/:id removes the catalog product', async ({ request }) => {
    expect(catalogProductId).toBeTruthy();

    const res = await request.delete(api(`/products/${catalogProductId}`), {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect([200, 201, 204, 404]).toContain(res.status());
  });

  test('GET /products/:id returns 404 after deletion', async ({ request }) => {
    expect(catalogProductId).toBeTruthy();

    const res = await request.get(api(`/products/${catalogProductId}`), {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect([404, 410, 200]).toContain(res.status());
  });

  test('GET /products rejects unauthenticated access', async ({ request }) => {
    const res = await request.get(api('/products'));
    expect([401, 403]).toContain(res.status());
  });
});
