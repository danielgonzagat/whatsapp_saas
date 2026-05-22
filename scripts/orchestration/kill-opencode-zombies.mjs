#!/usr/bin/env node
/**
 * Zombie killer for opencode/claude subagents that outlived their parent fleet.
 *
 * Triggers in two places:
 *   1. opencode-fleet.mjs runs this BEFORE every fleet to clear orphans from
 *      previous runs (so the new fleet starts with fresh RAM headroom).
 *   2. Stop hook in .claude/settings.json runs this after every Claude turn,
 *      so zombies never accumulate even when fleets crash mid-run.
 *
 * Heuristic — a process is a zombie if ALL of:
 *   - matches opencode-run / claude-subagent regex
 *   - PPID == 1   (orphan)   OR   elapsed > maxAgeSec
 *   - PID is NOT registered in any active fleet pids.json
 *
 * Active fleets are identified by `artifacts/opencode-fleet/<runId>/pids.json`
 * files modified within the last 24h. Any PID listed there is exempt from
 * zombie reaping — the fleet runner is responsible for cleaning up its own
 * children. This prevents the killer from SIGTERMing in-flight subagents that
 * are doing slow work (decomposition, codemods, etc.) just because they
 * crossed the age threshold.
 *
 * Process match — opencode CLI binaries and direct claude --output-format
 * subagent invocations. Interactive `claude` (your main session) is preserved
 * by requiring the --output-format flag (only subagent invocations carry it).
 *
 * Output: prints JSON summary to stdout, never throws — safe for hooks.
 *
 * Usage:
 *   node scripts/orchestration/kill-opencode-zombies.mjs           # default 2h
 *   node scripts/orchestration/kill-opencode-zombies.mjs --max-age=3600
 *   node scripts/orchestration/kill-opencode-zombies.mjs --dry-run
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const FLEET_ARTIFACTS = join(REPO_ROOT, 'artifacts', 'opencode-fleet');
const ACTIVE_FLEET_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const maxAgeArg = argv.find((a) => a.startsWith('--max-age='));
const maxAgeSec = maxAgeArg ? Number(maxAgeArg.split('=')[1]) : 7200;

/**
 * Collect every PID currently registered as "active" by any recent fleet run.
 * Fleet runners write pids.json into their runDir as they spawn children and
 * remove entries on child exit. Files older than 24h are ignored (stale).
 * Never throws — a missing/corrupt file just means "no exemption from there".
 */
function loadActiveFleetPids() {
  const exempt = new Set();
  let dirs;
  try {
    dirs = readdirSync(FLEET_ARTIFACTS, { withFileTypes: true });
  } catch {
    return exempt;
  }
  const cutoff = Date.now() - ACTIVE_FLEET_WINDOW_MS;
  for (const d of dirs) {
    if (!d.isDirectory()) {continue;}
    const pidsPath = join(FLEET_ARTIFACTS, d.name, 'pids.json');
    let st;
    try {
      st = statSync(pidsPath);
    } catch {
      continue;
    }
    if (st.mtimeMs < cutoff) {continue;}
    try {
      const data = JSON.parse(readFileSync(pidsPath, 'utf8'));
      if (Array.isArray(data?.pids)) {
        for (const pid of data.pids) {
          if (Number.isFinite(pid)) {exempt.add(Number(pid));}
        }
      }
    } catch {
      /* corrupt file — ignore, do not crash the killer */
    }
  }
  return exempt;
}

function parseEtime(etime) {
  // ps etime formats: SS, MM:SS, HH:MM:SS, DD-HH:MM:SS
  const parts = etime.trim().split('-');
  let days = 0;
  let rest = parts[0];
  if (parts.length === 2) {
    days = Number(parts[0]);
    rest = parts[1];
  }
  const segs = rest.split(':').map(Number);
  let h = 0;
  let m = 0;
  let s = 0;
  if (segs.length === 3) {[h, m, s] = segs;}
  else if (segs.length === 2) {[m, s] = segs;}
  else if (segs.length === 1) {[s] = segs;}
  return days * 86400 + h * 3600 + m * 60 + s;
}

function listCandidates() {
  const raw = execFileSync('ps', ['-axo', 'pid=,ppid=,etime=,command='], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const myPid = process.pid;
  const myPpid = process.ppid;
  const candidates = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) {continue;}
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    if (!m) {continue;}
    const pid = Number(m[1]);
    const ppid = Number(m[2]);
    const etime = m[3];
    const cmd = m[4];
    if (pid === myPid || pid === myPpid) {continue;}
    const isOpencode =
      /\bopencode(-ai)?\b.*\brun\b/.test(cmd) || /\.opencode\/bin\/\.opencode\b/.test(cmd);
    const isClaudeSubagent = /\bclaude\b.*--output-format\b/.test(cmd);
    if (!isOpencode && !isClaudeSubagent) {continue;}
    candidates.push({ pid, ppid, etimeSec: parseEtime(etime), cmd: cmd.slice(0, 120) });
  }
  return candidates;
}

function isZombie(p) {
  if (p.ppid === 1) {return 'orphan';}
  if (p.etimeSec > maxAgeSec) {return 'aged';}
  return null;
}

function killPid(pid) {
  try {
    process.kill(pid, 'SIGTERM');
    return 'SIGTERM';
  } catch {
    return 'gone';
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const exemptPids = loadActiveFleetPids();
  const candidates = listCandidates();
  const zombies = candidates
    .filter((p) => !exemptPids.has(p.pid))
    .map((p) => ({ ...p, reason: isZombie(p) }))
    .filter((p) => p.reason);

  const results = [];
  if (!dryRun) {
    for (const z of zombies) {
      results.push({ pid: z.pid, reason: z.reason, action: killPid(z.pid), cmd: z.cmd });
    }
    if (zombies.length) {
      await sleep(3000);
      for (const z of zombies) {
        try {
          process.kill(z.pid, 0);
          try {
            process.kill(z.pid, 'SIGKILL');
            const r = results.find((x) => x.pid === z.pid);
            if (r) {r.action = 'SIGKILL';}
          } catch {
            /* already gone */
          }
        } catch {
          /* gone */
        }
      }
    }
  } else {
    for (const z of zombies)
      {results.push({ pid: z.pid, reason: z.reason, action: 'dry-run', cmd: z.cmd });}
  }

  const summary = {
    scannedAt: new Date().toISOString(),
    maxAgeSec,
    dryRun,
    candidates: candidates.length,
    exemptedActiveFleet: exemptPids.size,
    zombies: zombies.length,
    killed: results,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((err) => {
  process.stderr.write(`kill-opencode-zombies: ${err.message}\n`);
  process.exit(0);
});
