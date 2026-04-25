/**
 * PULSE Runtime Utilities
 * Shared helpers for DEEP/TOTAL mode parsers that need HTTP access or DB queries.
 *
 * Usage:
 *   import { getBackendUrl, httpGet, httpPost, makeTestJwt, dbQuery } from './runtime-utils';
 *
 * Environment variables (set via `.env.pulse.local`, `source scripts/railway-env.sh`, or manually):
 *   PULSE_BACKEND_URL — Override backend URL
 *   PULSE_DATABASE_URL — Override DB URL
 *   PULSE_JWT_SECRET — Override JWT secret
 *   PULSE_FRONTEND_URL — Override frontend URL
 *   PULSE_VERCEL_FRONTEND_URL — Stable Vercel URL when frontend lives outside localhost
 *   PULSE_RAILWAY_VARS_JSON — Explicit Railway vars snapshot JSON
 *   RAILWAY_PROJECT_TOKEN / RAILWAY_TOKEN — Token used with `railway variables --json`
 */

import { execFileSync } from 'child_process';

// ─── Cached Railway vars ────────────────────────────────────────────────────

type RailwayVarsSource = 'env-json' | 'railway-cli-token' | 'railway-cli' | 'none';

/** Pulse runtime resolution shape. */
export interface PulseRuntimeResolution {
  /** Backend url property. */
  backendUrl: string;
  /** Backend source property. */
  backendSource: string;
  /** Frontend url property. */
  frontendUrl: string;
  /** Frontend source property. */
  frontendSource: string;
  /** Db configured property. */
  dbConfigured: boolean;
  /** Db source property. */
  dbSource: string;
  /** Railway vars source property. */
  railwayVarsSource: RailwayVarsSource;
  /** Summary property. */
  summary: string;
}

let _railwayVars: Record<string, string> | null = null;
let _railwayVarsSource: RailwayVarsSource = 'none';

function normalizeUrl(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, '');
  }
  if (/^[\w.-]+\.vercel\.app$/i.test(trimmed) || /^[\w.-]+\.up\.railway\.app$/i.test(trimmed)) {
    return `https://${trimmed.replace(/\/$/, '')}`;
  }
  return trimmed.replace(/\/$/, '');
}

function parseRailwayVars(raw: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([, value]) => typeof value === 'string',
      ),
    ) as Record<string, string>;
  } catch {
    return null;
  }
}

function tryRailwayVariablesCli(token?: string): Record<string, string> | null {
  const serviceCandidates = [
    process.env.PULSE_RAILWAY_SERVICE,
    'whatsapp_saas Copy',
    'backend',
    'Backend',
  ].filter(Boolean) as string[];

  const commands: string[][] = [
    ['variables', '--json'],
    ...serviceCandidates.map((serviceName) => ['variables', '--json', '--service', serviceName]),
  ];

  for (const args of commands) {
    try {
      const out = execFileSync('railway', args, {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 12000,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...(token ? { RAILWAY_TOKEN: token } : {}),
        },
      });
      const parsed = parseRailwayVars(out);
      if (parsed) {
        return parsed;
      }
    } catch {
      continue;
    }
  }

  return null;
}

/** Get railway vars. */
export function getRailwayVars(): Record<string, string> {
  if (_railwayVars) {
    return _railwayVars;
  }

  const explicitJson = process.env.PULSE_RAILWAY_VARS_JSON;
  const parsedExplicit = explicitJson ? parseRailwayVars(explicitJson) : null;
  if (parsedExplicit) {
    _railwayVars = parsedExplicit;
    _railwayVarsSource = 'env-json';
    return _railwayVars;
  }

  const railwayToken = process.env.RAILWAY_PROJECT_TOKEN || process.env.RAILWAY_TOKEN;
  if (railwayToken) {
    const tokenVars = tryRailwayVariablesCli(railwayToken);
    if (tokenVars) {
      _railwayVars = tokenVars;
      _railwayVarsSource = 'railway-cli-token';
      return _railwayVars;
    }
  }

  const cliVars = tryRailwayVariablesCli();
  if (cliVars) {
    _railwayVars = cliVars;
    _railwayVarsSource = 'railway-cli';
    return _railwayVars;
  }

  _railwayVars = {};
  _railwayVarsSource = 'none';
  return _railwayVars;
}

function resolveFirstUrl(candidates: Array<[string | undefined | null, string]>): {
  url: string;
  source: string;
} {
  for (const [value, source] of candidates) {
    const normalized = normalizeUrl(value);
    if (normalized) {
      return { url: normalized, source };
    }
  }

  return { url: '', source: 'fallback' };
}

function resolveDbSource(candidates: Array<[string | undefined | null, string]>): {
  configured: boolean;
  source: string;
} {
  for (const [value, source] of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return { configured: true, source };
    }
  }

  return { configured: false, source: 'none' };
}

/** Get runtime resolution. */
export function getRuntimeResolution(): PulseRuntimeResolution {
  const vars = getRailwayVars();
  const backend = resolveFirstUrl([
    [process.env.PULSE_BACKEND_URL, 'env:PULSE_BACKEND_URL'],
    [process.env.E2E_API_URL, 'env:E2E_API_URL'],
    [process.env.BACKEND_URL, 'env:BACKEND_URL'],
    [process.env.API_URL, 'env:API_URL'],
    [process.env.NEXT_PUBLIC_API_URL, 'env:NEXT_PUBLIC_API_URL'],
    [vars.BACKEND_URL, `railway:${_railwayVarsSource}:BACKEND_URL`],
    [vars.API_URL, `railway:${_railwayVarsSource}:API_URL`],
    [vars.APP_URL, `railway:${_railwayVarsSource}:APP_URL`],
    [vars.NEXT_PUBLIC_API_URL, `railway:${_railwayVarsSource}:NEXT_PUBLIC_API_URL`],
    [
      vars.RAILWAY_PUBLIC_DOMAIN ? `https://${vars.RAILWAY_PUBLIC_DOMAIN}` : '',
      `railway:${_railwayVarsSource}:RAILWAY_PUBLIC_DOMAIN`,
    ],
  ]);
  const frontend = resolveFirstUrl([
    [process.env.PULSE_FRONTEND_URL, 'env:PULSE_FRONTEND_URL'],
    [process.env.E2E_FRONTEND_URL, 'env:E2E_FRONTEND_URL'],
    [process.env.PULSE_VERCEL_FRONTEND_URL, 'env:PULSE_VERCEL_FRONTEND_URL'],
    [process.env.VERCEL_PROJECT_PRODUCTION_URL, 'env:VERCEL_PROJECT_PRODUCTION_URL'],
    [process.env.VERCEL_BRANCH_URL, 'env:VERCEL_BRANCH_URL'],
    [process.env.VERCEL_URL, 'env:VERCEL_URL'],
    [vars.CORS_ORIGIN, `railway:${_railwayVarsSource}:CORS_ORIGIN`],
    [vars.FRONTEND_URL, `railway:${_railwayVarsSource}:FRONTEND_URL`],
    [vars.PUBLIC_URL, `railway:${_railwayVarsSource}:PUBLIC_URL`],
  ]);
  const db = resolveDbSource([
    [process.env.PULSE_DATABASE_URL, 'env:PULSE_DATABASE_URL'],
    [process.env.DATABASE_URL, 'env:DATABASE_URL'],
    [vars.DATABASE_URL, `railway:${_railwayVarsSource}:DATABASE_URL`],
  ]);

  return {
    backendUrl: backend.url || 'http://localhost:3001',
    backendSource: backend.url ? backend.source : 'fallback',
    frontendUrl: frontend.url || 'http://localhost:3000',
    frontendSource: frontend.url ? frontend.source : 'fallback',
    dbConfigured: db.configured,
    dbSource: db.source,
    railwayVarsSource: _railwayVarsSource,
    summary: `backend=${backend.url ? backend.source : 'fallback'} frontend=${frontend.url ? frontend.source : 'fallback'} railway=${_railwayVarsSource}`,
  };
}

// ─── Getters ────────────────────────────────────────────────────────────────

export function getBackendUrl(): string {
  return getRuntimeResolution().backendUrl;
}

/** Get frontend url. */
export function getFrontendUrl(): string {
  return getRuntimeResolution().frontendUrl;
}

/** Get db url. */
export function getDbUrl(): string {
  if (process.env.PULSE_DATABASE_URL) {
    return process.env.PULSE_DATABASE_URL;
  }
  const vars = getRailwayVars();
  return vars.DATABASE_URL || '';
}

/** Get jwt secret. */
export function getJwtSecret(): string {
  if (process.env.PULSE_JWT_SECRET) {
    return process.env.PULSE_JWT_SECRET;
  }
  const vars = getRailwayVars();
  return vars.JWT_SECRET || 'pulse-test-secret';
}

/** Get runtime internal token. */
export function getRuntimeInternalToken(): string {
  const vars = getRailwayVars();
  return (
    process.env.PULSE_RUNTIME_TOKEN ||
    process.env.INTERNAL_API_KEY ||
    process.env.METRICS_TOKEN ||
    process.env.WORKER_METRICS_TOKEN ||
    vars.PULSE_RUNTIME_TOKEN ||
    vars.INTERNAL_API_KEY ||
    vars.METRICS_TOKEN ||
    vars.WORKER_METRICS_TOKEN ||
    ''
  );
}

// ─── JWT Generation ─────────────────────────────────────────────────────────

export function makeTestJwt(payload: Record<string, any> = {}, expiresInSec = 3600): string {
  const crypto = require('crypto');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({
      sub: payload.userId || 'pulse-test-user',
      email: payload.email || 'pulse@test.kloel.com',
      workspaceId: payload.workspaceId || 'pulse-test-workspace',
      role: payload.role || 'ADMIN',
      iat: now,
      exp: now + expiresInSec,
      ...payload,
    }),
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

// ─── HTTP Client ────────────────────────────────────────────────────────────

interface HttpResponse {
  status: number;
  ok: boolean;
  body: any;
  headers: Record<string, string>;
  timeMs: number;
}

interface HttpOptions {
  jwt?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

/** Http get. */
export function httpGet(path: string, opts: HttpOptions = {}): Promise<HttpResponse> {
  return httpRequest('GET', path, undefined, opts);
}

/** Http post. */
export function httpPost(
  path: string,
  body?: unknown,
  opts: HttpOptions = {},
): Promise<HttpResponse> {
  return httpRequest('POST', path, body, opts);
}

/** Http put. */
export function httpPut(
  path: string,
  body?: unknown,
  opts: HttpOptions = {},
): Promise<HttpResponse> {
  return httpRequest('PUT', path, body, opts);
}

/** Http delete. */
export function httpDelete(path: string, opts: HttpOptions = {}): Promise<HttpResponse> {
  return httpRequest('DELETE', path, undefined, opts);
}

async function httpRequest(
  method: string,
  path: string,
  body?: unknown,
  opts: HttpOptions = {},
): Promise<HttpResponse> {
  const url = `${getBackendUrl()}${path}`;
  const timeout = opts.timeout || 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  if (opts.jwt) {
    headers['Authorization'] = `Bearer ${opts.jwt}`;
  }

  const start = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const timeMs = Date.now() - start;
    let responseBody: any;
    try {
      responseBody = await res.json();
    } catch {
      responseBody = null;
    }
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      resHeaders[k] = v;
    });
    return { status: res.status, ok: res.ok, body: responseBody, headers: resHeaders, timeMs };
  } catch (e: any) {
    return {
      status: 0,
      ok: false,
      body: { error: e.message || 'Request failed' },
      headers: {},
      timeMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Database Queries ───────────────────────────────────────────────────────

export async function dbQuery(sql: string, params: any[] = []): Promise<any[]> {
  const dbUrl = getDbUrl();
  if (!dbUrl) {
    throw new Error('No DATABASE_URL available for PULSE DB queries');
  }

  // Dynamic import pg to avoid requiring it when not in DEEP mode
  let pg: any;
  try {
    pg = require('pg');
  } catch {
    throw new Error('pg package not installed. Run: npm install pg');
  }

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  });
  let queryTimeout: NodeJS.Timeout | null = null;
  try {
    await client.connect();
    await client.query('SET statement_timeout TO 10000');
    const result = await Promise.race([
      client.query(sql, params),
      new Promise<never>((_, reject) => {
        queryTimeout = setTimeout(() => {
          reject(new Error('PULSE DB query timed out after 10000ms'));
        }, 10_000);
      }),
    ]);
    return result.rows;
  } finally {
    if (queryTimeout) {
      clearTimeout(queryTimeout);
    }
    await client.end().catch(() => {});
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────

export function isDeepMode(): boolean {
  return !!process.env.PULSE_DEEP;
}

/** Is total mode. */
export function isTotalMode(): boolean {
  return !!process.env.PULSE_TOTAL;
}
