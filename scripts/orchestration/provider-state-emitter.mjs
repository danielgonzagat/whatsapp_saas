#!/usr/bin/env node
/**
 * Provider State Emitter — Phase 1 (read-only)
 *
 * Reads PULSE_REPORT.md provider mentions and recent CI logs via gh CLI.
 * Does NOT make live API calls (Phase 2 will add real pings).
 *
 * Output: <vault>/Kloel/99 - Espelho do Codigo/_source/.hud/provider-state.json
 * Schema: kloel.provider.v1
 *
 * CLI:
 *   node scripts/orchestration/provider-state-emitter.mjs --dry   # stderr summary only
 *   node scripts/orchestration/provider-state-emitter.mjs --emit  # write file
 *
 * NOT constitution-locked.
 */

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const VAULT_ROOT = resolve(
  process.env.KLOEL_VAULT_ROOT || '/Users/danielpenin/Documents/Obsidian Vault',
);
const HUD_DIR = join(VAULT_ROOT, 'Kloel', '99 - Espelho do Codigo', '_source', '.hud');
const OUTPUT_PATH = join(HUD_DIR, 'provider-state.json');
const PULSE_PATH = resolve(process.cwd(), 'PULSE_REPORT.md');

const CANONICAL_PROVIDERS = [
  'stripe',
  'meta',
  'waha',
  'google',
  'bling',
  'cloudflare',
  'sentry',
  'mercadopago',
  'supabase',
  'railway',
  'vercel',
];

const PROVIDER_CI_PATTERNS = {
  stripe: /stripe/gi,
  meta: /\bmeta\b/gi,
  waha: /waha/gi,
  google: /google/gi,
  bling: /bling/gi,
  cloudflare: /cloudflare/gi,
  sentry: /sentry/gi,
  mercadopago: /mercadopago/gi,
  supabase: /supabase/gi,
  railway: /railway/gi,
  vercel: /vercel/gi,
};

const PROVIDER_ERROR_PATTERNS = {
  stripe: /stripe.*(?:error|fail|4\d{2}|5\d{2}|timeout|unavailable|exception)/i,
  meta: /\bmeta\b.*(?:error|fail|4\d{2}|5\d{2}|timeout|unavailable|exception)/i,
  waha: /waha.*(?:disconnect|error|fail|timeout|qr.*(?:fail|expired))/i,
  google: /google.*(?:error|fail|4\d{2}|5\d{2}|timeout|auth.*(?:fail|error))/i,
  bling: /bling.*(?:error|fail|4\d{2}|5\d{2}|timeout|unavailable)/i,
  cloudflare: /cloudflare.*(?:error|fail|4\d{2}|5\d{2}|timeout)/i,
  sentry: /sentry.*(?:error|fail|timeout|unavailable|exception)/i,
  mercadopago: /mercadopago.*(?:error|fail|4\d{2}|5\d{2}|timeout|unavailable)/i,
  supabase: /supabase.*(?:error|fail|4\d{2}|5\d{2}|timeout|unavailable|exception)/i,
  railway: /railway.*(?:error|fail|4\d{2}|5\d{2}|timeout|unavailable)/i,
  vercel: /vercel.*(?:error|fail|4\d{2}|5\d{2}|timeout|unavailable)/i,
};

function scanPulse() {
  const evidence = {};

  if (!existsSync(PULSE_PATH)) {
    return evidence;
  }

  let content;
  try {
    content = readFileSync(PULSE_PATH, 'utf8');
  } catch {
    return evidence;
  }

  for (const provider of CANONICAL_PROVIDERS) {
    const pattern = PROVIDER_CI_PATTERNS[provider];
    pattern.lastIndex = 0;
    const lines = [];
    let match;
    let idx = 0;
    while ((match = pattern.exec(content)) !== null) {
      idx++;
      const start = Math.max(0, match.index - 120);
      const end = Math.min(content.length, match.index + match[0].length + 120);
      const snippet = content.slice(start, end).replace(/\n/g, ' ');
      lines.push(`pulse:${snippet.slice(0, 60)}`);
      if (idx > 5) break;
    }

    if (lines.length > 0) {
      evidence[provider] = lines;
    }
  }

  return evidence;
}

function ghAvailable() {
  try {
    execSync('which gh', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function scanCiLogs() {
  const evidence = {};

  if (!ghAvailable()) {
    return evidence;
  }

  let runsJson;
  try {
    runsJson = execSync('gh run list --limit 10 --json databaseId,conclusion,name,status', {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return evidence;
  }

  let runs;
  try {
    runs = JSON.parse(runsJson);
  } catch {
    return evidence;
  }

  for (const run of runs) {
    const runId = String(run.databaseId);
    if (
      run.status !== 'completed' ||
      run.conclusion === 'success' ||
      run.conclusion === 'skipped'
    ) {
      continue;
    }

    let logOutput;
    try {
      logOutput = execSync(`gh run view ${runId} --log`, {
        encoding: 'utf8',
        timeout: 15000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      continue;
    }

    for (const provider of CANONICAL_PROVIDERS) {
      if (evidence[provider]) continue;

      const errPattern = PROVIDER_ERROR_PATTERNS[provider];
      errPattern.lastIndex = 0;

      if (errPattern.test(logOutput)) {
        errPattern.lastIndex = 0;
        evidence[provider] = [`ci:${runId}`, `ci:${run.name}`];
      }
    }
  }

  return evidence;
}

function buildLegacyPulseSummary(providerName) {
  const providerSectionRegex = new RegExp(
    `(?:^|\\n)\\s*${providerName}[^\\n]*\\n[^\\n]*(?:error|fail|down|broken|degraded|healthy|ok|operational)`,
    'i',
  );

  let pulseContent;
  try {
    pulseContent = readFileSync(PULSE_PATH, 'utf8');
  } catch {
    return null;
  }

  const match = pulseContent.match(providerSectionRegex);
  if (!match) return null;

  const line = match[0];
  if (/error|fail|down|broken/i.test(line)) return 'degraded';
  if (/healthy|ok|operational/i.test(line)) return 'healthy';
  return null;
}

function determineStatus(providerName, pulseEvidence, ciEvidence) {
  const hasCiErrors = ciEvidence && ciEvidence.length > 0;

  if (hasCiErrors) {
    return 'degraded';
  }

  const pulseHint = buildLegacyPulseSummary(providerName);
  if (pulseHint) {
    return pulseHint;
  }

  return 'unknown';
}

function buildProviderState() {
  const pulseEvidence = scanPulse();
  const ciEvidence = scanCiLogs();

  const providers = CANONICAL_PROVIDERS.map((name) => {
    const pe = pulseEvidence[name] || [];
    const ce = ciEvidence[name] || [];

    const status = determineStatus(name, pe, ce);
    const evidence = [...pe, ...ce];

    return {
      name,
      status,
      lastCheck: new Date().toISOString(),
      evidence,
      phase2Ping: null,
    };
  });

  return {
    schema: 'kloel.provider.v1',
    providers,
  };
}

function writeJsonAtomic(filePath, value) {
  const dirName = join(filePath, '..');
  if (!existsSync(dirName)) {
    mkdirSync(dirName, { recursive: true });
  }

  const next = `${JSON.stringify(value, null, 2)}\n`;

  if (existsSync(filePath)) {
    const current = readFileSync(filePath, 'utf8');
    if (current === next) return false;
  }

  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, next, 'utf8');
  renameSync(tmp, filePath);
  return true;
}

function main() {
  const dry = process.argv.includes('--dry');
  const emit = process.argv.includes('--emit');

  if (!dry && !emit) {
    process.stderr.write('provider-state-emitter: specify --dry or --emit\n');
    process.exit(2);
  }

  const state = buildProviderState();

  const byStatus = { healthy: 0, degraded: 0, down: 0, unknown: 0 };
  for (const p of state.providers) {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
  }

  const summary = {
    providersScanned: state.providers.length,
    byStatus,
  };

  if (emit) {
    const written = writeJsonAtomic(OUTPUT_PATH, state);
    summary.written = written;
    summary.outputPath = OUTPUT_PATH;
  }

  process.stderr.write(JSON.stringify(summary) + '\n');
}

main();
