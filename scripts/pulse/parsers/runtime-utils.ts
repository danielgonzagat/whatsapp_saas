import * as crypto from 'node:crypto';

interface HttpResponse {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
}

function backendUrl(): string {
  return process.env.PULSE_BACKEND_URL ?? 'http://localhost:3000';
}

export async function httpGet(
  path: string,
  options: { jwt?: string | null },
): Promise<HttpResponse> {
  const url = `${backendUrl()}${path}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.jwt) headers.Authorization = `Bearer ${options.jwt}`;
  const res = await fetch(url, { method: 'GET', headers });
  const body = res.headers.get('content-type')?.includes('application/json')
    ? (await res.json()) as Record<string, unknown>
    : null;
  return { ok: res.ok, status: res.status, body };
}

export async function httpPost(
  path: string,
  data: Record<string, unknown>,
  options: { jwt?: string | null },
): Promise<HttpResponse> {
  const url = `${backendUrl()}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.jwt) headers.Authorization = `Bearer ${options.jwt}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  const body = res.headers.get('content-type')?.includes('application/json')
    ? (await res.json()) as Record<string, unknown>
    : null;
  return { ok: res.ok, status: res.status, body };
}

export async function httpDelete(
  path: string,
  options: { jwt?: string | null },
): Promise<HttpResponse> {
  const url = `${backendUrl()}${path}`;
  const headers: Record<string, string> = {};
  if (options.jwt) headers.Authorization = `Bearer ${options.jwt}`;
  const res = await fetch(url, { method: 'DELETE', headers });
  const body = res.headers.get('content-type')?.includes('application/json')
    ? (await res.json()) as Record<string, unknown>
    : null;
  return { ok: res.ok, status: res.status, body };
}

export async function httpGetProduct(
  productId: string,
  options: { jwt?: string | null },
): Promise<HttpResponse> {
  return httpGet(`/products/${productId}`, options);
}

export async function httpGetProducts(
  options: { jwt?: string | null },
): Promise<HttpResponse> {
  return httpGet('/products', options);
}

export async function httpPostProduct(
  data: Record<string, unknown>,
  options: { jwt?: string | null },
): Promise<HttpResponse> {
  return httpPost('/products', data, options);
}

export async function httpDeleteProduct(
  productId: string,
  options: { jwt?: string | null },
): Promise<HttpResponse> {
  return httpDelete(`/products/${productId}`, options);
}

interface JwtPayload {
  sub: string;
  userId: string;
  email: string;
  workspaceId: string;
  role: string;
}

export function makeTestJwt(payload: JwtPayload): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString('base64url');
  const secret = process.env.PULSE_TEST_JWT_SECRET ?? 'pulse-test-secret';
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

interface PgPool {
  query(sql: string, params?: Array<string | number>): Promise<{ rows: Array<Record<string, unknown>> }>;
  end(): Promise<void>;
}

function createPgPool(connectionString: string, max: number): PgPool {
  const pg = require('pg') as { Pool: new (config: Record<string, unknown>) => PgPool };
  return new pg.Pool({ connectionString, max });
}

export async function dbQuery(
  sql: string,
  params?: Array<string | number>,
): Promise<Array<Record<string, unknown>>> {
  const dbUrl = process.env.PULSE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!dbUrl) return [];
  try {
    const pool = createPgPool(dbUrl, 1);
    const result = await pool.query(sql, params ?? []);
    await pool.end();
    return result.rows;
  } catch {
    return [];
  }
}
