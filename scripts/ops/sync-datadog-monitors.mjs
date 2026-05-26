#!/usr/bin/env node
/**
 * Sync docs/monitoring/datadog-monitors.json → Datadog API.
 *
 * Reads `DD_API_KEY` + `DD_APP_KEY` from process.env (CI workflow injects).
 * For each monitor:
 *   1. Search existing by exact name match
 *   2. PUT (update) if found, POST (create) otherwise
 *
 * Exits 0 on success (including dry-run when keys missing).
 * Exits 1 if any HTTP call fails or any monitor is rejected by Datadog.
 *
 * Usage:
 *   DD_API_KEY=... DD_APP_KEY=... node scripts/ops/sync-datadog-monitors.mjs
 *   node scripts/ops/sync-datadog-monitors.mjs --dry-run
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..', '..');
const SOURCE = resolve(REPO_ROOT, 'docs/monitoring/datadog-monitors.json');

const DD_API_KEY = process.env.DD_API_KEY;
const DD_APP_KEY = process.env.DD_APP_KEY;
const DRY = process.argv.includes('--dry-run');

if (!DD_API_KEY || !DD_APP_KEY) {
  console.error('[sync-datadog] DD_API_KEY/DD_APP_KEY not set — dry-run only');
}

const headers = {
  'Content-Type': 'application/json',
  'DD-API-KEY': DD_API_KEY || '',
  'DD-APPLICATION-KEY': DD_APP_KEY || '',
};

const API = 'https://api.datadoghq.com/api/v1/monitor';

const manifest = JSON.parse(readFileSync(SOURCE, 'utf8'));
const monitors = manifest.monitors ?? manifest;
if (!Array.isArray(monitors)) {
  console.error(`[sync-datadog] expected an array of monitors in ${SOURCE}`);
  process.exit(2);
}

async function searchByName(name) {
  if (DRY || !DD_API_KEY) return null;
  const url = `${API}/search?query=name:${encodeURIComponent('"' + name + '"')}`;
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) throw new Error(`search ${name} failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return (json.monitors ?? []).find((m) => m.name === name) ?? null;
}

async function upsert(monitor) {
  if (DRY || !DD_API_KEY) {
    console.log(`[dry] would upsert: ${monitor.name}`);
    return { dry: true };
  }
  const existing = await searchByName(monitor.name);
  if (existing) {
    const res = await fetch(`${API}/${existing.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(monitor),
    });
    if (!res.ok) throw new Error(`PUT ${monitor.name} failed: ${res.status} ${await res.text()}`);
    return { id: existing.id, action: 'updated' };
  }
  const res = await fetch(API, { method: 'POST', headers, body: JSON.stringify(monitor) });
  if (!res.ok) throw new Error(`POST ${monitor.name} failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return { id: j.id, action: 'created' };
}

(async () => {
  let created = 0;
  let updated = 0;
  let failed = 0;
  for (const m of monitors) {
    try {
      const r = await upsert(m);
      if (r.dry) continue;
      if (r.action === 'created') created++;
      else updated++;
      console.log(`[ok] ${r.action} ${m.name} (id=${r.id})`);
    } catch (e) {
      failed++;
      console.error(`[fail] ${m.name}: ${e.message}`);
    }
  }
  console.log(`\n[sync-datadog] created=${created} updated=${updated} failed=${failed}`);
  if (failed > 0) process.exit(1);
})();
