#!/usr/bin/env node
/**
 * Proof: the Claude whole-host launcher enforces the mandatory boundary AND
 * emits the exact certificate witness env.
 *
 * Runs `node -e <probe>` THROUGH claude-atomic-host-launcher.mjs (sandbox-exec
 * wraps it) and asserts the Claude-specific boundary:
 *   1. write inside repo root          → must SUCCEED
 *   2. write inside ~/.claude          → must SUCCEED (required runtime carve-out)
 *   3. write to home root (outside)    → must FAIL (EPERM)
 *   4. write to /etc (outside)         → must FAIL (EPERM)
 *   5. witness env in child            → ATOMIC_HOST_SANDBOX===macos-sandbox-exec
 *                                         AND ATOMIC_HOST_ATOMIC_ONLY===1
 *                                         (this is EXACTLY what the whole-host
 *                                          certificate reads to flip GREEN)
 *
 * Network is ALLOWED by design (Claude reasoning is the remote Anthropic API),
 * so — unlike the codex launcher proof — this proof does NOT assert network
 * denial; it records the network result informationally only.
 *
 * Honest scope: this proves the LAUNCHER's profile + witness. It does NOT prove
 * the already-running process is sandboxed — that is only true after Claude is
 * relaunched through this launcher, which is what the certificate then reads.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const launcher = path.join(__dirname, '..', 'claude-atomic-host-launcher.mjs');

function launch(scriptBody) {
  return spawnSync('node', [launcher, 'node', '-e', scriptBody], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
}

const repoProbe = path.join(REPO_ROOT, `.claude-launch-${process.pid}.tmp`);
const claudeProbe = path.join(os.homedir(), '.claude', `.claude-launch-${process.pid}.tmp`);
const homeProbe = path.join(os.homedir(), `.claude-launch-forbidden-${process.pid}.tmp`);
const etcProbe = `/etc/.claude-launch-forbidden-${process.pid}.tmp`;
const writeBody = (p) => `require('fs').writeFileSync(${JSON.stringify(p)}, 'x')`;

function main() {
  const results = [];
  if (!existsSync(launcher)) {
    return { ok: false, error: `launcher missing: ${launcher}` };
  }
  const r1 = launch(writeBody(repoProbe));
  results.push({ name: 'repo write allowed', ok: r1.status === 0, status: r1.status });
  const r2 = launch(writeBody(claudeProbe));
  results.push({ name: '~/.claude write allowed', ok: r2.status === 0, status: r2.status });
  const r3 = launch(writeBody(homeProbe));
  results.push({
    name: 'home-root write denied',
    ok: r3.status !== 0 && !existsSync(homeProbe),
    status: r3.status,
  });
  const r4 = launch(writeBody(etcProbe));
  results.push({
    name: '/etc write denied',
    ok: r4.status !== 0 && !existsSync(etcProbe),
    status: r4.status,
  });
  const r5 = launch(
    "process.stdout.write(process.env.ATOMIC_HOST_SANDBOX+'|'+process.env.ATOMIC_HOST_ATOMIC_ONLY)",
  );
  results.push({
    name: 'cert witness env propagated (macos-sandbox-exec|1)',
    ok: (r5.stdout || '').trim() === 'macos-sandbox-exec|1',
    value: (r5.stdout || '').trim(),
  });
  // info-only: network allowed by design (not a hard assertion)
  const netBody =
    "const net=require('net');const s=net.connect(443,'1.1.1.1');s.on('error',()=>{process.exit(7)});s.on('connect',()=>{s.destroy();process.exit(0)});setTimeout(()=>process.exit(0),1500);";
  const rNet = launch(netBody);
  results.push({
    name: 'network allowed by design (info only)',
    ok: true,
    info: rNet.status === 7 ? 'connect-failed-or-no-route' : 'allowed/connected',
    status: rNet.status,
  });
  for (const p of [repoProbe, claudeProbe, homeProbe, etcProbe]) {
    try {
      rmSync(p);
    } catch {
      /* best-effort cleanup */
    }
  }
  const hard = results.filter((r) => !r.name.includes('info only'));
  return { ok: hard.every((r) => r.ok), agent: 'claude', launcher, results };
}

const payload = main();
if (jsonMode) console.log(JSON.stringify(payload, null, 2));
else if (!payload.ok) console.error(JSON.stringify(payload, null, 2));
process.exit(payload.ok ? 0 : 1);
