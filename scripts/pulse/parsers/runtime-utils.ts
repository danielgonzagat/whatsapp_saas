import { createHmac } from 'crypto';

export interface RuntimeHttpResponse {
  body: unknown;
  ok: boolean;
  status: number;
}

export interface RuntimeHttpOptions {
  jwt?: string | null;
}

type RuntimeHttpMethod = 'DELETE' | 'GET' | 'POST';

export function isDeepMode(): boolean {
  return process.env.PULSE_DEEP === 'true' || process.env.PULSE_DEEP === '1';
}

export function getBackendUrl(): string {
  return process.env.PULSE_BACKEND_URL || 'http://127.0.0.1:4000';
}

function trustedBackendBaseUrl(): URL {
  const url = new URL(getBackendUrl());
  const trustedHosts = new Set(['127.0.0.1', 'localhost', 'api.kloel.com']);
  if (!trustedHosts.has(url.hostname)) {
    throw new Error('PULSE backend URL host is not trusted for runtime probes.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('PULSE backend URL protocol is not supported for runtime probes.');
  }
  return url;
}

function toRuntimeUrl(path: string): URL {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\0')) {
    throw new Error('Runtime HTTP path must be a local absolute path.');
  }
  return new URL(path, trustedBackendBaseUrl());
}

function assertProductId(productId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(productId)) {
    throw new Error('Runtime product id contains unsafe characters.');
  }
  return productId;
}

function headers(options?: RuntimeHttpOptions): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(options?.jwt ? { authorization: `Bearer ${options.jwt}` } : {}),
  };
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function fetchRuntime(
  method: RuntimeHttpMethod,
  path: '/products' | `/products/${string}`,
  body: unknown,
  options?: RuntimeHttpOptions,
): Promise<RuntimeHttpResponse> {
  const url = toRuntimeUrl(path);
  const response = await fetch(url.toString(), {
    method,
    headers: headers(options),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    body: await parseBody(response),
    ok: response.ok,
    status: response.status,
  };
}

export function httpGetProducts(options?: RuntimeHttpOptions): Promise<RuntimeHttpResponse> {
  return fetchRuntime('GET', '/products', undefined, options);
}

export function httpGetProduct(
  productId: string,
  options?: RuntimeHttpOptions,
): Promise<RuntimeHttpResponse> {
  return fetchRuntime('GET', `/products/${assertProductId(productId)}`, undefined, options);
}

export function httpPostProduct(
  body: unknown,
  options?: RuntimeHttpOptions,
): Promise<RuntimeHttpResponse> {
  return fetchRuntime('POST', '/products', body, options);
}

export function httpDeleteProduct(
  productId: string,
  options?: RuntimeHttpOptions,
): Promise<RuntimeHttpResponse> {
  return fetchRuntime('DELETE', `/products/${assertProductId(productId)}`, undefined, options);
}

export function makeTestJwt(payload: Record<string, unknown>): string {
  const secret = process.env.JWT_SECRET || process.env.PULSE_TEST_JWT_SECRET || 'pulse-local-test';
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(
    JSON.stringify({
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...payload,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${header}.${claims}`).digest('base64url');
  return `${header}.${claims}.${signature}`;
}

export async function dbQuery<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for PULSE runtime DB queries.');
  }

  const pg = (await import('pg')) as unknown as {
    Client: new (config: { connectionString: string }) => {
      connect(): Promise<void>;
      end(): Promise<void>;
      query(queryText: string, values?: unknown[]): Promise<{ rows: T[] }>;
    };
  };
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    await client.end();
  }
}
