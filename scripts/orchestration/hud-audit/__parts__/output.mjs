import { MODE_FIX_ORPHANS, MODE_DRY, MODE_JSON, CATEGORY_FILTER } from './constants.mjs';
import { fixOrphans } from './orphans.mjs';
import { catA_baselineFiles, catB_wave1Emitters } from './catA-B.mjs';
import { catC_wave2Rank, catD_wave3Polish } from './catC-D.mjs';
import { catE_mcpDoorway } from './catE.mjs';
import { catF_plugins, catG_pluginConfig } from './catF-G.mjs';
import { catH_wave6Bundles, catI_theme } from './catH-I.mjs';
import { catJ_pulseEngines } from './catJ.mjs';

export const CATEGORIES = {
  A: catA_baselineFiles,
  B: catB_wave1Emitters,
  C: catC_wave2Rank,
  D: catD_wave3Polish,
  E: catE_mcpDoorway,
  F: catF_plugins,
  G: catG_pluginConfig,
  H: catH_wave6Bundles,
  I: catI_theme,
  J: catJ_pulseEngines,
};

export function computeSummary(categories) {
  let totalPass = 0;
  let totalFail = 0;
  let totalPending = 0;
  let totalChecks = 0;

  for (const cat of categories) {
    for (const check of cat.checks) {
      totalChecks++;
      if (check.pending) {
        totalPending++;
      } else if (check.pass) {
        totalPass++;
      } else {
        totalFail++;
      }
    }
  }

  return { totalPass, totalFail, totalPending, totalChecks };
}

export function renderMarkdown(categories, summary) {
  const lines = [];
  const now = new Date().toISOString();

  lines.push(`# KLOEL HUD Audit \u2014 ${now}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(
    `- Pass: ${summary.totalPass} / ${summary.totalChecks} checks` +
      (summary.totalFail > 0 ? ` (${summary.totalFail} failures)` : ''),
  );
  lines.push(`- Fail: ${summary.totalFail}`);
  lines.push(`- Pending: ${summary.totalPending}`);
  lines.push('');

  for (const cat of categories) {
    const catPass = cat.checks.filter((c) => c.pass && !c.pending).length;
    const catFail = cat.checks.filter((c) => !c.pass && !c.pending).length;
    const catPending = cat.checks.filter((c) => c.pending).length;
    const catTotal = cat.checks.length;

    const statusParts = [];
    if (catPass > 0) statusParts.push(`${catPass} pass`);
    if (catFail > 0) statusParts.push(`${catFail} fail`);
    if (catPending > 0) statusParts.push(`${catPending} pending`);

    lines.push(`## ${cat.name} (${statusParts.join(', ')})`);

    for (const check of cat.checks) {
      if (check.pending) {
        lines.push(`  ? ${check.label}: ${check.detail}`);
      } else if (check.pass) {
        lines.push(`  \u2713 ${check.label}`);
      } else {
        lines.push(`  \u2717 ${check.label}: ${check.detail}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function renderJson(categories, summary) {
  const result = {
    auditAt: new Date().toISOString(),
    summary: {
      pass: summary.totalPass,
      fail: summary.totalFail,
      pending: summary.totalPending,
      total: summary.totalChecks,
    },
    categories: categories.map((cat) => ({
      name: cat.name,
      pass: cat.checks.filter((c) => c.pass && !c.pending).length,
      fail: cat.checks.filter((c) => !c.pass && !c.pending).length,
      pending: cat.checks.filter((c) => c.pending).length,
      checks: cat.checks.map((c) => ({
        label: c.label,
        status: c.pending ? 'pending' : c.pass ? 'pass' : 'fail',
        detail: c.detail,
      })),
    })),
  };
  return JSON.stringify(result, null, 2);
}

export function main() {
  if (MODE_FIX_ORPHANS) {
    const count = fixOrphans(MODE_DRY);
    process.exit(0);
  }

  if (CATEGORY_FILTER) {
    const fn = CATEGORIES[CATEGORY_FILTER];
    if (!fn) {
      console.error(`Unknown category: "${CATEGORY_FILTER}". Use A-J.`);
      process.exit(2);
    }
    const categories = [fn()];
    const summary = computeSummary(categories);
    if (MODE_JSON) {
      process.stdout.write(renderJson(categories, summary) + '\n');
    } else {
      process.stdout.write(renderMarkdown(categories, summary) + '\n');
    }
    process.exit(summary.totalFail > 0 ? 1 : 0);
  }

  const categories = Object.values(CATEGORIES).map((fn) => fn());
  const summary = computeSummary(categories);

  if (MODE_JSON) {
    process.stdout.write(renderJson(categories, summary) + '\n');
  } else {
    process.stdout.write(renderMarkdown(categories, summary) + '\n');
  }

  process.exit(summary.totalFail > 0 ? 1 : 0);
}
