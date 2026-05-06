import {
  readdirSync,
  statSync,
  writeFileSync,
  unlinkSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

import { REPO_ROOT, PID_FILE, WATCH_FILE_EXTENSIONS, IGNORE_SEGMENTS } from './constants.mjs';
import { runOnce, printStatus } from './pipeline.mjs';

export function hashSourceTree() {
  const hash = createHash('sha256');
  const files = [];
  const stack = [REPO_ROOT];

  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!IGNORE_SEGMENTS.has(e.name)) {
          stack.push(p);
        }
        continue;
      }
      if (e.isFile()) {
        const ext = p.slice(p.lastIndexOf('.')).toLowerCase();
        if (WATCH_FILE_EXTENSIONS.has(ext)) {
          const rel = relative(REPO_ROOT, p);
          files.push(rel);
        }
      }
    }
  }

  files.sort();

  for (const rel of files) {
    const abs = join(REPO_ROOT, rel);
    try {
      const s = statSync(abs);
      hash.update(`${rel}:${s.mtimeMs}:${s.size}\n`);
    } catch {
      hash.update(`${rel}:missing\n`);
    }
  }

  return hash.digest('hex');
}

export function writePid() {
  writeFileSync(PID_FILE, String(process.pid), 'utf8');
}

export function removePid() {
  try {
    unlinkSync(PID_FILE);
  } catch {
    // ignore
  }
}

export function handleExit() {
  removePid();
}

export function runWatch(minutes) {
  if (existsSync(PID_FILE)) {
    const existing = readFileSync(PID_FILE, 'utf8').trim();
    try {
      process.kill(Number(existing), 0);
      process.stderr.write(`HUD orchestrator: already running (PID ${existing})\n`);
      process.exit(1);
    } catch {
      removePid();
    }
  }

  writePid();
  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);

  const intervalMs = minutes * 60_000;
  let lastHash = '';

  process.stderr.write(`HUD orchestrator: watching every ${minutes}m (PID ${process.pid})\n`);

  function tick() {
    const currentHash = hashSourceTree();
    if (currentHash === lastHash && lastHash !== '') {
      process.stderr.write(`  [${new Date().toISOString()}] no changes detected\n`);
      return;
    }

    lastHash = currentHash;
    process.stderr.write(`  [${new Date().toISOString()}] changes detected, running --once...\n`);
    const report = runOnce(false);
    printStatus(report);

    if (report.hardFail) {
      process.stderr.write(`  HUD orchestrator: hard failure, continuing watch loop\n`);
    }
  }

  tick();
  setInterval(tick, intervalMs);
}
