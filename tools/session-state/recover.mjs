#!/usr/bin/env node
// tools/session-state/recover.mjs — L14 session state recovery.
//
// Gathers every signal a fresh session would otherwise be blind to:
//   • Local git: branch, status, uncommitted files, divergence vs origin/main
//   • Remote: open PRs, their CI status, dependabot, in-progress workflow runs
//   • Other agents: task-graph.json locks (active + expired)
//   • Background: claude scheduled wakeups + monitor tasks (if accessible)
//   • Redis queues (if .env.pulse.local present and REDIS_PUBLIC_URL works)
//
// Writes SESSION_STATE.md at repo root (gitignored). Always idempotent.

import { spawn } from 'node:child_process';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT = join(ROOT, 'SESSION_STATE.md');
const REMOTE = 'danielgonzagat/whatsapp_saas';

async function main() {
  const sections = [];
  sections.push(`# Session State — ${new Date().toISOString()}\n`);

  // Git local
  const branch = (await safeOutput(['git', 'branch', '--show-current'])).trim();
  const status = await safeOutput(['git', 'status', '--porcelain=v1']);
  const aheadBehind = (await safeOutput(['git', 'rev-list', '--left-right', '--count', `${branch}...origin/main`])).trim();
  const lastCommits = await safeOutput(['git', 'log', '--oneline', '-5']);
  sections.push('## Git\n');
  sections.push('```');
  sections.push(`branch: ${branch}`);
  sections.push(`ahead/behind main: ${aheadBehind}`);
  sections.push(`uncommitted files: ${status.trim().split('\n').filter(Boolean).length}`);
  sections.push('recent commits:');
  sections.push(lastCommits);
  sections.push('```\n');

  // GitHub PRs
  const prs = await safeOutput(['gh', 'pr', 'list', '--repo', REMOTE, '--author', '@me', '--state', 'open', '--json', 'number,title,headRefName,createdAt,statusCheckRollup', '--limit', '20']);
  sections.push('## Open PRs (my own)\n');
  sections.push('```json');
  sections.push(prs.trim() || '[]');
  sections.push('```\n');

  // In-progress workflow runs
  const runs = await safeOutput(['gh', 'run', 'list', '--repo', REMOTE, '--limit', '20', '--json', 'name,status,conclusion,headBranch,createdAt']);
  try {
    const all = JSON.parse(runs);
    const active = all.filter((r) => r.status !== 'completed');
    sections.push('## Active workflow runs\n');
    sections.push('```json');
    sections.push(JSON.stringify(active, null, 2));
    sections.push('```\n');
  } catch {
    sections.push('## Active workflow runs — could not parse\n');
  }

  // Other agents locks
  const locks = await safeRead(join(ROOT, '.claude', 'task-graph.json'));
  sections.push('## Multi-agent task-graph locks\n');
  sections.push('```json');
  sections.push(locks || '{}');
  sections.push('```\n');

  // Scheduled wakeups (best effort — claude-code session lock file)
  const scheduledRaw = await safeRead(join(ROOT, '.claude', 'scheduled_tasks.lock'));
  sections.push('## Claude scheduled wakeups (best-effort)\n');
  sections.push('```');
  sections.push(scheduledRaw || '(none / not visible)');
  sections.push('```\n');

  // Redis queue snapshot — only if REDIS_PUBLIC_URL is available.
  const envFile = await safeRead(join(ROOT, '.env.pulse.local'));
  const redisMatch = envFile?.match(/REDIS_PUBLIC_URL=(.+)/);
  if (redisMatch) {
    sections.push('## BullMQ queue snapshot (sandbox / Railway prod)\n');
    sections.push('Use `node /tmp/drain-all-dlqs.cjs` or [[reference_railway_bullmq_cleanup]] to inspect; not sampling automatically to avoid network call.\n');
  }

  // Active long-running processes (graphify, npm, vitest)
  const ps = await safeOutput(['ps', '-eo', 'pid,etime,command']);
  const lines = ps.split('\n').filter((l) => /(?:graphify|vitest|next dev|tsc|nest start|prisma)/i.test(l) && !/grep/.test(l));
  sections.push('## Local long-running processes\n');
  sections.push('```');
  sections.push(lines.join('\n') || '(none)');
  sections.push('```\n');

  await writeFile(OUT, sections.join('\n'));
  console.log(`[session-state] wrote ${OUT}`);
  console.log(sections.slice(0, 3).join('\n'));
}

function safeOutput(argv) {
  return new Promise((resolve) => {
    let out = '';
    const child = spawn(argv[0], argv.slice(1), { cwd: ROOT, stdio: ['inherit', 'pipe', 'pipe'] });
    child.stdout?.on('data', (d) => (out += d.toString()));
    child.stderr?.on('data', () => {});
    child.on('exit', () => resolve(out));
    child.on('error', () => resolve(''));
  });
}

async function safeRead(file) {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}

await main();
