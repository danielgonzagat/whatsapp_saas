// opencode-round-watchdog — process management helpers (extracted).
const { spawnSync } = require('node:child_process');

function psRows() {
  const result = spawnSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' });
  if (result.error) return [];
  return result.stdout
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
      if (!match) return null;
      return { pid: Number(match[1]), ppid: Number(match[2]), command: match[3] };
    })
    .filter(Boolean);
}

function killPid(pid, signal = 'SIGTERM') {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

function killProcessTree(rootPid) {
  const rows = psRows();
  const children = new Map();
  for (const row of rows) {
    if (!children.has(row.ppid)) children.set(row.ppid, []);
    children.get(row.ppid).push(row.pid);
  }
  const stack = [rootPid];
  const all = [];
  while (stack.length) {
    const pid = stack.pop();
    if (!pid || all.includes(pid)) continue;
    all.push(pid);
    for (const child of children.get(pid) || []) stack.push(child);
  }
  for (const pid of all.reverse()) killPid(pid);
  return all;
}

function killContaminants() {
  const needles = [roundDir, normalWorktree, atomicWorktree];
  const killed = [];
  for (const row of psRows()) {
    if (row.pid === process.pid) continue;
    const touchesRound = needles.some((needle) => row.command.includes(needle));
    if (!touchesRound) continue;
    if (/\bcodex exec\b/.test(row.command)) {
      killed.push(...killProcessTree(row.pid));
      continue;
    }
    if (/round_dir=.*atomic-os-benchmark/.test(row.command) && row.command.includes('codex exec')) {
      killed.push(...killProcessTree(row.pid));
    }
  }
  return [...new Set(killed)].sort((a, b) => a - b);
}

module.exports = { psRows, killPid, killProcessTree, killContaminants };
