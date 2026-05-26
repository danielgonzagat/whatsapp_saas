#!/usr/bin/env node
/**
 * Sync docs/monitoring/sentry-alert-rules.json → Sentry API.
 *
 * Reads `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` (default: kloel-inteligencia-comercial-a),
 * `SENTRY_PROJECT_SLUG` (default: node) from process.env.
 *
 * For each rule:
 *   1. GET /api/0/projects/{org}/{project}/rules/ to find by name
 *   2. PUT (update) if found, POST (create) otherwise
 *
 * Exits 0 on success (including dry-run when token missing).
 * Exits 1 if any HTTP call fails.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..', '..');
const SOURCE = resolve(REPO_ROOT, 'docs/monitoring/sentry-alert-rules.json');

const TOKEN = process.env.SENTRY_AUTH_TOKEN;
const ORG = process.env.SENTRY_ORG || 'kloel-inteligencia-comercial-a';
const PROJECT = process.env.SENTRY_PROJECT_SLUG || 'node';
const DRY = process.argv.includes('--dry-run');

if (!TOKEN) {
  console.error('[sync-sentry] SENTRY_AUTH_TOKEN not set — dry-run only');
}

const headers = {
  'Content-Type': 'application/json',
  Authorization: TOKEN ? `Bearer ${TOKEN}` : '',
};
const BASE = `https://sentry.io/api/0/projects/${ORG}/${PROJECT}/rules/`;

const manifest = JSON.parse(readFileSync(SOURCE, 'utf8'));
const rules = manifest.rules ?? manifest;
if (!Array.isArray(rules)) {
  console.error(`[sync-sentry] expected an array of rules in ${SOURCE}`);
  process.exit(2);
}

async function listExisting() {
  if (DRY || !TOKEN) return [];
  const res = await fetch(BASE, { method: 'GET', headers });
  if (!res.ok) throw new Error(`list rules failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

async function upsert(rule, existingList) {
  if (DRY || !TOKEN) {
    console.log(`[dry] would upsert: ${rule.name}`);
    return { dry: true };
  }
  const existing = existingList.find((r) => r.name === rule.name);
  if (existing) {
    const res = await fetch(`${BASE}${existing.id}/`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(rule),
    });
    if (!res.ok) throw new Error(`PUT ${rule.name} failed: ${res.status} ${await res.text()}`);
    return { id: existing.id, action: 'updated' };
  }
  const res = await fetch(BASE, { method: 'POST', headers, body: JSON.stringify(rule) });
  if (!res.ok) throw new Error(`POST ${rule.name} failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return { id: j.id, action: 'created' };
}

(async () => {
  const existing = await listExisting();
  let created = 0;
  let updated = 0;
  let failed = 0;
  for (const r of rules) {
    try {
      const result = await upsert(r, existing);
      if (result.dry) continue;
      if (result.action === 'created') created++;
      else updated++;
      console.log(`[ok] ${result.action} ${r.name} (id=${result.id})`);
    } catch (e) {
      failed++;
      console.error(`[fail] ${r.name}: ${e.message}`);
    }
  }
  console.log(`\n[sync-sentry] created=${created} updated=${updated} failed=${failed}`);
  if (failed > 0) process.exit(1);
})();
