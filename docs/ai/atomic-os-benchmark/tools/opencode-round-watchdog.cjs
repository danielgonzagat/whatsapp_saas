#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

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
  if (!value) throw new Error(flag + ' or ' + envName + ' must be supplied by the benchmark policy compiler');
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
if (syncAtomicToolchainEnabled && atomicToolchainPaths.length === 0) {
  throw new Error('ATOMIC_TOOLCHAIN_PATHS must be supplied when toolchain sync is enabled');
}

function readPrompt(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) throw new Error('empty prompt: ' + file);
  return text;
}

function firstShellCommandBlock(text) {
  const match = String(text || '').match(/```(?:sh|bash|shell)\n([\s\S]*?)\n```/i);
  return match ? match[1].trim() : '';
}

function compileAtomicFastPrompt(prompt) {
  const command = firstShellCommandBlock(prompt);
  if (!command) return prompt;
  return [
    'Run the exact shell command below immediately as your first tool call.',
    'Do not inspect files first. Do not use native file tools. Do not rewrite the command.',
    'After it finishes, report only ok/fail, validation status, trace count if visible, and residual risk.',
    '',
    '```sh',
    command,
    '```',
  ].join('\n');
}

function shellQuote(value) {
  return "'" + String(value).replaceAll("'", "'\"'\"'") + "'";
}

function prepareAtomicPrepromptCommand(worktreeRoot, promptFile) {
  const rawPrompt = readPrompt(promptFile);
  const command = firstShellCommandBlock(rawPrompt);
  if (!command) throw new Error('atomic preprompt command mode requires a shell command block in the atomic prompt');

  const commandName = 'atomic-benchmark-fastpath';
  const commandTextFile = path.join(roundDir, 'opencode-atomic-preprompt-command.txt');
  const runnerFile = path.join(roundDir, 'opencode-atomic-preprompt-runner.sh');
  const commandFile = path.join(worktreeRoot, '.opencode', 'commands', commandName + '.md');

  fs.writeFileSync(commandTextFile, command + '\n');
  fs.writeFileSync(runnerFile, [
    '#!/usr/bin/env bash',
    'set -u',
    ': "${ATOMIC_OS_FAST_COMMAND_FILE:?}"',
    ': "${ATOMIC_OS_ROUND_DIR:?}"',
    'lane="${ATOMIC_OS_LANE:-atomic}"',
    'worktree="${ATOMIC_OS_WORKTREE:-$PWD}"',
    'start_file="$ATOMIC_OS_ROUND_DIR/opencode-${lane}-preprompt-start-ms.txt"',
    'end_file="$ATOMIC_OS_ROUND_DIR/opencode-${lane}-preprompt-end-ms.txt"',
    'exit_file="$ATOMIC_OS_ROUND_DIR/opencode-${lane}-preprompt-exit.txt"',
    'output_file="$ATOMIC_OS_ROUND_DIR/opencode-${lane}-preprompt-output.log"',
    "timestamp_ms() { node -e 'process.stdout.write(String(Date.now()))'; }",
    'timestamp_ms > "$start_file"',
    'command_text="$(cat "$ATOMIC_OS_FAST_COMMAND_FILE")"',
    'bash -lc "$command_text" > "$output_file" 2>&1',
    'rc=$?',
    'timestamp_ms > "$end_file"',
    "printf '%s\\n' \"$rc\" > \"$exit_file\"",
    'output_bytes=$(wc -c < "$output_file" | tr -d " ")',
    "printf 'ATOMIC_PREPROMPT_EXIT=%s\\n' \"$rc\"",
    "printf 'ATOMIC_PREPROMPT_OUTPUT_FILE=%s\\n' \"$output_file\"",
    "printf 'ATOMIC_PREPROMPT_OUTPUT_BYTES=%s\\n' \"$output_bytes\"",
    'if [ "$rc" -eq 0 ]; then',
    '  trace_count=$(find "$worktree/.atomic/traces" -type f -name "*.json" 2>/dev/null | wc -l | tr -d " ")',
    "  printf 'ATOMIC_PREPROMPT_VALIDATION=passed\\n'",
    "  printf 'ATOMIC_PREPROMPT_TRACE_COUNT=%s\\n' \"$trace_count\"",
    "  printf 'ATOMIC_PREPROMPT_SUMMARY=success output compacted; full audit remains in output file\\n'",
    'else',
    "  printf 'ATOMIC_PREPROMPT_FAILURE_TAIL_BEGIN\\n'",
    '  tail -n 120 "$output_file"',
    "  printf 'ATOMIC_PREPROMPT_FAILURE_TAIL_END\\n'",
    'fi',
    'exit "$rc"',
    '',
  ].join('\n'));
  fs.chmodSync(runnerFile, 0o755);

  fs.mkdirSync(path.dirname(commandFile), { recursive: true });
  fs.writeFileSync(commandFile, [
    '---',
    'description: Execute the benchmark Atomic macro operator before model reasoning',
    '---',
    '',
    'Atomic benchmark macro output:',
    '!`ATOMIC_OS_FAST_COMMAND_FILE=' + shellQuote(commandTextFile) + ' ATOMIC_OS_ROUND_DIR=' + shellQuote(roundDir) + ' ATOMIC_OS_LANE=atomic ATOMIC_OS_WORKTREE=' + shellQuote(worktreeRoot) + ' bash ' + shellQuote(runnerFile) + '`',
    '',
    'Report only ATOMIC_PREPROMPT_EXIT, ATOMIC_PREPROMPT_VALIDATION, ATOMIC_PREPROMPT_TRACE_COUNT, and residual risk. Do not open the output file or run extra tools unless the macro output clearly failed.',
    '',
  ].join('\n'));

  return { commandName, commandFile, commandTextFile, runnerFile };
}

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

function fileSize(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function observedLaneSize(lane) {
  const prepromptOutput = path.join(roundDir, 'opencode-' + lane.name + '-preprompt-output.log');
  return fileSize(lane.outFile) + fileSize(prepromptOutput);
}

function writeJson(file, payload) {
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
}

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

function readJsonlLoose(file) {
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8').replace(/\0/g, '').trim();
  } catch {
    return [];
  }
  if (!text) return [];
  const events = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {}
  }
  return events;
}

function findForbiddenNormalUse(lane) {
  const forbiddenCommand = /atomic-call[.]cjs|scripts[/]mcp[/]atomic-edit|[.]atomic[/]traces|docs[/]ai[/]traces/;
  const forbiddenInput = /atomic-edit_|atomic-call[.]cjs|scripts[/]mcp[/]atomic-edit/;
  const events = readJsonlLoose(lane.outFile);
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const tool = String(event.part?.tool || event.item?.tool || event.tool || '');
    if (tool.startsWith('atomic-edit_')) {
      return { eventIndex: index, kind: 'atomic_mcp_tool', tool };
    }
    const command = String(event.part?.state?.input?.command || event.item?.command || '');
    if (forbiddenCommand.test(command)) {
      return { eventIndex: index, kind: 'atomic_command_or_trace_access', command: command.slice(0, 500) };
    }
    const input = JSON.stringify(event.part?.state?.input || event.item?.input || {});
    if (forbiddenInput.test(input)) {
      return { eventIndex: index, kind: 'atomic_tool_input', tool, input: input.slice(0, 500) };
    }
  }
  return null;
}

function commandPinsAtomicWorktree(command) {
  return (
    command.includes('cd ' + atomicWorktree) &&
    command.includes('ATOMIC_OS_REPO_ROOT=' + atomicWorktree) &&
    command.includes(atomicCallToolPath(atomicWorktree))
  );
}

function findAtomicWorktreeEscape(lane) {
  const events = readJsonlLoose(lane.outFile);
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const command = String(event.part?.state?.input?.command || event.item?.command || '');
    if (!command.includes('atomic-call.cjs')) continue;
    const workdir = String(event.part?.state?.input?.workdir || event.item?.cwd || '');
    const workdirOk = workdir && path.resolve(workdir) === atomicWorktree;
    if (!workdirOk && !commandPinsAtomicWorktree(command)) {
      return {
        eventIndex: index,
        kind: 'atomic_worktree_escape',
        workdir: workdir || null,
        expectedWorktree: atomicWorktree,
        command: command.slice(0, 500),
      };
    }
  }
  return null;
}

function startLane(name, worktree, promptFile, options = {}) {
  const rawPrompt = options.commandName ? '' : readPrompt(promptFile);
  const prompt = typeof options.promptTransform === 'function'
    ? options.promptTransform(rawPrompt)
    : rawPrompt;
  const outFile = path.join(roundDir, 'opencode-' + name + '-events.jsonl');
  const errFile = path.join(roundDir, 'opencode-' + name + '-stderr.log');
  const out = fs.openSync(outFile, 'w');
  const err = fs.openSync(errFile, 'w');
  const runArgs = [
    'run',
    '--pure',
    '--model',
    model,
    '--variant',
    options.variant || defaultVariant,
    '--format',
    'json',
    '--print-logs',
    '--log-level',
    'WARN',
    '--dir',
    worktree,
    '--dangerously-skip-permissions',
  ];
  if (options.commandName) {
    runArgs.push('--command', options.commandName, ...(options.commandArgs || []));
  } else {
    runArgs.push(prompt);
  }
  const startedAt = Date.now();
  const child = spawn(
    'opencode',
    runArgs,
    { cwd: worktree, env: { ...process.env, ...(options.env || {}) }, stdio: ['ignore', out, err] },
  );
  return {
    name,
    child,
    out,
    err,
    outFile,
    errFile,
    startedAt,
    lastGrowthAt: startedAt,
    lastSize: 0,
    status: 'running',
    exitCode: null,
    signal: null,
    cleanup: typeof options.cleanup === 'function' ? options.cleanup : null,
    cleanupError: null,
    forbiddenUse: null,
  };
}

function closeLane(lane) {
  for (const fd of [lane.out, lane.err]) {
    try {
      fs.closeSync(fd);
    } catch {}
  }
  if (lane.cleanup) {
    try {
      lane.cleanup();
    } catch (error) {
      lane.cleanupError = error instanceof Error ? error.message : String(error);
    }
  }
}

function main() {
  fs.mkdirSync(roundDir, { recursive: true });
  const statusFile = path.join(roundDir, 'opencode-watchdog-status.json');
  const normalIsolation = prepareNormalLaneIsolation();
  const linkedDependencies = {
    normal: linkWorktreeDependencies(normalWorktree),
    atomic: linkWorktreeDependencies(atomicWorktree),
  };
  const syncedAtomicToolchain = syncAtomicToolchain(atomicWorktree);
  const atomicPrepromptCommand = atomicCommandMode === 'preprompt-shell'
    ? prepareAtomicPrepromptCommand(atomicWorktree, atomicPromptFile)
    : null;
  const initialKilled = killContaminants();
  let lanes;
  try {
    lanes = [
      startLane('normal', normalWorktree, normalPromptFile, {
        variant: normalVariant,
        env: { XDG_CONFIG_HOME: normalIsolation.xdgRoot },
        cleanup: () => restoreNormalLaneIsolation(normalIsolation),
      }),
      startLane('atomic', atomicWorktree, atomicPromptFile, {
        variant: atomicVariant,
        commandName: atomicPrepromptCommand?.commandName,
        promptTransform: atomicPrepromptCommand ? null : minifyAtomicPromptEnabled ? compileAtomicFastPrompt : null,
      }),
    ];
  } catch (error) {
    restoreNormalLaneIsolation(normalIsolation);
    throw error;
  }
  for (const lane of lanes) {
    lane.child.on('exit', (code, signal) => {
      if (lane.status === 'running') lane.status = code === 0 ? 'completed' : 'exited';
      lane.exitCode = code;
      lane.signal = signal;
      closeLane(lane);
    });
  }

  const timer = setInterval(() => {
    const now = Date.now();
    const recurringKilled = killContaminants();
    for (const lane of lanes) {
      const size = observedLaneSize(lane);
      if (size > lane.lastSize) {
        lane.lastSize = size;
        lane.lastGrowthAt = now;
      }
      if (lane.name === 'normal' && lane.status === 'running') {
        const forbiddenUse = findForbiddenNormalUse(lane);
        if (forbiddenUse) {
          lane.status = 'forbidden_tool';
          lane.forbiddenUse = forbiddenUse;
          killProcessTree(lane.child.pid);
        }
      }
      if (lane.name === 'atomic' && lane.status === 'running') {
        const worktreeEscape = findAtomicWorktreeEscape(lane);
        if (worktreeEscape) {
          lane.status = 'worktree_escape';
          lane.forbiddenUse = worktreeEscape;
          killProcessTree(lane.child.pid);
        }
      }
      if (lane.status === 'running' && now - lane.startedAt > maxMs) {
        lane.status = 'max_timeout';
        killProcessTree(lane.child.pid);
      }
      if (lane.status === 'running' && now - lane.lastGrowthAt > idleMs) {
        lane.status = 'idle_timeout';
        killProcessTree(lane.child.pid);
      }
    }
    writeJson(statusFile, {
      ok: lanes.every((lane) => lane.status === 'completed'),
      initialKilled,
      recurringKilled,
      syncedAtomicToolchain,
      minifyAtomicPromptEnabled,
      atomicCommandMode,
      atomicPrepromptCommand,
      variants: { normal: normalVariant, atomic: atomicVariant },
      linkedDependencies,
      normalIsolation: {
        enabled: normalIsolation.enabled,
        xdgRoot: normalIsolation.xdgRoot,
        restored: normalIsolation.restored,
        generatedMoves: normalIsolation.generatedMoves,
        restoreError: normalIsolation.restoreError,
      },
      now: new Date(now).toISOString(),
      lanes: lanes.map((lane) => ({
        name: lane.name,
        pid: lane.child.pid,
        status: lane.status,
        exitCode: lane.exitCode,
        signal: lane.signal,
        cleanupError: lane.cleanupError,
        forbiddenUse: lane.forbiddenUse,
        startedAt: lane.startedAt,
        lastSize: lane.lastSize,
        idleMs: now - lane.lastGrowthAt,
        elapsedMs: now - lane.startedAt,
        outFile: lane.outFile,
        errFile: lane.errFile,
      })),
    });
    if (lanes.every((lane) => lane.status !== 'running')) {
      clearInterval(timer);
      const ok = lanes.every((lane) => lane.status === 'completed');
      process.exitCode = ok ? 0 : 1;
    }
  }, pollMs);
}

main();
