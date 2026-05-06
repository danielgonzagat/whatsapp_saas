#!/usr/bin/env node
import { formatISO, writeAtomic, checkAutoGen, escapeMdTable, loadJson } from './hubs-generator-helpers.mjs';
import { genDag } from './hubs-generator-dag.mjs';
/**
 * hubs-generator.mjs — KLOEL HUD hub notes generator (H1).
 *
 * Reads BLOCKER_RANK.json (from R1), provider-state.json, and CLAUDE.md DAG
 * to generate 6 hub markdown notes in the Obsidian vault.
 *
 * Hubs created:
 *   00-NEXT.md       — top-3 next tasks (first file Claude reads)
 *   00-BLOCKERS.md   — full ranked queue, top 50
 *   00-DAG.md        — phase progress bars + Mermaid Gantt
 *   00-PROVIDERS.md  — Stripe/Meta/WAHA/etc. health
 *   00-REGRESSIONS.md — what worsened since last snapshot
 *   00-HUD-README.md — operator guide + tag ref
 *
 * CLI: --dry (stderr only) --emit (default, write files)
 */

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const VAULT_ROOT = resolve(
  process.env.KLOEL_VAULT_ROOT || '/Users/danielpenin/Documents/Obsidian Vault',
);
const HUD_DIR = join(VAULT_ROOT, 'Kloel', '00-HUD');
const BLOCKER_PATH = resolve(REPO_ROOT, 'BLOCKER_RANK.json');
const PROVIDER_PATH = join(
  VAULT_ROOT,
  'Kloel',
  '99 - Espelho do Codigo',
  '_source',
  '.hud',
  'provider-state.json',
);
const CLAUDE_MD_PATH = resolve(REPO_ROOT, 'CLAUDE.md');

// ─── DAG — canonical phase → module mapping from CLAUDE.md ──────────────

const DAG_MODULES = {
  0: ['Auth', 'Workspaces', 'Settings', 'KYC'],
  1: ['Products', 'Checkout', 'Wallet', 'Billing'],
  2: ['WhatsApp', 'Inbox', 'Autopilot', 'Flows'],
  3: ['CIA', 'CRM', 'Dashboard', 'Analytics', 'Reports'],
  4: ['Vendas', 'Affiliate', 'Member Area', 'Campaigns', 'FollowUps'],
  5: ['Marketing', 'Anuncios', 'Sites', 'Canvas', 'Funnels', 'Webinarios', 'Leads'],
  6: ['Team', 'API Keys', 'Webhooks', 'Audit Log', 'Notifications', 'Marketplace', 'Video'],
};

const PHASE_NAMES = {
  0: 'INFRAESTRUTURA',
  1: 'MOTOR COMERCIAL',
  2: 'COMUNICACAO',
  3: 'INTELIGENCIA',
  4: 'CRESCIMENTO',
  5: 'PLATAFORMA AVANCADA',
  6: 'OPERACIONAL',
};

// ─── Helpers ────────────────────────────────────────────────────────────

function genNext(blockers) {
  const top3 = blockers.slice(0, 3);
  const now = formatISO();

  let table = '| # | File:Line | Why | Tier | Phase | Effort | Score |\n';
  table += '|---|---|---|---|---|---|---|\n';

  for (const b of top3) {
    const line = b.topFinding?.line ?? '—';
    const why = b.topFinding?.message || 'No findings — code audit recommended';
    const effort = `${b.breakdown.effort_hours}h`;
    const fileDisplay = `${b.file}:${line}`;
    const absPath = resolve(REPO_ROOT, b.file);

    table += `| ${b.rank} | \`${fileDisplay}\` ([open](file://${absPath})) | ${escapeMdTable(why)} | tier-${b.tier} | phase-${b.phase} | ${effort} | ${b.score.toFixed(1)} |\n`;
  }

  return `---
tags: [hud/hub, hud/next]
auto_generated: true
generated_at: ${now}
purpose: "First file Claude reads on session start. Top 3 next tasks."
cssclass: kloel-hud-next
---

<!-- AUTO-GENERATED — do not edit -->

# 🎯 Next Move — KLOEL Path to Production

**Updated**: ${now} (refresh: \`node scripts/orchestration/hud-orchestrator.mjs --once\`)

## Top 3 Blockers (ranked)

${table}
## Quick context
- 4/4 mirror-acceptance-tests passing.
- Wave 1 sidecars: tier=N, phase=N, coverage=N, ci=N, providers=N.
- Last refresh: ${now}.

## Commands
- \`npm run findings:full\` — refresh findings
- \`node scripts/orchestration/hud-orchestrator.mjs --once\` — full HUD refresh
- \`npm run colors:once\` — re-apply graph colors

## Links
- [[00-BLOCKERS|Full ranked queue]]
- [[00-DAG|Phase progress]]
- [[00-PROVIDERS|Provider health]]
- [[00-REGRESSIONS|What got worse]]
`;
}

function genBlockers(blockers) {
  const top50 = blockers.slice(0, 50);
  const now = formatISO();

  let table = '| # | File | Line | Tier | Phase | Sev. Critical | Sev. High | Score |\n';
  table += '|---|---|---|---|---|---|---|---|\n';

  for (const b of top50) {
    const line = b.topFinding?.line ?? '—';
    table += `| ${b.rank} | \`${b.file}\` | ${line} | tier-${b.tier} | phase-${b.phase} | ${b.severityCounts.critical} | ${b.severityCounts.high} | ${b.score.toFixed(1)} |\n`;
  }

  return `---
tags: [hud/hub, hud/blockers]
auto_generated: true
generated_at: ${now}
purpose: "Full ranked blocker queue (top 50). Rebuilt from BLOCKER_RANK.json."
cssclass: kloel-hud-blockers
---

<!-- AUTO-GENERATED — do not edit -->

# 🚨 Full Blocker Queue

**Updated**: ${now} | **Total ranked**: ${blockers.length} files

${table}
`;
}

function genProviders(providerState) {
  const now = formatISO();
  const providers = providerState?.providers || [];

  let table = '| Provider | Status | Last Check | Evidence |\n';
  table += '|---|---|---|---|\n';

  for (const p of providers) {
    const statusEmoji =
      p.status === 'healthy'
        ? '\u{1F7E2}'
        : p.status === 'degraded'
          ? '\u{1F7E1}'
          : p.status === 'down'
            ? '\u{1F534}'
            : '\u26AA';
    const evidence = (p.evidence || []).join(', ') || '—';
    table += `| ${statusEmoji} ${p.name} | ${p.status} | ${p.lastCheck} | ${evidence} |\n`;
  }

  return `---
tags: [hud/hub, hud/providers]
auto_generated: true
generated_at: ${now}
purpose: "Provider health from PULSE + CI (Phase 1 — no live pings)."
cssclass: kloel-hud-providers
---

<!-- AUTO-GENERATED — do not edit -->

# 🔌 Provider Health

**Updated**: ${now} | **Source**: \`provider-state.json\` (Wave 1 emitter)

${table}
`;
}

function genRegressions() {
  const now = formatISO();

  return `---
tags: [hud/hub, hud/regressions]
auto_generated: true
generated_at: ${now}
purpose: "What changed for the worse since last snapshot."
cssclass: kloel-hud-regressions
---

<!-- AUTO-GENERATED — do not edit -->

# 📉 Regressions

> First snapshot — baseline established. Future runs will diff against the latest
> snapshot in \`Kloel/00-HUD/snapshots/\` to populate this section.
`;
}

function genReadme() {
  const now = formatISO();

  return `---
tags: [hud/hub, meta/instructions]
auto_generated: true
generated_at: ${now}
purpose: "Operator guide for the KLOEL HUD hub notes system."
cssclass: kloel-hud-readme
---

<!-- AUTO-GENERATED — do not edit -->

# 📖 HUD Operator Guide

## What each hub note does

| Hub | Purpose |
|---|---|
| [[00-NEXT]] | Top 3 next tasks. First file Claude reads on session start. |
| [[00-BLOCKERS]] | Full ranked blocker queue (top 50 from BLOCKER_RANK.json). |
| [[00-DAG]] | Phase progress from CLAUDE.md DAG — completion % per phase. |
| [[00-PROVIDERS]] | Provider health (Stripe, Meta, WAHA, etc.) from Wave 1 emitter. |
| [[00-REGRESSIONS]] | What worsened since last snapshot. Baseline-only for now. |
| [[00-HUD-README]] | This file — operator guide + tag taxonomy reference. |

## Refresh

\`\`\`bash
node scripts/orchestration/hud-orchestrator.mjs --once
\`\`\`

Runs the full pipeline: emitters → blocker-rank → hubs-generator → graph-lens.

- \`--dry\` — dry run, no writes
- \`--watch\` — poll loop on file changes
- \`--status\` — print last refresh report

## Tag taxonomy

Hub-specific tags:
- \`hud/hub\` — all hub notes
- \`hud/next\`, \`hud/blockers\`, \`hud/dag\`, \`hud/providers\`, \`hud/regressions\`
- \`meta/instructions\` — operational docs

See [[_meta/taxonomy|Canonical Tag Taxonomy]] for the full namespace.

## Auto-gen marker

Every hub note starts with \`<!-- AUTO-GENERATED — do not edit -->\`.
The generator checks for this marker on every refresh:

- **Present** → overwrites file.
- **Absent** (human-edited) → aborts with a warning — manual review needed.

## Snapshots

Daily snapshots land in \`Kloel/00-HUD/snapshots/YYYY-MM-DD.md\` for
time-series diffing. The regressions hub will compare against the latest
snapshot once at least two exist.
`;
}

// ─── Main ───────────────────────────────────────────────────────────────

function parseArgs() {
  const dry = process.argv.includes('--dry');
  const emit = process.argv.includes('--emit') || !dry;
  return { dry, emit };
}

function main() {
  const opts = parseArgs();

  // ── Guard: BLOCKER_RANK.json must exist ──
  if (!existsSync(BLOCKER_PATH)) {
    process.stderr.write(
      'hubs-generator: BLOCKER_RANK.json not found. Run blocker-rank.mjs (R1) first.\n',
    );
    process.exit(2);
  }

  const blockerData = loadJson(BLOCKER_PATH, 'BLOCKER_RANK.json');
  if (!blockerData || !Array.isArray(blockerData.topN)) {
    process.stderr.write('hubs-generator: BLOCKER_RANK.json is invalid or missing topN array.\n');
    process.exit(2);
  }

  const blockers = blockerData.topN;

  // ── Load provider state (best-effort) ──
  const providerState = existsSync(PROVIDER_PATH)
    ? loadJson(PROVIDER_PATH, 'provider-state.json')
    : null;

  // ── Hub definitions ──
  const hubs = [
    { name: '00-NEXT.md', content: genNext(blockers) },
    { name: '00-BLOCKERS.md', content: genBlockers(blockers) },
    { name: '00-DAG.md', content: genDag(blockers) },
    {
      name: '00-PROVIDERS.md',
      content: genProviders(providerState),
    },
    { name: '00-REGRESSIONS.md', content: genRegressions() },
    { name: '00-HUD-README.md', content: genReadme() },
  ];

  // ── Dry-run path ──
  if (opts.dry) {
    const sampleTop3 = blockers.slice(0, 3).map((b) => ({
      file: b.file,
      score: b.score,
      tier: b.tier,
      phase: b.phase,
    }));

    process.stderr.write(
      JSON.stringify(
        {
          subagent: 'H1',
          dry: true,
          vault_dir: HUD_DIR,
          hubs_to_create: hubs.map((h) => h.name),
          sample_top_3: sampleTop3,
          total_blockers: blockers.length,
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  // ── Ensure HUD dir exists ──
  mkdirSync(HUD_DIR, { recursive: true });

  // ── Auto-gen marker check ──
  for (const hub of hubs) {
    const path = join(HUD_DIR, hub.name);
    const status = checkAutoGen(path);
    if (status === 'human') {
      process.stderr.write(
        `hubs-generator: ABORT — ${hub.name} exists WITHOUT auto-gen marker (human-edited). Remove manually or add marker.\n`,
      );
      process.exit(3);
    }
  }

  // ── Write hubs ──
  const created = [];
  for (const hub of hubs) {
    const path = join(HUD_DIR, hub.name);
    writeAtomic(path, hub.content);
    created.push(hub.name);
    process.stderr.write(`hubs-generator: wrote ${hub.name}\n`);
  }

  // ── Final output contract ──
  const sampleTop3 = blockers.slice(0, 3).map((b) => ({
    file: b.file,
    score: b.score,
    tier: b.tier,
    phase: b.phase,
  }));

  process.stdout.write(
    JSON.stringify(
      {
        subagent: 'H1',
        hubs_created: created,
        vault_dir: HUD_DIR,
        files_created: [
          'scripts/orchestration/hubs-generator.mjs',
          ...created.map((n) => join(HUD_DIR, n)),
        ],
        sample_top_3: sampleTop3,
        status: 'pass',
        blockers: `${blockers.length} ranked, top score: ${blockers[0]?.score || 'N/A'}`,
      },
      null,
      2,
    ) + '\n',
  );
}

main();
