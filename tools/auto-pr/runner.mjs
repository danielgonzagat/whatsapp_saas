#!/usr/bin/env node
// tools/auto-pr/runner.mjs — L13 auto-PR pipeline.
//
// Recebe um JSON-job:
//   {
//     "title": "fix(scope): summary",
//     "body": "...",
//     "branch": "fix/auto-scope-001",
//     "base": "origin/main",
//     "files": [{ "path": "src/x.ts", "patch": "diff" }],
//     "shell": ["npm run lint", "npm run build"],   // pre-commit validation
//     "labels": ["auto-pr"]
//   }
//
// Cria worktree off base → aplica patches → roda shell validations → commit → push → opens PR.
// Idempotente: se o branch já existe e o head idêntico, no-op.
//
//   node tools/auto-pr/runner.mjs jobs/foo.json
//   node tools/auto-pr/runner.mjs --queue jobs/*.json   # process many

import { argv } from 'node:process';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, rm, mkdtemp } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = process.cwd();
const REMOTE_FROM_ARG = argv.find((a) => a.startsWith('--repo='))?.split('=')[1];
const REMOTE = REMOTE_FROM_ARG || 'danielgonzagat/whatsapp_saas';
const DRY_RUN = argv.includes('--dry-run');

async function processOne(jobFile) {
  const job = JSON.parse(await readFile(jobFile, 'utf8'));
  console.log(`[auto-pr] processing ${jobFile} → ${job.branch}`);
  const wt = await mkdtemp(join(tmpdir(), 'auto-pr-'));
  try {
    await run(['git', 'worktree', 'add', '-b', job.branch, wt, job.base || 'origin/main'], { cwd: REPO_ROOT });

    for (const f of job.files || []) {
      const target = join(wt, f.path);
      await mkdir(dirname(target), { recursive: true });
      if (f.patch) {
        await writeFile(join(wt, '.auto-pr.patch'), f.patch);
        await run(['git', 'apply', '.auto-pr.patch'], { cwd: wt });
      } else if (f.content != null) {
        await writeFile(target, f.content);
      }
    }
    await rm(join(wt, '.auto-pr.patch'), { force: true });

    for (const cmd of job.shell || []) {
      console.log(`[auto-pr] $ ${cmd}`);
      await runShell(cmd, { cwd: wt });
    }

    await run(['git', 'add', '-A'], { cwd: wt });

    // Skip if nothing changed.
    const diff = await captureOutput(['git', 'diff', '--cached', '--stat'], { cwd: wt });
    if (!diff.trim()) {
      console.log('[auto-pr] no changes — skip');
      return { skipped: true };
    }

    const message = `${job.title}\n\n${job.body || ''}\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>\n`;
    await run(['git', '-c', 'commit.gpgsign=false', 'commit', '-m', message], { cwd: wt });

    if (DRY_RUN) {
      const sha = await captureOutput(['git', 'rev-parse', 'HEAD'], { cwd: wt });
      console.log(`[auto-pr][dry-run] branch=${job.branch} sha=${sha.trim()} (no push, no PR)`);
      return { dryRun: true, branch: job.branch, sha: sha.trim() };
    }

    await run(['git', 'push', '-u', 'origin', job.branch], { cwd: wt });

    const prArgs = ['gh', 'pr', 'create', '--title', job.title, '--body', job.body || '', '--repo', REMOTE, '--base', (job.base || 'main').replace(/^origin\//, '')];
    // Labels are best-effort: gh fails the whole command if any label doesn't exist on the repo.
    // Try with labels first; if that fails, retry without them.
    let url;
    if (job.labels?.length) {
      const withLabels = [...prArgs, '--label', job.labels.join(',')];
      try {
        url = await captureOutput(withLabels, { cwd: wt });
      } catch (err) {
        console.warn(`[auto-pr] labels rejected (${err.message}); retrying without labels`);
        url = await captureOutput(prArgs, { cwd: wt });
      }
    } else {
      url = await captureOutput(prArgs, { cwd: wt });
    }
    console.log(`[auto-pr] opened: ${url.trim()}`);
    return { url: url.trim() };
  } catch (err) {
    console.error(`[auto-pr] FAIL ${job.branch}: ${err.message}`);
    return { error: err.message };
  } finally {
    try {
      await run(['git', 'worktree', 'remove', wt, '--force'], { cwd: REPO_ROOT });
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  const queueArg = argv.find((a) => a.startsWith('--queue='))?.split('=')[1];
  if (queueArg) {
    const { glob } = await import('node:fs/promises');
    const files = await Promise.all(queueArg.split(',').map((g) => listGlob(g)));
    const flat = files.flat();
    const results = [];
    for (const f of flat) results.push(await processOne(f));
    console.log(JSON.stringify(results, null, 2));
  } else {
    const file = argv[2];
    if (!file) {
      console.error('usage: runner.mjs <job.json> [--repo=owner/name]');
      process.exit(1);
    }
    const r = await processOne(file);
    console.log(JSON.stringify(r, null, 2));
  }
}

async function listGlob(pattern) {
  // Naive: only supports plain "jobs/*.json" — for more, use globby.
  const { readdir } = await import('node:fs/promises');
  const dir = dirname(pattern);
  const re = new RegExp('^' + basename(pattern).replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
  const entries = await readdir(dir);
  return entries.filter((e) => re.test(e)).map((e) => join(dir, e));
}

function run(argv, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), { ...opts, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${argv.join(' ')} → ${code}`))));
    child.on('error', reject);
  });
}

function runShell(cmd, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-lc', cmd], { ...opts, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} → ${code}`))));
    child.on('error', reject);
  });
}

function captureOutput(argv, opts) {
  return new Promise((resolve, reject) => {
    let out = '';
    const child = spawn(argv[0], argv.slice(1), { ...opts, stdio: ['inherit', 'pipe', 'inherit'] });
    child.stdout.on('data', (d) => (out += d.toString()));
    child.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`${argv.join(' ')} → ${code}`))));
    child.on('error', reject);
  });
}

function dirname(p) {
  return p.split('/').slice(0, -1).join('/') || '.';
}

await main();
