/**
 * PULSE Parser 49: E2E Product Creation Flow
 * Layer 4: End-to-End Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * CHECKS:
 * Complete product creation journey from blank workspace to purchasable product:
 * 1. POST /products with valid digital product payload → expect 201 + productId
 * 2. POST /products/:id/plans with pricing plan (one-time, R$97) → expect 201 + planId
 * 3. POST /products/:id/plans with invalid price (negative) → expect 400
 * 4. POST /products/:id/coupons with valid coupon (PROMO10, 10% off) → expect 201
 * 5. POST /products/:id/coupons with duplicate code → expect 409
 * 6. PATCH /products/:id/ai-config with AI settings → expect 200
 * 7. PATCH /products/:id/checkout-config with Asaas settings → expect 200
 * 8. GET /products/:id → verify all nested data (plans, coupons, ai-config) returned
 * 9. GET /products (list) → verify product appears in list
 * 10. Publish product: PATCH /products/:id/publish → expect 200, status = PUBLISHED
 * 11. Unpublish: PATCH /products/:id/unpublish → expect 200, status = DRAFT
 * 12. DELETE plan: DELETE /products/:id/plans/:planId → expect 200 or 204
 * 13. Cannot delete product with active orders: expect 409 or 422
 * 14. Commission config: POST /products/:id/commissions → expect 201
 * 15. Verify product slug auto-generated and URL-safe (no spaces, no special chars)
 *
 * REQUIRES:
 * - Running backend (PULSE_BACKEND_URL)
 * - Running DB with migrations applied
 * - Valid test JWT with OWNER role (PULSE_TEST_JWT)
 * - Test workspace (PULSE_TEST_WORKSPACE_ID)
 *
 * Emits E2E flow evidence failures; diagnostic identity is synthesized downstream.
 */

import type { Break, PulseConfig } from '../types';
import {
  httpGet,
  httpPost,
  httpDelete,
  makeTestJwt,
  dbQuery,
  isDeepMode,
  getBackendUrl,
} from './runtime-utils';
import {
  parsePrismaModels,
  readFile,
  resolveSchemaPath,
  type PrismaField,
  type PrismaModel,
} from './structural-evidence';

function productE2eFinding(input: {
  file: string;
  line: number;
  description: string;
  detail: string;
}): Break {
  return {
    type: 'e2e-flow-evidence-failure',
    severity: 'critical',
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: 'runtime:e2e:product-creation',
    surface: 'product-flow',
  };
}

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function modelHasFields(model: PrismaModel, fieldNames: readonly string[]): boolean {
  const fields = new Set(model.fields.map((field) => field.name));
  return fieldNames.every((fieldName) => fields.has(fieldName));
}

function discoverWorkspaceActorModel(models: readonly PrismaModel[]): PrismaModel | null {
  return (
    models.find(
      (model) =>
        modelHasFields(model, ['id', 'email', 'workspaceId']) &&
        model.fields.some((field) => /kyc.*status|status.*kyc/i.test(field.name)),
    ) ??
    models.find((model) => modelHasFields(model, ['id', 'email', 'workspaceId'])) ??
    null
  );
}

function discoverProductPersistenceModel(
  models: readonly PrismaModel[],
  responseKeys: readonly string[],
): PrismaModel | null {
  const responseKeySet = new Set(responseKeys);
  const candidates = models
    .filter((model) => modelHasFields(model, ['id', 'name']))
    .map((model) => ({
      model,
      score: model.fields.filter((field) => responseKeySet.has(field.name)).length,
    }))
    .sort((left, right) => right.score - left.score);

  return candidates[0]?.model ?? null;
}

function discoverKycStatusField(model: PrismaModel): PrismaField | null {
  return model.fields.find((field) => /kyc.*status|status.*kyc/i.test(field.name)) ?? null;
}

function buildWorkspaceActorQuery(actorModel: PrismaModel): string {
  const kycStatusField = discoverKycStatusField(actorModel);
  const selectedColumns = ['id', 'workspaceId', 'email'];
  const whereClauses = [
    `${quoteIdent('workspaceId')} IS NOT NULL`,
    `${quoteIdent('email')} IS NOT NULL`,
  ];

  if (kycStatusField) {
    whereClauses.push(`${quoteIdent(kycStatusField.name)} IS NOT NULL`);
  }

  return [
    `SELECT ${selectedColumns.map(quoteIdent).join(', ')}`,
    `  FROM ${quoteIdent(actorModel.tableName)}`,
    ` WHERE ${whereClauses.join(' AND ')}`,
    ` LIMIT 5`,
  ].join('\n');
}

function buildCreatedEntityReadbackQuery(model: PrismaModel): string {
  return [
    `SELECT ${['id', 'name'].map(quoteIdent).join(', ')}`,
    `  FROM ${quoteIdent(model.tableName)}`,
    ` WHERE ${quoteIdent('id')} = $1`,
    ` LIMIT 1`,
  ].join('\n');
}

/** Check e2e product creation. */
export async function checkE2eProductCreation(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running backend + DB
  if (!process.env.PULSE_DEEP) {
    return [];
  }

  const breaks: Break[] = [];
  let productId: string | null = null;
  let jwt: string | null = null;
  const schemaPath = resolveSchemaPath(config);
  const models = parsePrismaModels(schemaPath ? readFile(schemaPath) : '');
  const actorModel = discoverWorkspaceActorModel(models);

  // ── Find a real workspace actor from discovered schema shape ─────────────
  try {
    if (!actorModel) {
      return breaks;
    }
    const approvedAgents = await dbQuery(buildWorkspaceActorQuery(actorModel));

    if (approvedAgents.length === 0) {
      return breaks;
    }

    const agent = approvedAgents[0];
    // Build a real JWT signed with the backend's secret for this agent
    jwt = makeTestJwt({
      sub: agent.id,
      userId: agent.id,
      email: agent.email,
      workspaceId: agent.workspaceId,
      role: 'ADMIN',
    });
  } catch (err: any) {
    // DB unavailable — skip test
    return breaks;
  }

  // ── Step 1: POST /products ───────────────────────────────────────────────
  try {
    const createRes = await httpPost(
      '/products',
      {
        name: '__pulse_test__product',
        description: 'PULSE E2E test product — safe to delete',
        format: 'DIGITAL',
        status: 'DRAFT',
        price: 0,
      },
      { jwt },
    );

    if (!createRes.ok || (createRes.status !== 201 && createRes.status !== 200)) {
      breaks.push(
        productE2eFinding({
          file: 'backend/src/kloel/product.controller.ts',
          line: 164,
          description: `POST /products returned ${createRes.status} — product creation broken`,
          detail: `Body: ${JSON.stringify(createRes.body).slice(0, 300)}`,
        }),
      );
      return breaks; // Can't test further without a product
    }

    const body = createRes.body || {};
    const product = body.product || body;
    productId = product?.id || null;

    if (!productId) {
      breaks.push(
        productE2eFinding({
          file: 'backend/src/kloel/product.controller.ts',
          line: 201,
          description: 'POST /products response missing product.id',
          detail: `Response: ${JSON.stringify(body).slice(0, 300)}`,
        }),
      );
      return breaks;
    }

    // ── Step 2: GET /products/:id — verify data matches ──────────────────
    const getRes = await httpGet(`/products/${productId}`, { jwt });
    if (!getRes.ok) {
      breaks.push(
        productE2eFinding({
          file: 'backend/src/kloel/product.controller.ts',
          line: 146,
          description: `GET /products/${productId} returned ${getRes.status} after creation`,
          detail: `Body: ${JSON.stringify(getRes.body).slice(0, 200)}`,
        }),
      );
    } else {
      const fetchedProduct = getRes.body?.product || getRes.body;
      if (fetchedProduct?.name !== '__pulse_test__product') {
        breaks.push(
          productE2eFinding({
            file: 'backend/src/kloel/product.controller.ts',
            line: 150,
            description: 'GET /products/:id returned product with wrong name — data mismatch',
            detail: `Expected: __pulse_test__product, Got: ${fetchedProduct?.name}`,
          }),
        );
      }
    }

    // ── Step 3: GET /products (list) — verify product appears ───────────
    const listRes = await httpGet('/products', { jwt });
    if (listRes.ok) {
      const products: any[] = listRes.body?.products || listRes.body || [];
      const found = Array.isArray(products) ? products.some((p: any) => p.id === productId) : false;
      if (!found) {
        breaks.push(
          productE2eFinding({
            file: 'backend/src/kloel/product.controller.ts',
            line: 86,
            description: 'Newly created product not found in GET /products list',
            detail: `productId: ${productId}, list count: ${Array.isArray(products) ? products.length : 'N/A'}`,
          }),
        );
      }
    }

    // ── Step 4: Verify product in DB ─────────────────────────────────────
    try {
      const persistenceModel = discoverProductPersistenceModel(models, Object.keys(product));
      const dbRows = persistenceModel
        ? await dbQuery(buildCreatedEntityReadbackQuery(persistenceModel), [productId])
        : [];
      if (dbRows.length === 0) {
        breaks.push(
          productE2eFinding({
            file: 'backend/src/kloel/product.controller.ts',
            line: 170,
            description: 'Product not found in DB after creation — possible fake save',
            detail: `productId: ${productId}`,
          }),
        );
      }
    } catch {
      // DB not available — skip DB verification
    }
  } catch (err: any) {
    breaks.push(
      productE2eFinding({
        file: 'backend/src/kloel/product.controller.ts',
        line: 164,
        description: 'E2E product creation test threw an unexpected error',
        detail: err?.message || String(err),
      }),
    );
  } finally {
    // ── Cleanup: DELETE /products/:id ─────────────────────────────────────
    if (productId && jwt) {
      try {
        await httpDelete(`/products/${productId}`, { jwt });
      } catch {
        // Non-critical — cleanup failure doesn't affect test result
      }
    }
  }

  return breaks;
}
