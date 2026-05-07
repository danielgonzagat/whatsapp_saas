#!/usr/bin/env node
/**
 * blocker-rank.mjs — canonical KLOEL HUD blocker ranking.
 *
 * Reads Wave 1 sidecars from the Obsidian mirror and ranks files by:
 *
 *   score = tier_weight × phase_priority × user_impact × (1 / max(0.5, effort_hours))
 *
 * Outputs BLOCKER_RANK.json at repo root (gitignored). Top 50 by default.
 *
 * CLI: --top N --dry --emit (default) --pretty
 */

import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  readdirSync,
  statSync,
  mkdirSync,
} from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const VAULT_ROOT = resolve(
  process.env.KLOEL_VAULT_ROOT || '/Users/danielpenin/Documents/Obsidian Vault',
);
const SOURCE_DIR = join(VAULT_ROOT, 'Kloel', '99 - Espelho do Codigo', '_source');
const OUTPUT_PATH = resolve(REPO_ROOT, 'BLOCKER_RANK.json');

// ─── Algorithm constants ────────────────────────────────────────────────────

const TIER_WEIGHT = { 1: 4.0, 2: 3.0, 3: 2.0, 4: 1.0 };
const PHASE_PRIORITY = { 0: 10, 1: 8, 2: 6, 3: 4, 4: 2, 5: 1, 6: 1 };

const SEVERITY_WEIGHT = { critical: 4, high: 2, medium: 1, low: 0.5 };

function userImpact(filePath) {
  const p = filePath.toLowerCase();
  if (/(stripe|payment|checkout|billing|wallet|auth|whatsapp|inbox|webhook)/i.test(p)) return 5;
  if (/(api|route|controller)/i.test(p) || /src\/.+\/(routes?|controllers?)/i.test(p)) return 5;
  if (/(service|handler|repository)/i.test(p) || /lib\/.+\.service/i.test(p)) return 4;
  if (/(util|lib|helper)/i.test(p)) return 2;
  if (/(test|spec|script|doc|fixture)/i.test(p)) return 1;
  return 1;
}

function effortHours(loc, severityCounts) {
  const sevWeighted =
    (severityCounts?.critical || 0) * SEVERITY_WEIGHT.critical +
    (severityCounts?.high || 0) * SEVERITY_WEIGHT.high +
    (severityCounts?.medium || 0) * SEVERITY_WEIGHT.medium +
    (severityCounts?.low || 0) * SEVERITY_WEIGHT.low;
  return Math.max(0.5, loc / 100 + sevWeighted / 3 + loc / 300);
}

function moduleFromPath(filePath) {
  // best-effort extraction
  if (filePath.startsWith('backend/src/')) {
    const seg = filePath.split('/')[2];
    return `backend/${seg}`;
  }
  if (filePath.startsWith('frontend/src/')) {
    const seg = filePath.split('/')[2];
    return `frontend/${seg}`;
  }
  if (filePath.startsWith('worker/')) {
    return 'worker';
  }
  return filePath.split('/').slice(0, 2).join('/');
}

// ─── Sidecar walking ────────────────────────────────────────────────────────

function* walkSidecars(rootDir) {
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        if (
          entry.name.endsWith('.tier.json') ||
          entry.name.endsWith('.phase.json') ||
          entry.name.endsWith('.findings.json') ||
          entry.name.endsWith('.coverage.json')
        ) {
          yield full;
        }
      }
    }
  }
}

function loadSidecars() {
  const byFile = new Map();

  for (const abs of walkSidecars(SOURCE_DIR)) {
    const rel = relative(SOURCE_DIR, abs).replace(/\\/g, '/');
    const m = rel.match(/^(.+?)\.(tier|phase|findings|coverage)\.json$/);
    if (!m) continue;
    const baseFile = m[1];
    const kind = m[2];

    if (!byFile.has(baseFile)) {
      byFile.set(baseFile, { file: baseFile });
    }
    const entry = byFile.get(baseFile);
    try {
      const data = JSON.parse(readFileSync(abs, 'utf8'));
      entry[kind] = data;
    } catch {
      /* skip parse errors */
    }
  }

  return Array.from(byFile.values());
}

function locFromMirrorMd(baseFile) {
  // mirror .md sibling has frontmatter with `bytes:` field
  const mdPath = join(SOURCE_DIR, `${baseFile}.md`);
  try {
    const content = readFileSync(mdPath, 'utf8');
    const m = content.match(/^bytes:\s*(\d+)/m);
    if (m) return Math.max(1, Math.round(parseInt(m[1], 10) / 40)); // ~40 bytes/line heuristic
  } catch {
    /* ignore */
  }
  return 100; // default
}

// ─── Ranking ────────────────────────────────────────────────────────────────

function computeEntry(raw) {
  const tier = raw.tier?.tier || 4;
  const phase = raw.phase?.phase ?? 6;
  const findings = raw.findings;
  const severityCounts = findings?.severityCounts || {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  const findingsCount = findings?.count || 0;

  const tier_weight = TIER_WEIGHT[tier] || 1.0;
  const phase_priority = PHASE_PRIORITY[phase] ?? 1;
  const user_impact = userImpact(raw.file);
  const loc = locFromMirrorMd(raw.file);
  const effort_hours = effortHours(loc, severityCounts);
  const score = (tier_weight * phase_priority * user_impact) / Math.max(0.5, effort_hours);

  const topFinding = findings?.findings?.[0]
    ? {
        line: findings.findings[0].line,
        rule: findings.findings[0].rule,
        engine: findings.findings[0].engine,
        message: findings.findings[0].message?.slice(0, 200),
      }
    : null;

  return {
    file: raw.file,
    score,
    breakdown: {
      tier_weight,
      phase_priority,
      user_impact,
      effort_hours: Math.round(effort_hours * 10) / 10,
    },
    tier,
    phase,
    module: raw.phase?.module || moduleFromPath(raw.file),
    loc,
    findingsCount,
    severityCounts,
    topFinding,
    evidence: [
      raw.tier?.evidence?.[0],
      raw.phase?.evidence?.[0],
      findings?.fingerprint || `findings:${findingsCount}`,
    ].filter(Boolean),
    rank: 0, // filled later
  };
}

function rank(entries, topN) {
  const ranked = entries
    .map(computeEntry)
    .filter((e) => !(e.tier === 1 && e.findingsCount === 0)) // tier-1 + clean = done
    .sort((a, b) => b.score - a.score);

  // Tiebreaker: prefer modules >60% complete (more tier-1s in same phase)
  // (not needed unless ties — skip for now, sort is stable enough)

  const top = ranked.slice(0, topN);
  top.forEach((e, idx) => (e.rank = idx + 1));
  return { ranked, top };
}

// ─── Output ─────────────────────────────────────────────────────────────────

function writeAtomic(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now().toString(36)}`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

function renderPretty(top) {
  const lines = [];
  lines.push('| # | File | Score | Tier | Phase | Effort | Top finding |');
  lines.push('|---|------|------:|-----:|------:|-------:|-------------|');
  for (const e of top.slice(0, 10)) {
    const finding = e.topFinding
      ? `${e.topFinding.engine}:${e.topFinding.rule || 'n/a'}`
      : 'no findings';
    lines.push(
      `| ${e.rank} | \`${e.file}\` | ${e.score.toFixed(2)} | ${e.tier} | ${e.phase} | ${e.breakdown.effort_hours}h | ${finding} |`,
    );
  }
  return lines.join('\n');
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { top: 50, dry: false, pretty: false, emit: true };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--top') out.top = parseInt(args[++i], 10) || 50;
    else if (a === '--dry') {
      out.dry = true;
      out.emit = false;
    } else if (a === '--emit') out.emit = true;
    else if (a === '--pretty') out.pretty = true;
  }
  return out;
}

function main() {
  const opts = parseArgs();

  if (!existsSync(SOURCE_DIR)) {
    console.error(`blocker-rank: source mirror missing: ${SOURCE_DIR}`);
    process.exit(2);
  }

  process.stderr.write('blocker-rank: walking sidecars...\n');
  const entries = loadSidecars();
  process.stderr.write(`blocker-rank: ${entries.length} files with sidecars\n`);

  const { ranked, top } = rank(entries, opts.top);
  process.stderr.write(
    `blocker-rank: ranked ${ranked.length} files (after filter), top ${top.length}\n`,
  );

  const output = {
    schema: 'kloel.blocker-rank.v1',
    computedAt: new Date().toISOString(),
    totalFiles: entries.length,
    totalRanked: ranked.length,
    topN: top,
  };

  if (opts.pretty) {
    process.stdout.write(renderPretty(top) + '\n');
  }

  if (opts.emit && !opts.dry) {
    writeAtomic(OUTPUT_PATH, JSON.stringify(output, null, 2));
    process.stderr.write(`blocker-rank: wrote ${OUTPUT_PATH}\n`);
  } else {
    process.stderr.write(
      JSON.stringify(
        {
          schema: output.schema,
          totalFiles: output.totalFiles,
          totalRanked: output.totalRanked,
          top3: top.slice(0, 3).map((e) => ({ file: e.file, score: e.score })),
        },
        null,
        2,
      ) + '\n',
    );
  }
}

main();
