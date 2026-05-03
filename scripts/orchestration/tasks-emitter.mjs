#!/usr/bin/env node

import { readFileSync, existsSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(join(__dirname, '..', '..'));

const VAULT_ROOT = resolve(
  process.env.KLOEL_VAULT_ROOT || '/Users/danielpenin/Documents/Obsidian Vault',
);
const TASKS_DIR = join(VAULT_ROOT, 'Kloel', 'Tasks');
const BLOCKER_RANK_PATH = join(REPO_ROOT, 'BLOCKER_RANK.json');

const DEFAULT_TOP = 50;

function sanitizeFilename(filePath) {
  return filePath.replace(/\//g, '--');
}

function derivePriority(rank) {
  if (rank <= 10) return 'high';
  if (rank <= 25) return 'medium';
  return 'low';
}

function readExistingTask(absPath) {
  if (!existsSync(absPath)) return null;
  try {
    return readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
}

function parseFrontmatter(content) {
  if (!content.startsWith('---\n')) return {};
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) return {};
  const fm = content.slice(4, end);
  const result = {};
  let currentKey = null;
  for (const line of fm.split('\n')) {
    const m = line.match(/^(\w[\w_]*):\s*(.*)/);
    if (m) {
      currentKey = m[1];
      result[currentKey] = m[2];
    } else if (currentKey === 'tags' && line.startsWith('  - ')) {
      if (!Array.isArray(result.tags)) result.tags = [];
      result.tags.push(line.slice(4));
    }
  }
  return result;
}

function buildTaskContent(entry) {
  const { file, score, breakdown, tier, phase, rank, topFinding } = entry;
  const filename = sanitizeFilename(file);
  const priority = derivePriority(rank);
  const created = new Date().toISOString();

  const effortStr = (breakdown.effort_hours || 0).toFixed(1);

  const tags = ['hud/task', `kloel/phase-${phase}`, `kloel/tier-${tier}`];

  let topFindingBlock = '';
  if (topFinding) {
    topFindingBlock = [
      '## Top finding',
      `- engine: ${topFinding.engine}`,
      `- rule: ${topFinding.rule}`,
      `- line: ${topFinding.line}`,
      `- message: \"${topFinding.message}\"`,
      '',
    ].join('\n');
  } else {
    topFindingBlock = [
      '## Top finding',
      `- findings: 0 (no linter/PULSE findings for this file)`,
      '',
    ].join('\n');
  }

  const sourceMirrorFile = file;

  return [
    '---',
    `title: "${file}"`,
    `status: open`,
    `priority: ${priority}`,
    `tier: ${tier}`,
    `phase: ${phase}`,
    `score: ${score}`,
    `effort_hours: ${effortStr}`,
    `file: ${file}`,
    `top_finding: "${topFinding ? topFinding.rule : 'none'}"`,
    'tags:',
    ...tags.map((t) => `  - ${t}`),
    `created: ${created}`,
    `auto_generated: true`,
    '---',
    '',
    `# ${file}`,
    '',
    `**Score**: ${score} \u00b7 **Tier**: ${tier} \u00b7 **Phase**: ${phase} \u00b7 **Effort**: ${effortStr}h`,
    '',
    topFindingBlock,
    '## Why ranked here',
    `- tier_weight: ${breakdown.tier_weight}`,
    `- phase_priority: ${breakdown.phase_priority}`,
    `- user_impact: ${breakdown.user_impact}`,
    `- effort_hours: ${effortStr}`,
    '',
    '## Action items',
    '- [ ] Investigate top finding',
    '- [ ] Verify integration tests cover this path',
    '- [ ] Mark \`status: done\` when fixed',
    '',
    '## Links',
    `- Source mirror: [[Kloel/99 - Espelho do Codigo/_source/${sourceMirrorFile}]]`,
    `- Open in editor: \`code ${file}\``,
    '',
  ].join('\n');
}

function atomWrite(absPath, content) {
  mkdirSync(dirname(absPath), { recursive: true });
  const tmp = absPath + '.tmp';
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, absPath);
}

function taskExistsAndMatches(absPath, entry) {
  const content = readExistingTask(absPath);
  if (!content) return false;

  const fm = parseFrontmatter(content);

  if (fm.status === 'done') return 'preserved_done';
  if (fm.status && fm.status !== 'open') return 'preserved_human';

  const sameScore = parseFloat(fm.score) === entry.score;
  const sameTier = parseInt(fm.tier, 10) === entry.tier;
  const samePhase = parseInt(fm.phase, 10) === entry.phase;

  if (sameScore && sameTier && samePhase) return 'unchanged';

  return false;
}

function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const emit = args.includes('--emit') || (!dry && args.length === 0);

  let topN = DEFAULT_TOP;
  const topIdx = args.indexOf('--top');
  if (topIdx !== -1 && topIdx + 1 < args.length) {
    topN = parseInt(args[topIdx + 1], 10);
    if (isNaN(topN) || topN < 1) {
      process.stderr.write(JSON.stringify({ error: 'invalid --top value' }) + '\n');
      process.exit(2);
    }
  }

  if (!existsSync(BLOCKER_RANK_PATH)) {
    process.stderr.write(
      JSON.stringify({ error: 'BLOCKER_RANK.json not found', path: BLOCKER_RANK_PATH }) + '\n',
    );
    process.exit(2);
  }

  let rankData;
  try {
    rankData = JSON.parse(readFileSync(BLOCKER_RANK_PATH, 'utf8'));
  } catch (e) {
    process.stderr.write(
      JSON.stringify({ error: 'failed to parse BLOCKER_RANK.json', msg: e.message }) + '\n',
    );
    process.exit(2);
  }

  const entries = (rankData.topN || []).slice(0, topN);

  if (entries.length === 0) {
    process.stderr.write(JSON.stringify({ error: 'no ranked entries to process' }) + '\n');
    process.exit(2);
  }

  let tasksWritten = 0;
  let tasksSkipped = 0;
  let failedSanitize = 0;

  for (const entry of entries) {
    let filename;
    try {
      filename = sanitizeFilename(entry.file);
    } catch {
      failedSanitize++;
      continue;
    }

    const taskPath = join(TASKS_DIR, filename + '.md');
    const matchResult = taskExistsAndMatches(taskPath, entry);

    if (matchResult === 'unchanged') {
      tasksSkipped++;
      continue;
    }

    if (matchResult === 'preserved_done' || matchResult === 'preserved_human') {
      tasksSkipped++;
      continue;
    }

    const content = buildTaskContent(entry);

    if (dry) {
      tasksWritten++;
    } else if (emit) {
      atomWrite(taskPath, content);
      tasksWritten++;
    }
  }

  const summary = {
    tasksWritten,
    tasksSkipped,
    failedSanitize,
  };
  process.stderr.write(JSON.stringify(summary) + '\n');
}

main();
