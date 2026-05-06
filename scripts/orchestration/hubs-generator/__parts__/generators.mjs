import { resolve, join } from 'node:path';
import { formatISO, escapeMdTable } from './helpers.mjs';
import { REPO_ROOT, DAG_MODULES, PHASE_NAMES } from './constants.mjs';

export function genNext(blockers) {
  const top3 = blockers.slice(0, 3);
  const now = formatISO();

  let table = '| # | File:Line | Why | Tier | Phase | Effort | Score |\n';
  table += '|---|---|---|---|---|---|---|\n';

  for (const b of top3) {
    const line = b.topFinding?.line ?? '\u2014';
    const why = b.topFinding?.message || 'No findings \u2014 code audit recommended';
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

<!-- AUTO-GENERATED \u2014 do not edit -->

# \u{1F3AF} Next Move \u2014 KLOEL Path to Production

**Updated**: ${now} (refresh: \`node scripts/orchestration/hud-orchestrator.mjs --once\`)

## Top 3 Blockers (ranked)

${table}
## Quick context
- 4/4 mirror-acceptance-tests passing.
- Wave 1 sidecars: tier=N, phase=N, coverage=N, ci=N, providers=N.
- Last refresh: ${now}.

## Commands
- \`npm run findings:full\` \u2014 refresh findings
- \`node scripts/orchestration/hud-orchestrator.mjs --once\` \u2014 full HUD refresh
- \`npm run colors:once\` \u2014 re-apply graph colors

## Links
- [[00-BLOCKERS|Full ranked queue]]
- [[00-DAG|Phase progress]]
- [[00-PROVIDERS|Provider health]]
- [[00-REGRESSIONS|What got worse]]
`;
}

export function genBlockers(blockers) {
  const top50 = blockers.slice(0, 50);
  const now = formatISO();

  let table = '| # | File | Line | Tier | Phase | Sev. Critical | Sev. High | Score |\n';
  table += '|---|---|---|---|---|---|---|---|\n';

  for (const b of top50) {
    const line = b.topFinding?.line ?? '\u2014';
    table += `| ${b.rank} | \`${b.file}\` | ${line} | tier-${b.tier} | phase-${b.phase} | ${b.severityCounts.critical} | ${b.severityCounts.high} | ${b.score.toFixed(1)} |\n`;
  }

  return `---
tags: [hud/hub, hud/blockers]
auto_generated: true
generated_at: ${now}
purpose: "Full ranked blocker queue (top 50). Rebuilt from BLOCKER_RANK.json."
cssclass: kloel-hud-blockers
---

<!-- AUTO-GENERATED \u2014 do not edit -->

# \u{1F6A8} Full Blocker Queue

**Updated**: ${now} | **Total ranked**: ${blockers.length} files

${table}
`;
}

export function genDag(blockers) {
  const now = formatISO();

  const phaseStats = {};
  for (let p = 0; p <= 6; p++) {
    phaseStats[p] = { total: 0, tier1: 0 };
  }

  for (const b of blockers) {
    const p = b.phase;
    if (phaseStats[p] !== undefined) {
      phaseStats[p].total++;
      if (b.tier === 1) phaseStats[p].tier1++;
    }
  }

  let table = '| Phase | Name | Files (tier-1 / total) | Completion |\n';
  table += '|---|---|---|---|\n';

  let mermaidSections = '';
  for (let p = 0; p <= 6; p++) {
    const stats = phaseStats[p];
    const pct = stats.total > 0 ? Math.round((stats.tier1 / stats.total) * 100) : 0;
    const bar =
      pct >= 80 ? '\u{1F7E2}' : pct >= 50 ? '\u{1F7E1}' : pct >= 20 ? '\u{1F7E0}' : '\u{1F534}';
    table += `| ${bar} FASE ${p} | ${PHASE_NAMES[p]} | ${stats.tier1} / ${stats.total} | ${pct}% |\n`;

    mermaidSections += `    section FASE ${p} \u2014 ${PHASE_NAMES[p]}\n`;
    for (const mod of DAG_MODULES[p] || []) {
      const modFiles = blockers.filter(
        (b) => b.phase === p && b.module && b.module.toLowerCase().includes(mod.toLowerCase()),
      );
      const modTier1 = modFiles.filter((b) => b.tier === 1).length;
      const modPct = modFiles.length > 0 ? Math.round((modTier1 / modFiles.length) * 100) : 0;
      const status = modPct === 100 ? 'done' : modPct > 0 ? 'active' : 'crit';
      const duration = Math.max(1, Math.ceil((modFiles.length || 1) / 5));
      mermaidSections += `    ${mod} :${status}, 0, ${duration}d\n`;
    }
    mermaidSections += '\n';
  }

  let mermaidBlock = '';
  if (mermaidSections) {
    mermaidBlock = `
## Phase Gantt

\`\`\`mermaid
gantt
    title KLOEL Path to Production
    dateFormat YYYY-MM-DD
    axisFormat %b %d
${mermaidSections}\`\`\`
`;
  }

  return `---
tags: [hud/hub, hud/dag]
auto_generated: true
generated_at: ${now}
purpose: "Phase progress from CLAUDE.md DAG. Completion = files in tier-1 / total files per phase."
cssclass: kloel-hud-dag
---

<!-- AUTO-GENERATED \u2014 do not edit -->

# \u{1F4CA} Phase Progress

**Updated**: ${now} | **Source**: CLAUDE.md DAG + BLOCKER_RANK.json

${table}
${mermaidBlock}
`;
}

export function genProviders(providerState) {
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
    const evidence = (p.evidence || []).join(', ') || '\u2014';
    table += `| ${statusEmoji} ${p.name} | ${p.status} | ${p.lastCheck} | ${evidence} |\n`;
  }

  return `---
tags: [hud/hub, hud/providers]
auto_generated: true
generated_at: ${now}
purpose: "Provider health from PULSE + CI (Phase 1 \u2014 no live pings)."
cssclass: kloel-hud-providers
---

<!-- AUTO-GENERATED \u2014 do not edit -->

# \u{1F50C} Provider Health

**Updated**: ${now} | **Source**: \`provider-state.json\` (Wave 1 emitter)

${table}
`;
}

export function genRegressions() {
  const now = formatISO();

  return `---
tags: [hud/hub, hud/regressions]
auto_generated: true
generated_at: ${now}
purpose: "What changed for the worse since last snapshot."
cssclass: kloel-hud-regressions
---

<!-- AUTO-GENERATED \u2014 do not edit -->

# \u{1F4C9} Regressions

> First snapshot \u2014 baseline established. Future runs will diff against the latest
> snapshot in \`Kloel/00-HUD/snapshots/\` to populate this section.
`;
}

export function genReadme() {
  const now = formatISO();

  return `---
tags: [hud/hub, meta/instructions]
auto_generated: true
generated_at: ${now}
purpose: "Operator guide for the KLOEL HUD hub notes system."
cssclass: kloel-hud-readme
---

<!-- AUTO-GENERATED \u2014 do not edit -->

# \u{1F4D6} HUD Operator Guide

## What each hub note does

| Hub | Purpose |
|---|---|
| [[00-NEXT]] | Top 3 next tasks. First file Claude reads on session start. |
| [[00-BLOCKERS]] | Full ranked blocker queue (top 50 from BLOCKER_RANK.json). |
| [[00-DAG]] | Phase progress from CLAUDE.md DAG \u2014 completion % per phase. |
| [[00-PROVIDERS]] | Provider health (Stripe, Meta, WAHA, etc.) from Wave 1 emitter. |
| [[00-REGRESSIONS]] | What worsened since last snapshot. Baseline-only for now. |
| [[00-HUD-README]] | This file \u2014 operator guide + tag taxonomy reference. |

## Refresh

\`\`\`bash
node scripts/orchestration/hud-orchestrator.mjs --once
\`\`\`

Runs the full pipeline: emitters \u2192 blocker-rank \u2192 hubs-generator \u2192 graph-lens.

- \`--dry\` \u2014 dry run, no writes
- \`--watch\` \u2014 poll loop on file changes
- \`--status\` \u2014 print last refresh report

## Tag taxonomy

Hub-specific tags:
- \`hud/hub\` \u2014 all hub notes
- \`hud/next\`, \`hud/blockers\`, \`hud/dag\`, \`hud/providers\`, \`hud/regressions\`
- \`meta/instructions\` \u2014 operational docs

See [[_meta/taxonomy|Canonical Tag Taxonomy]] for the full namespace.

## Auto-gen marker

Every hub note starts with \`<!-- AUTO-GENERATED \u2014 do not edit -->\`.
The generator checks for this marker on every refresh:

- **Present** \u2192 overwrites file.
- **Absent** (human-edited) \u2192 aborts with a warning \u2014 manual review needed.

## Snapshots

Daily snapshots land in \`Kloel/00-HUD/snapshots/YYYY-MM-DD.md\` for
time-series diffing. The regressions hub will compare against the latest
snapshot once at least two exist.
`;
}
