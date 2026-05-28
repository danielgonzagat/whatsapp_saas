#!/usr/bin/env node
/**
 * probe-kloel-prod.mjs
 *
 * Surveys the production Kloel motor state via the backend /diag endpoints.
 * Read-only HTTP probe; never prints secrets (token, Authorization headers).
 *
 * Usage:
 *   KLOEL_BACKEND_URL=https://<railway-host> \
 *   DIAG_TOKEN=<jwt> \
 *     node scripts/ops/probe-kloel-prod.mjs
 *
 *   # or via npm alias (if wired in root package.json):
 *   npm run probe:kloel-prod
 *
 * Env:
 *   KLOEL_BACKEND_URL   required — production backend base URL
 *   DIAG_TOKEN          required — bearer JWT for JwtAuthGuard endpoints
 *   KLOEL_DIAG_TOKEN    alias for DIAG_TOKEN
 *
 * Exit:
 *   0   when env unset (friendly skip) OR all probes succeed and motor healthy
 *   1   when any probe fails OR motor degraded
 */

import { performance } from 'node:perf_hooks';

const TIMEOUT_MS = 10_000;
const ENDPOINTS = ['/diag', '/diag/full', '/diag/kloel-motor'];

function friendlySkip(message) {
  process.stderr.write(`${message}\n`);
  process.exit(0);
}

function normalizeBaseUrl(raw) {
  let u = String(raw).trim();
  while (u.endsWith('/')) u = u.slice(0, -1);
  return u;
}

async function probeEndpoint(baseUrl, path, token) {
  const url = `${baseUrl}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = performance.now();
  let status = 0;
  let ok = false;
  let body = null;
  let error = null;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    status = res.status;
    ok = res.ok;
    const text = await res.text();
    if (text && text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        // Non-JSON body — preserve a safe snippet without leaking large blobs.
        body = { raw: text.slice(0, 2000) };
      }
    }
  } catch (err) {
    if (err && err.name === 'AbortError') {
      error = `timeout after ${TIMEOUT_MS}ms`;
    } else {
      error = err && err.message ? err.message : String(err);
    }
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Math.round(performance.now() - startedAt);
  return { endpoint: path, status, ok, latency_ms: latencyMs, body, error };
}

function pickFirstString(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

function summarizeMotor(motorProbe) {
  const notes = [];
  let motorStatus = 'unknown';
  let motorProvider = null;

  if (!motorProbe) {
    notes.push('motor probe missing');
    return { motor_status: motorStatus, motor_provider: motorProvider, motor_notes: notes };
  }
  if (motorProbe.error) {
    notes.push(`motor probe error: ${motorProbe.error}`);
    return { motor_status: motorStatus, motor_provider: motorProvider, motor_notes: notes };
  }
  if (!motorProbe.ok) {
    notes.push(`motor probe http ${motorProbe.status}`);
    return { motor_status: motorStatus, motor_provider: motorProvider, motor_notes: notes };
  }

  const body = motorProbe.body && typeof motorProbe.body === 'object' ? motorProbe.body : {};
  const motor = body.motor && typeof body.motor === 'object' ? body.motor : body;

  const rawStatus = pickFirstString(motor, ['status', 'health', 'state']) ?? pickFirstString(body, ['status', 'health', 'state']);
  if (rawStatus) {
    const s = rawStatus.toLowerCase();
    if (s === 'healthy' || s === 'ok' || s === 'up' || s === 'ready') motorStatus = 'healthy';
    else if (s === 'degraded' || s === 'partial' || s === 'warn' || s === 'warning') motorStatus = 'degraded';
    else if (s === 'down' || s === 'fail' || s === 'failed' || s === 'error') motorStatus = 'degraded';
    else motorStatus = 'unknown';
    notes.push(`raw status: ${rawStatus}`);
  } else {
    notes.push('no status field on motor probe body');
  }

  const provider = pickFirstString(motor, ['provider', 'llmProvider', 'aiProvider'])
    ?? pickFirstString(body, ['provider', 'llmProvider', 'aiProvider']);
  if (provider) {
    const p = provider.toLowerCase();
    if (p === 'deepseek' || p === 'generic' || p === 'openai') motorProvider = p;
    else {
      motorProvider = null;
      notes.push(`unrecognized provider: ${provider}`);
    }
  } else {
    notes.push('no provider field on motor probe body');
  }

  // Surface any explicit warnings/errors arrays without leaking secrets.
  const warnings = motor.warnings ?? body.warnings;
  if (Array.isArray(warnings) && warnings.length > 0) {
    notes.push(`warnings: ${warnings.length}`);
    if (motorStatus === 'healthy') motorStatus = 'degraded';
  }
  const errors = motor.errors ?? body.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    notes.push(`errors: ${errors.length}`);
    motorStatus = 'degraded';
  }

  return { motor_status: motorStatus, motor_provider: motorProvider, motor_notes: notes };
}

async function main() {
  const rawBase = process.env.KLOEL_BACKEND_URL;
  if (!rawBase || rawBase.trim().length === 0) {
    friendlySkip('Set KLOEL_BACKEND_URL=https://<railway-host> to probe production');
  }
  const baseUrl = normalizeBaseUrl(rawBase);

  const token = process.env.DIAG_TOKEN || process.env.KLOEL_DIAG_TOKEN;
  if (!token || token.trim().length === 0) {
    friendlySkip('Set DIAG_TOKEN=<jwt> to probe authenticated endpoints');
  }

  const results = [];
  for (const path of ENDPOINTS) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design for clean per-probe logs
    const result = await probeEndpoint(baseUrl, path, token);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    results.push(result);
  }

  const motorProbe = results.find((r) => r.endpoint === '/diag/kloel-motor');
  const allOk = results.every((r) => r.ok === true && r.error === null);
  const motor = summarizeMotor(motorProbe);

  const summary = {
    summary: {
      all_ok: allOk,
      motor_status: motor.motor_status,
      motor_provider: motor.motor_provider,
      motor_notes: motor.motor_notes,
    },
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);

  const success = allOk && motor.motor_status === 'healthy';
  process.exit(success ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`probe-kloel-prod fatal: ${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
});
