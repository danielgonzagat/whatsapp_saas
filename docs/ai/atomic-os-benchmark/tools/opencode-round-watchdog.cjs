#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { psRows, killPid, killProcessTree, killContaminants } = require('./opencode-round-watchdog.proc.cjs');
const {
  syncAtomicToolchainFile,
  syncAtomicToolchain,
  linkWorktreeDependencies,
  writeMinimalOpenCodeConfig,
  moveGeneratedPath,
  prepareNormalLaneIsolation,
  restoreNormalLaneIsolation,
} = require('./opencode-round-watchdog.isolation.cjs');
const {
  findForbiddenNormalUse,
  commandPinsAtomicWorktree,
  findAtomicWorktreeEscape,
} = require('./opencode-round-watchdog.diagnostics.cjs');
const {
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
} = require('./opencode-round-watchdog.config.cjs');

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
