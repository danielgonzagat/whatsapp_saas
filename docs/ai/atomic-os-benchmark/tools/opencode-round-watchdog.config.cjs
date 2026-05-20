// opencode-round-watchdog — CLI/env config (extracted so siblings can share).
const path = require('node:path');

function usage() {
  console.error(
    'Usage: opencode-round-watchdog.cjs --round-dir <dir> --normal-worktree <dir> --atomic-worktree <dir> --normal-prompt <file> --atomic-prompt <file> --idle-ms <ms> --max-ms <ms> --poll-ms <ms> --model <provider/model>',
  );
  process.exit(2);
}

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function flagEnabled(name, envName) {
  const index = process.argv.indexOf(name);
  if (index !== -1) {
    const next = process.argv[index + 1] || '';
    if (!next || next.startsWith('--')) return true;
    return ['1', 'true', 'yes', 'on'].includes(next.toLowerCase());
  }
  const envValue = process.env[envName] || '';
  return ['1', 'true', 'yes', 'on'].includes(envValue.toLowerCase());
}

function policyValue(flag, envName) {
  const value = arg(flag, process.env[envName] || '');
  if (!value)
    throw new Error(flag + ' or ' + envName + ' must be supplied by the benchmark policy compiler');
  return value;
}

function policyNumber(flag, envName) {
  const value = Number(policyValue(flag, envName));
  if (!Number.isFinite(value) || value <= 0) throw new Error(flag + ' must be a positive number');
  return value;
}

function absolute(value, label) {
  if (!value) usage();
  const resolved = path.resolve(value);
  if (!path.isAbsolute(resolved)) throw new Error(label + ' must resolve to an absolute path');
  return resolved;
}

const roundDir = absolute(arg('--round-dir'), 'round-dir');
const normalWorktree = absolute(arg('--normal-worktree'), 'normal-worktree');
const atomicWorktree = absolute(arg('--atomic-worktree'), 'atomic-worktree');
const normalPromptFile = absolute(arg('--normal-prompt'), 'normal-prompt');
const atomicPromptFile = absolute(arg('--atomic-prompt'), 'atomic-prompt');
const idleMs = policyNumber('--idle-ms', 'ATOMIC_WATCHDOG_IDLE_MS');
const maxMs = policyNumber('--max-ms', 'ATOMIC_WATCHDOG_MAX_MS');
const model = policyValue('--model', 'ATOMIC_WATCHDOG_MODEL');
const pollMs = policyNumber('--poll-ms', 'ATOMIC_WATCHDOG_POLL_MS');
const defaultVariant = arg('--variant', process.env.ATOMIC_WATCHDOG_VARIANT || 'max');
const normalVariant = arg('--normal-variant', process.env.ATOMIC_WATCHDOG_NORMAL_VARIANT || defaultVariant);
const atomicVariant = arg('--atomic-variant', process.env.ATOMIC_WATCHDOG_ATOMIC_VARIANT || defaultVariant);
const coordinatorRoot = path.resolve(__dirname, '..', '..', '..', '..');
const syncAtomicToolchainEnabled = flagEnabled('--sync-atomic-toolchain', 'ATOMIC_SYNC_TOOLCHAIN');
const minifyAtomicPromptEnabled = flagEnabled('--minify-atomic-prompt', 'ATOMIC_MINIFY_ATOMIC_PROMPT');
const atomicCommandMode = arg('--atomic-command-mode', process.env.ATOMIC_COMMAND_MODE || 'prompt');
const atomicToolchainPaths = (process.env.ATOMIC_TOOLCHAIN_PATHS || '')
  .split(path.delimiter)
  .map((value) => value.trim())
  .filter(Boolean);
const worktreeNodeModuleLinks = (process.env.ATOMIC_WORKTREE_NODE_MODULE_LINKS || 'node_modules:backend/node_modules')
  .split(path.delimiter)
  .map((value) => value.trim())
  .filter(Boolean);
const atomicCallToolSegments = ['docs', 'ai', 'atomic-os-benchmark', 'tools', 'atomic-call.cjs'];

function atomicCallToolPath(root) {
  return path.join(root, ...atomicCallToolSegments);
}

module.exports = {
  usage,
  arg,
  flagEnabled,
  policyValue,
  policyNumber,
  absolute,
  roundDir,
  normalWorktree,
  atomicWorktree,
  normalPromptFile,
  atomicPromptFile,
  idleMs,
  maxMs,
  model,
  pollMs,
  defaultVariant,
  normalVariant,
  atomicVariant,
  coordinatorRoot,
  syncAtomicToolchainEnabled,
  minifyAtomicPromptEnabled,
  atomicCommandMode,
  atomicToolchainPaths,
  worktreeNodeModuleLinks,
  atomicCallToolSegments,
  atomicCallToolPath,
};
