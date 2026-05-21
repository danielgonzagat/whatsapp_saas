// DAG section extracted from hubs-generator
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
      if (b.tier === 1) {phaseStats[p].tier1++;}
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

    // Build Gantt section per module
    mermaidSections += `    section FASE ${p} — ${PHASE_NAMES[p]}\n`;
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

<!-- AUTO-GENERATED — do not edit -->

# 📊 Phase Progress

**Updated**: ${now} | **Source**: CLAUDE.md DAG + BLOCKER_RANK.json

${table}
${mermaidBlock}
`;
}

