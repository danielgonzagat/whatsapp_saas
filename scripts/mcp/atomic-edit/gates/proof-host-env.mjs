import fs from 'node:fs';
import path from 'node:path';

function stateCandidates(repoRoot) {
  const candidates = new Set();
  for (const value of [process.env.ATOMIC_HOST_WRITE_ROOT, process.env.CODEX_PROJECT_DIR, repoRoot]) {
    if (value) candidates.add(path.resolve(value));
  }
  return [...candidates];
}

function readBrokerState(repoRoot) {
  for (const root of stateCandidates(repoRoot)) {
    const statePath = path.join(root, '.atomic', 'codex-broker-current.json');
    try {
      const payload = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (payload?.agent === 'codex' && typeof payload.repoRoot === 'string') return payload;
    } catch {
      // Broker state is optional outside hosted proof runs.
    }
  }
  return null;
}

export function inheritedAtomicHostEnv(repoRoot) {
  const state = readBrokerState(repoRoot);
  const stateSocket = typeof state?.socket === 'string' && fs.existsSync(state.socket) ? state.socket : '';
  const socket = process.env.ATOMIC_EXEC_BROKER_SOCKET || stateSocket;
  const stateRoot = typeof state?.repoRoot === 'string' ? state.repoRoot : '';
  const hostRoot = path.resolve(stateRoot || process.env.ATOMIC_HOST_WRITE_ROOT || repoRoot);
  return {
    ATOMIC_HOST_SANDBOX: process.env.ATOMIC_HOST_SANDBOX || (socket ? 'macos-sandbox-exec' : ''),
    ATOMIC_HOST_ATOMIC_ONLY: process.env.ATOMIC_HOST_ATOMIC_ONLY || (socket ? '1' : ''),
    ATOMIC_HOST_WRITE_ROOT: hostRoot,
    ATOMIC_EXEC_BROKER_SOCKET: socket,
    CODEX_PROJECT_DIR: hostRoot,
    CODEX_HOME: process.env.CODEX_HOME || path.join(process.env.HOME || '', '.codex'),
    TMPDIR: hostRoot,
    TMP: hostRoot,
    TEMP: hostRoot,
  };
}

export function installInheritedAtomicHostEnv(repoRoot) {
  const env = inheritedAtomicHostEnv(repoRoot);
  for (const [key, value] of Object.entries(env)) {
    if (value && !process.env[key]) process.env[key] = value;
  }
  return env;
}

export function inheritedBrokerSocketFromState(repoRoot) {
  return installInheritedAtomicHostEnv(repoRoot).ATOMIC_EXEC_BROKER_SOCKET || null;
}
