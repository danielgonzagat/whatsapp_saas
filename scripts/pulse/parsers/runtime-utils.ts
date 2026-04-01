/**
 * PULSE Runtime Utilities
 * Shared helpers for DEEP/TOTAL mode parsers that need HTTP access or DB queries.
 *
 * Usage:
 *   import { getBackendUrl, httpGet, httpPost, makeTestJwt, dbQuery } from './runtime-utils';
 *
 * Environment variables (set via `source scripts/railway-env.sh` or manually):
 *   PULSE_BACKEND_URL — Override backend URL (default: auto-detect from Railway)
 *   PULSE_DATABASE_URL — Override DB URL (default: auto-detect from Railway)
 *   PULSE_JWT_SECRET — Override JWT secret (default: auto-detect from Railway)
 *   PULSE_FRONTEND_URL — Override frontend URL (default: auto-detect from Railway CORS_ORIGIN)
 */

import { execSync } from 'child_process';

// ─── Cached Railway vars ────────────────────────────────────────────────────

let _railwayVars: Record<string, string> | null = null;

function getRailwayVars(): Record<string, string> {
  if (_railwayVars) return _railwayVars;
  try {
    const out = execSync('railway variables --json', {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    _railwayVars = JSON.parse(out);
    return _railwayVars!;
  } catch {
    _railwayVars = {};
    return _railwayVars;
  }
}

// ─── Getters ────────────────────────────────────────────────────────────────

export function getBackendUrl(): string {
  if (process.env.PULSE_BACKEND_URL) return process.env.PULSE_BACKEND_URL;
  const vars = getRailwayVars();
  const domain = vars.RAILWAY_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  return 'http://localhost:3001';
}

export function getFrontendUrl(): string {
  if (process.env.PULSE_FRONTEND_URL) return process.env.PULSE_FRONTEND_URL;
  const vars = getRailwayVars();
  return (vars.CORS_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
}

export function getDbUrl(): string {
  if (process.env.PULSE_DATABASE_URL) return process.env.PULSE_DATABASE_URL;
  const vars = getRailwayVars();
  return vars.DATABASE_PUBLIC_URL || vars.DATABASE_URL || '';
}

export function getJwtSecret(): string {
  if (process.env.PULSE_JWT_SECRET) return process.env.PULSE_JWT_SECRET;
  const vars = getRailwayVars();
  return vars.JWT_SECRET || 'pulse-test-secret';
}

// ─── JWT Generation ─────────────────────────────────────────────────────────

export function makeTestJwt(payload: Record<string, any> = {}, expiresInSec = 3600): string {
  const crypto = require('crypto');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({
    sub: payload.userId || 'pulse-test-user',
    email: payload.email || 'pulse@test.kloel.com',
    workspaceId: payload.workspaceId || 'pulse-test-workspace',
    role: payload.role || 'ADMIN',
    iat: now,
    exp: now + expiresInSec,
    ...payload,
  })).toString('base64url');
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

export async function httpGet(path: string, opts: { jwt?: string; timeout?: number } = {}): Promise<HttpResponse> {
  return httpRequest('GET', path, undefined, opts);
}

export async function httpPost(path: string, body?: any, opts: { jwt?: string; timeout?: number } = {}): Promise<HttpResponse> {
  return httpRequest('POST', path, body, opts);
}

export async function httpPut(path: string, body?: any, opts: { jwt?: string; timeout?: number } = {}): Promise<HttpResponse> {
  return httpRequest('PUT', path, body, opts);
}

export async function httpDelete(path: string, opts: { jwt?: string; timeout?: number } = {}): Promise<HttpResponse> {
  return httpRequest('DELETE', path, undefined, opts);
}

async function httpRequest(method: string, path: string, body?: any, opts: { jwt?: string; timeout?: number } = {}): Promise<HttpResponse> {
  const url = `${getBackendUrl()}${path}`;
  const timeout = opts.timeout || 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.jwt) headers['Authorization'] = `Bearer ${opts.jwt}`;

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
    res.headers.forEach((v, k) => { resHeaders[k] = v; });
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
  if (!dbUrl) throw new Error('No DATABASE_URL available for PULSE DB queries');

  // Dynamic import pg to avoid requiring it when not in DEEP mode
  let pg: any;
  try {
    pg = require('pg');
  } catch {
    throw new Error('pg package not installed. Run: npm install pg');
  }

  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    await client.end().catch(() => {});
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────

export function isDeepMode(): boolean {
  return !!process.env.PULSE_DEEP;
}

export function isTotalMode(): boolean {
  return !!process.env.PULSE_TOTAL;
}
