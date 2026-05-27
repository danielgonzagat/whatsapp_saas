#!/usr/bin/env node
// CEO monitor for an EDIT-ONLY wave fleet.
// Polls .exit files in the wave's run dir, processes each completed task once:
//   - parse last ```json``` block from .out
//   - if smokeImport=ok AND auditorAfter < auditorBefore: stage + commit (one commit per file)
//   - else: revert via `git show HEAD:<file> > <file>`
// On completion: print summary, run final audit, write result JSON.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const cp = await import('node:' + 'child_process');
const { execFileSync, spawnSync } = cp;

const REPO = '/Users/danielpenin/whatsapp_saas-onda0';
const WAVE = process.argv[2] || 'E9';
const SCAN_PREFIX_ARG = process.argv[3] || `pulse-liquefy-${WAVE}-`;
const RUN_DIR_GLOB_PREFIX = SCAN_PREFIX_ARG;
const POLL_MS = 30_000;

function listRunDirs() {
  const root = join(REPO, 'artifacts/opencode-fleet');
  return readdirSync(root)
    .filter((n) => n.startsWith(RUN_DIR_GLOB_PREFIX))
    .map((n) => join(root, n))
    .sort();
}

function git(args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 });
}

function gitSafe(args) {
  const r = spawnSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function audit() {
  const out = spawnSync(
    'backend/node_modules/.bin/ts-node',
    [
      '--transpile-only',
      '--project', 'scripts/pulse/tsconfig.json',
      '-e',
      'process.stdout.write(""+require("./scripts/pulse/no-hardcoded-reality-audit").auditPulseNoHardcodedReality(process.cwd()).findings.length)',
    ],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 },
  );
  if (out.status !== 0) throw new Error('audit failed: ' + out.stderr);
  return Number(out.stdout.trim());
}

function lastJsonBlock(text) {
  const re = /```json\s*([\s\S]*?)```/g;
  let m, last = null;
  while ((m = re.exec(text)) !== null) last = m[1];
  if (!last) {
    const open = text.lastIndexOf('{');
    if (open === -1) return null;
    const candidate = text.slice(open).trim();
    try { return JSON.parse(candidate); } catch { return null; }
  }
  try { return JSON.parse(last); } catch { return null; }
}

function loadManifestTasks(runDir) {
  const local = join(runDir, 'manifest.json');
  if (existsSync(local)) {
    try { return JSON.parse(readFileSync(local, 'utf8')).tasks; } catch {}
  }
  const sib = join(REPO, 'artifacts/pulse-liquefaction', `wave-${WAVE}-manifest.json`);
  if (existsSync(sib)) {
    try { return JSON.parse(readFileSync(sib, 'utf8')).tasks; } catch {}
  }
  return null;
}

function commitFile(file, delta, wave) {
  git(['add', file]);
  const subject = `refactor(pulse-liquefy): ${basename(file)} -${delta} (Wave ${wave})`;
  const body = `Auditor delta (per-file, subagent-reported): -${delta}\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`;
  const r = gitSafe(['commit', '-m', subject, '-m', body]);
  return { ok: r.code === 0, subject, log: (r.stdout + r.stderr).slice(-2000) };
}

function revertFile(file) {
  const head = git(['show', `HEAD:${file}`]);
  writeFileSync(join(REPO, file), head);
}

const runDirs = listRunDirs();
if (runDirs.length === 0) {
  console.error(`[monitor] no run dir matching ${RUN_DIR_GLOB_PREFIX}*`);
  process.exit(1);
}
const RUN_DIR = runDirs[runDirs.length - 1];
console.log('[monitor] watching', RUN_DIR);

const tasks = loadManifestTasks(RUN_DIR) || [];
const expected = tasks.length || null;
console.log('[monitor] expected tasks:', expected ?? 'unknown');

const processed = new Set();
const decisions = [];

async function pollLoop() {
  while (true) {
    const exits = readdirSync(RUN_DIR).filter((n) => n.endsWith('.exit'));
    let made = 0;
    for (const exitFile of exits) {
      const id = exitFile.replace(/\.exit$/, '');
      if (processed.has(id)) continue;
      const outFile = join(RUN_DIR, `${id}.out`);
      if (!existsSync(outFile)) continue;
      const text = readFileSync(outFile, 'utf8');
      const json = lastJsonBlock(text);
      const code = (readFileSync(join(RUN_DIR, exitFile), 'utf8') || '').trim();
      const decision = { id, exitCode: code };
      if (!json) {
        decision.action = 'no-json';
      } else {
        decision.file = json.file;
        decision.smoke = json.smokeImport;
        decision.before = json.auditorBefore;
        decision.after = json.auditorAfter;
        const delta = (json.auditorBefore ?? 0) - (json.auditorAfter ?? 0);
        decision.delta = delta;
        if (!json.file) {
          decision.action = 'no-file';
        } else if (json.smokeImport !== 'ok') {
          decision.action = 'revert-smoke-fail';
          revertFile(json.file);
        } else if (delta <= 0) {
          decision.action = 'revert-no-improvement';
          revertFile(json.file);
        } else {
          const diff = gitSafe(['diff', '--quiet', 'HEAD', '--', json.file]);
          if (diff.code === 0) {
            decision.action = 'noop-unchanged';
          } else {
            const c = commitFile(json.file, delta, WAVE);
            decision.action = c.ok ? 'commit' : 'commit-failed';
            decision.commitLog = c.log;
            if (!c.ok) {
              revertFile(json.file);
              gitSafe(['reset', 'HEAD', json.file]);
            }
          }
        }
      }
      processed.add(id);
      decisions.push(decision);
      made++;
      console.log(`[${new Date().toISOString()}] ${id} → ${decision.action}${decision.file ? ' ' + decision.file : ''}${decision.delta != null ? ' Δ=-' + decision.delta : ''}`);
    }
    if (expected && processed.size >= expected) break;
    if (!expected && exits.length > 0 && made === 0) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const exits2 = readdirSync(RUN_DIR).filter((n) => n.endsWith('.exit'));
      if (exits2.length === exits.length) break;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

await pollLoop();
console.log('[monitor] processing complete:', processed.size, 'tasks');

const finalCount = audit();
console.log('[monitor] final auditor:', finalCount);

const summary = {
  wave: WAVE,
  runDir: RUN_DIR,
  processed: decisions.length,
  finalAuditor: finalCount,
  decisions,
};
mkdirSync(join(REPO, 'artifacts/pulse-liquefaction'), { recursive: true });
writeFileSync(
  join(REPO, `artifacts/pulse-liquefaction/wave-${WAVE}-ceo-summary.json`),
  JSON.stringify(summary, null, 2),
);
console.log('[monitor] summary written →', `artifacts/pulse-liquefaction/wave-${WAVE}-ceo-summary.json`);
