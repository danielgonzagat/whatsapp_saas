// opencode-round-watchdog — toolchain sync + lane isolation (extracted).
const fs = require('node:fs');
const path = require('node:path');
const {
  coordinatorRoot,
  normalWorktree,
  atomicToolchainPaths,
  worktreeNodeModuleLinks,
  syncAtomicToolchainEnabled,
} = require('./opencode-round-watchdog.config.cjs');

function syncAtomicToolchainFile(relativePath, worktreeRoot) {
  const source = path.join(coordinatorRoot, relativePath);
  const destination = path.join(worktreeRoot, relativePath);
  if (!fs.existsSync(source)) return null;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true, dereference: false });
  return relativePath;
}

function syncAtomicToolchain(worktreeRoot) {
  if (!syncAtomicToolchainEnabled) return [];
  const synced = [];
  for (const relativePath of atomicToolchainPaths) {
    const copied = syncAtomicToolchainFile(relativePath, worktreeRoot);
    if (copied) synced.push(copied);
  }
  return synced;
}

function linkWorktreeDependencies(worktreeRoot) {
  const linked = [];
  for (const relativePath of worktreeNodeModuleLinks) {
    const source = path.join(coordinatorRoot, relativePath);
    const destination = path.join(worktreeRoot, relativePath);
    if (!fs.existsSync(source) || fs.existsSync(destination)) continue;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.symlinkSync(source, destination, 'dir');
    linked.push(relativePath);
  }
  return linked;
}

function writeMinimalOpenCodeConfig(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ permission: { edit: 'allow' }, instructions: [] }, null, 2) + '\n');
}

function moveGeneratedPath(source, label) {
  let destination = path.join(roundDir, label);
  let suffix = 0;
  while (fs.existsSync(destination)) {
    suffix += 1;
    destination = path.join(roundDir, label + '-' + suffix);
  }
  fs.renameSync(source, destination);
  return destination;
}

function prepareNormalLaneIsolation() {
  const backupSuffix = '.__atomic_benchmark_backup';
  const localConfig = path.join(normalWorktree, 'opencode.json');
  const localConfigBackup = path.join(normalWorktree, 'opencode.json' + backupSuffix);
  const localOpenCode = path.join(normalWorktree, '.opencode');
  const localOpenCodeBackup = path.join(normalWorktree, '.opencode' + backupSuffix);
  if (fs.existsSync(localConfigBackup) || fs.existsSync(localOpenCodeBackup)) {
    throw new Error('stale normal OpenCode isolation backup exists; refusing to overwrite benchmark state');
  }
  const xdgRoot = path.join(roundDir, 'normal-opencode-xdg');
  const xdgConfig = path.join(xdgRoot, 'opencode', 'opencode.json');
  const hadLocalConfig = fs.existsSync(localConfig);
  const hadLocalOpenCode = fs.existsSync(localOpenCode);
  if (hadLocalConfig) {
    fs.copyFileSync(localConfig, path.join(roundDir, 'normal-opencode.original.json'));
    fs.renameSync(localConfig, localConfigBackup);
  }
  if (hadLocalOpenCode) fs.renameSync(localOpenCode, localOpenCodeBackup);
  writeMinimalOpenCodeConfig(localConfig);
  writeMinimalOpenCodeConfig(xdgConfig);
  return {
    enabled: true,
    xdgRoot,
    localConfig,
    localConfigBackup,
    localOpenCode,
    localOpenCodeBackup,
    hadLocalConfig,
    hadLocalOpenCode,
    generatedMoves: [],
    restored: false,
    restoreError: null,
  };
}

function restoreNormalLaneIsolation(isolation) {
  if (!isolation || isolation.restored) return;
  try {
    if (fs.existsSync(isolation.localConfig)) fs.unlinkSync(isolation.localConfig);
    if (isolation.hadLocalConfig && fs.existsSync(isolation.localConfigBackup)) {
      fs.renameSync(isolation.localConfigBackup, isolation.localConfig);
    }
    if (fs.existsSync(isolation.localOpenCode)) {
      isolation.generatedMoves.push(moveGeneratedPath(isolation.localOpenCode, 'normal-opencode-generated-after-isolation'));
    }
    if (isolation.hadLocalOpenCode && fs.existsSync(isolation.localOpenCodeBackup)) {
      fs.renameSync(isolation.localOpenCodeBackup, isolation.localOpenCode);
    }
    isolation.restored = true;
  } catch (error) {
    isolation.restoreError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

module.exports = {
  syncAtomicToolchainFile,
  syncAtomicToolchain,
  linkWorktreeDependencies,
  writeMinimalOpenCodeConfig,
  moveGeneratedPath,
  prepareNormalLaneIsolation,
  restoreNormalLaneIsolation,
};
