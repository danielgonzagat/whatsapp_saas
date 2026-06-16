import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function stateCandidates(repoRoot) {
  const candidates = new Set();
  for (const value of [process.env.ATOMIC_HOST_WRITE_ROOT, process.env.CODEX_PROJECT_DIR, repoRoot]) {
    if (value) candidates.add(path.resolve(value));
  }
  return [...candidates];
}

function brokerEndpointReady(endpoint) {
  const value = typeof endpoint === 'string' ? endpoint.trim() : '';
  if (!value) return false;
  if (value.startsWith('file://')) {
    try {
      const dir = fileURLToPath(value);
      return fs.existsSync(path.join(dir, 'requests')) && fs.existsSync(path.join(dir, 'responses'));
    } catch {
      return false;
    }
  }
  try {
    return fs.statSync(value).isSocket();
  } catch {
    return false;
  }
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

function currentProofRequiresInheritedBroker() {
  const entry = process.argv[1] || '';
  return [
    'atomic-exec-readonly-usability.proof.mjs',
    'atomic-exec-sandbox.proof.mjs',
    'atomic-exec-prove-effect-required.proof.mjs',
    'external-runtime-denial.proof.mjs',
    'mcp-launcher-host-boundary.proof.mjs',
    'compiled-mcp-y-certificate.proof.mjs',
  ].some((name) => entry.includes(name));
}

export function inheritedAtomicHostEnv(repoRoot) {
  const state = readBrokerState(repoRoot);
  const nestedBrokerCommand = Boolean(process.env.ATOMIC_EXEC_BROKER_ROOT);
  const allowNestedBroker =
    process.env.ATOMIC_ALLOW_NESTED_PROOF_BROKER === '1' || currentProofRequiresInheritedBroker();
  const suppressInheritedBroker = nestedBrokerCommand && !allowNestedBroker;
  const explicitSocket = suppressInheritedBroker ? '' : process.env.ATOMIC_EXEC_BROKER_SOCKET || '';
  const stateSocket = !suppressInheritedBroker && brokerEndpointReady(state?.socket) ? state.socket : '';
  const socket = explicitSocket || stateSocket;
  const stateRoot = typeof state?.repoRoot === 'string' ? state.repoRoot : '';
  const hostRoot = path.resolve(stateRoot || process.env.ATOMIC_HOST_WRITE_ROOT || repoRoot);
  const tempRoot = socket ? hostRoot : process.cwd();
  return {
    ATOMIC_HOST_SANDBOX: suppressInheritedBroker ? '' : process.env.ATOMIC_HOST_SANDBOX || (socket ? 'macos-sandbox-exec' : ''),
    ATOMIC_HOST_ATOMIC_ONLY: suppressInheritedBroker ? '' : process.env.ATOMIC_HOST_ATOMIC_ONLY || (socket ? '1' : ''),
    ATOMIC_HOST_WRITE_ROOT: hostRoot,
    ATOMIC_EXEC_BROKER_SOCKET: socket,
    ATOMIC_EXEC_BROKER_ROOT: '',
    ATOMIC_ALLOW_NESTED_PROOF_BROKER: socket ? '1' : '',
    CODEX_PROJECT_DIR: hostRoot,
    CODEX_HOME: process.env.CODEX_HOME || path.join(process.env.HOME || '', '.codex'),
    TMPDIR: tempRoot,
    TMP: tempRoot,
    TEMP: tempRoot,
  };
}

export function installInheritedAtomicHostEnv(repoRoot) {
  const env = inheritedAtomicHostEnv(repoRoot);
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }
  return env;
}

export function inheritedBrokerSocketFromState(repoRoot) {
  return installInheritedAtomicHostEnv(repoRoot).ATOMIC_EXEC_BROKER_SOCKET || null;
}
