#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function usage() {
  console.error('Usage: round-audit.cjs <round-dir>');
  process.exit(2);
}

const roundDir = process.argv[2] ? path.resolve(process.argv[2]) : '';
if (!roundDir) usage();

function readText(file) {
  try {
    return fs.readFileSync(path.join(roundDir, file), 'utf8');
  } catch {
    return '';
  }
}

function firstExisting(files) {
  return files.find((file) => fs.existsSync(path.join(roundDir, file))) || files[0];
}

function readJsonl(file) {
  const text = readText(file).replace(/\0/g, '').trim();
  if (!text) return [];
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readJsonFile(file) {
  const text = readText(file).trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function metadataValue(...names) {
  for (const name of names) {
    const match = readText('metadata.txt').match(new RegExp('^' + name + '=(.+)$', 'm'));
    if (match) return path.resolve(match[1].trim());
  }
  return '';
}

const roundMetadata = {
  normalWorktree: metadataValue('normal_worktree', 'normal'),
  atomicWorktree: metadataValue('atomic_worktree', 'atomic'),
};
const watchdogStatus = readJsonFile('opencode-watchdog-status.json') || {};

function laneStatus(name) {
  return (watchdogStatus.lanes || []).find((lane) => lane.name === name) || null;
}

function laneStartedAt(name) {
  const value = Number(laneStatus(name)?.startedAt);
  return Number.isFinite(value) ? value : null;
}

function readNumberTextFile(file) {
  const text = readText(file).trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function prepromptMetrics(name) {
  if (!name) return null;
  const prefix = 'opencode-' + name + '-preprompt';
  const startTimestamp = readNumberTextFile(prefix + '-start-ms.txt');
  const endTimestamp = readNumberTextFile(prefix + '-end-ms.txt');
  const exitCode = readNumberTextFile(prefix + '-exit.txt');
  if (startTimestamp === null && endTimestamp === null && exitCode === null) return null;
  return {
    startTimestamp,
    endTimestamp,
    exitCode,
    commandText: readText(prefix + '-command.txt') || readText('opencode-' + name + '-preprompt-command.txt'),
    output: readText(prefix + '-output.log').slice(0, 8000),
  };
}

function finalUsage(events) {
  let usageRecord = {};
  const openCodeTotals = { input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 };
  for (const event of events) {
    if (event.type === 'turn.completed') usageRecord = event.usage || {};
    if (event.type === 'step_finish' && event.part?.tokens) {
      const tokens = event.part.tokens;
      openCodeTotals.input_tokens += Number(tokens.input || 0);
      openCodeTotals.output_tokens += Number(tokens.output || 0);
      openCodeTotals.reasoning_output_tokens += Number(tokens.reasoning || 0);
    }
  }
  if (Object.values(openCodeTotals).some((value) => value > 0)) return openCodeTotals;
  return usageRecord;
}

function eventTimestamp(event) {
  const timestamp = Number(event?.timestamp);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function firstTimestamp(events, predicate = () => true) {
  for (const event of events) {
    if (!predicate(event)) continue;
    const timestamp = eventTimestamp(event);
    if (timestamp !== null) return timestamp;
  }
  return null;
}

function lastTimestamp(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const timestamp = eventTimestamp(events[index]);
    if (timestamp !== null) return timestamp;
  }
  return null;
}

function elapsedMs(start, end) {
  return typeof start === 'number' && typeof end === 'number' ? Math.max(0, end - start) : null;
}

function eventMetrics(file, expectedWorktree = '', laneName = '') {
  const events = readJsonl(file);
  const preprompt = prepromptMetrics(laneName);
  const codexCommands = events.filter(
    (event) => event.type === 'item.completed' && event.item?.type === 'command_execution',
  );
  const openCodeCommands = events.filter(
    (event) => event.type === 'tool_use' && event.part?.tool === 'bash',
  );
  const prepromptCommands = preprompt
    ? [{
        type: 'preprompt.command',
        item: {
          type: 'command_execution',
          command: preprompt.commandText,
          cwd: expectedWorktree,
          exit_code: preprompt.exitCode,
          aggregated_output: preprompt.output,
        },
      }]
    : [];
  const commands = [...codexCommands, ...openCodeCommands, ...prepromptCommands];
  const openCodeToolUses = events.filter((event) => event.type === 'tool_use');
  const nativeFileToolNames = new Set([
    'read',
    'write',
    'edit',
    'multiedit',
    'patch',
    'glob',
    'grep',
    'list',
  ]);
  const nativeFileToolViolations = openCodeToolUses
    .filter((event) => nativeFileToolNames.has(String(event.part?.tool || '')))
    .map((event) => ({
      tool: String(event.part?.tool || ''),
      inputPreview: JSON.stringify(event.part?.state?.input || {}).slice(0, 400),
    }));
  const mcpCalls = events.filter(
    (event) =>
      (event.type === 'item.completed' && event.item?.type === 'mcp_tool_call') ||
      (event.type === 'tool_use' && String(event.part?.tool || '').startsWith('atomic-edit_')),
  );
  const fileChanges = events.filter(
    (event) => event.type === 'item.completed' && event.item?.type === 'file_change',
  );
  const commandText = (event) => event.item?.command || event.part?.state?.input?.command || '';
  const commandWorkdir = (event) => event.item?.cwd || event.part?.state?.input?.workdir || '';
  const expectedWorktreeRoot = expectedWorktree ? path.resolve(expectedWorktree) : '';
  const atomicCallToolPath = expectedWorktreeRoot
    ? path.join(expectedWorktreeRoot, ...['docs', 'ai', 'atomic-os-benchmark', 'tools', 'atomic-call.cjs'])
    : '';
  const commandPinsExpectedWorktree = (command) =>
    expectedWorktreeRoot &&
    command.includes('cd ' + expectedWorktreeRoot) &&
    command.includes('ATOMIC_OS_REPO_ROOT=' + expectedWorktreeRoot) &&
    command.includes(atomicCallToolPath);
  const commandExit = (event) => event.item?.exit_code ?? event.part?.state?.metadata?.exit ?? null;
  const commandOutput = (event) => event.item?.aggregated_output || event.part?.state?.output || '';
  const expectedNoMatchCommand = (event) => {
    const command = commandText(event);
    const output = String(commandOutput(event) || '').trim();
    return (
      commandExit(event) === 1 &&
      /\brg\s+-n\b/.test(command) &&
      command.includes('as any|@ts-ignore') &&
      (output === '' || output === '(no output)')
    );
  };
  const commandTexts = commands.map(commandText);
  const forbiddenAtomicToolUses = openCodeToolUses
    .filter((event) => String(event.part?.tool || '').startsWith('atomic-edit_'))
    .map((event) => ({
      tool: String(event.part?.tool || ''),
      inputPreview: JSON.stringify(event.part?.state?.input || {}).slice(0, 400),
    }));
  const commandUsesAtomicSurface = (command) =>
    /atomic-call[.]cjs|scripts[/]mcp[/]atomic-edit|[.]atomic[/]traces|docs[/]ai[/]traces/.test(command);
  const forbiddenAtomicCommands =
    laneName === 'atomic' ? [] : commandTexts.filter(commandUsesAtomicSurface);
  const atomicCallWorktreeEscapes = commands
    .filter((event) => {
      const command = commandText(event);
      if (!command.includes('atomic-call.cjs') || !expectedWorktreeRoot) return false;
      const workdir = commandWorkdir(event);
      const workdirOk = workdir && path.resolve(workdir) === expectedWorktreeRoot;
      return !workdirOk && !commandPinsExpectedWorktree(command);
    })
    .map((event) => ({
      command: commandText(event).slice(0, 500),
      workdir: commandWorkdir(event) || null,
      expectedWorktree: expectedWorktreeRoot,
    }));
  const commandScopeNeedles = (process.env.ATOMIC_ROUND_AUDIT_CODE_SCOPES || 'backend/src/kloel')
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean);
  const commandMentionsCodePath = (command) =>
    commandScopeNeedles.some((needle) => command.includes(needle));
  const nativeShellReadCommands = commandTexts.filter((command) => {
    if (!/\b(cat|sed|nl|awk|head|tail)\b/.test(command)) return false;
    if (!commandMentionsCodePath(command)) return false;
    if (/\bgit\s+diff\b/.test(command)) return false;
    if (/\bcat\s*<</.test(command) && !/\|\s*(head|tail|sed|awk|nl)\b/.test(command)) return false;
    return true;
  });
  const maskedAtomicFailurePipelineCommands = commandTexts.filter(
    (command) => command.includes('atomic-call.cjs') && /\|\s*(head|tail|sed|awk|nl)\b/.test(command),
  );
  const toolCounts = {};
  for (const event of mcpCalls) {
    const tool = event.item?.tool || event.part?.tool || 'unknown';
    toolCounts[tool] = (toolCounts[tool] || 0) + 1;
  }
  const allToolCounts = {};
  for (const event of openCodeToolUses) {
    const tool = String(event.part?.tool || 'unknown');
    allToolCounts[tool] = (allToolCounts[tool] || 0) + 1;
  }
  const laneRuntime = laneStatus(laneName);
  const laneStartTimestamp = laneStartedAt(laneName);
  const watchdogElapsedMs = Number(laneRuntime?.elapsedMs);
  const laneIncomplete = laneRuntime !== null && laneRuntime.status !== 'completed';
  const watchdogFinalTimestamp =
    laneIncomplete && laneStartTimestamp !== null && Number.isFinite(watchdogElapsedMs)
      ? laneStartTimestamp + watchdogElapsedMs
      : null;
  const firstEventTimestamp = firstTimestamp(events);
  const firstStepStartTimestamp = firstTimestamp(events, (event) => event.type === 'step_start') ?? firstEventTimestamp;
  const effectiveStartTimestamp = laneStartTimestamp ?? firstStepStartTimestamp;
  const eventFirstActionTimestamp = firstTimestamp(
    events,
    (event) =>
      event.type === 'tool_use' ||
      (event.type === 'item.completed' &&
        ['command_execution', 'mcp_tool_call', 'file_change'].includes(event.item?.type)),
  );
  const firstActionTimestamp = preprompt?.startTimestamp ?? eventFirstActionTimestamp;
  const eventFinalTimestamp = lastTimestamp(events) ?? preprompt?.endTimestamp ?? null;
  const effectiveFinalTimestamp =
    watchdogFinalTimestamp !== null && eventFinalTimestamp !== null
      ? Math.max(watchdogFinalTimestamp, eventFinalTimestamp)
      : watchdogFinalTimestamp ?? eventFinalTimestamp;
  const finalTimestamp = effectiveFinalTimestamp;
  return {
    rows: events.length,
    laneStatus: laneRuntime?.status ?? null,
    laneExitCode: laneRuntime?.exitCode ?? null,
    laneElapsedMs: Number.isFinite(watchdogElapsedMs) ? watchdogElapsedMs : null,
    laneTimedOut: laneRuntime?.status === 'idle_timeout' || laneRuntime?.status === 'max_timeout',
    laneStartTimestamp,
    firstStepStartTimestamp,
    effectiveStartTimestamp,
    eventFirstActionTimestamp,
    firstActionTimestamp,
    eventFinalTimestamp,
    watchdogFinalTimestamp,
    finalTimestamp,
    preprompt,
    prepromptActionMs: preprompt ? elapsedMs(preprompt.startTimestamp, preprompt.endTimestamp) : null,
    firstActionMs: elapsedMs(effectiveStartTimestamp, firstActionTimestamp),
    eventSpanMs: elapsedMs(effectiveStartTimestamp, eventFinalTimestamp),
    totalAgentMs: elapsedMs(effectiveStartTimestamp, finalTimestamp),
    turnCompleted: events.some(
      (event) => event.type === 'turn.completed' || event.type === 'step_finish' || event.type === 'text',
    ),
    completedCommands: commands.length,
    uniqueCompletedCommands: new Set(commandTexts).size,
    failedCommands: commands
      .filter((event) => {
        const exit = commandExit(event);
        return typeof exit === 'number' && exit !== 0 && !expectedNoMatchCommand(event);
      })
      .map((event) => ({
        command: commandText(event),
        exitCode: commandExit(event),
        output: String(commandOutput(event)).slice(0, 400),
      })),
    completedMcpCalls: mcpCalls.length,
    mcpTools: toolCounts,
    allTools: allToolCounts,
    nativeFileToolViolations,
    nativeShellReadCommands,
    maskedAtomicFailurePipelineCommands,
    atomicCallWorktreeEscapes,
    forbiddenAtomicToolUses,
    forbiddenAtomicCommands,
    fileChangeItems: fileChanges.length,
    fileChangePaths: fileChanges.flatMap((event) =>
      (event.item.changes || []).map((change) => change.path),
    ),
    agentMessages: events.filter(
      (event) =>
        (event.type === 'item.completed' && event.item?.type === 'agent_message') ||
        event.type === 'text',
    ).length,
    proofReadCommands: commandTexts.filter(
      (command) => /\b(nl|sed|rg|wc)\b/.test(command) && command.includes('backend/src/kloel'),
    ).length,
    fullDiffCommands: commandTexts.filter((command) =>
      /git diff(?! --(stat|shortstat|check|name-only|name-status))/.test(command),
    ).length,
    backendInstallCommands: commandTexts.filter((command) =>
      command.includes('npm --prefix backend ci'),
    ).length,
    usage: finalUsage(events),
  };
}

function sectionList(text, label) {
  const start = text.indexOf(`${label}\n`);
  if (start === -1) return [];
  const body = text.slice(start + label.length + 1);
  const next = body.search(/\n[a-z_]+(?:_start|_exit|_short|_diff|_counts|_scan)?(?:=|\n)/);
  const section = next === -1 ? body : body.slice(0, next);
  return section.trim().split(/\s+/).filter(Boolean);
}

function countTraceFiles(worktree) {
  if (!worktree) return null;
  const traceDir = path.join(worktree, '.atomic', 'traces');
  try {
    return fs.readdirSync(traceDir).filter((entry) => entry.endsWith('.json')).length;
  } catch {
    return null;
  }
}

function validationMetrics(file, worktree = '') {
  const text = readText(file);
  const lines = text.split(/\r?\n/);
  const keyedNumber = (name) => {
    const match = text.match(new RegExp('^' + name + '=([^\\n]*)', 'm'));
    if (!match) return null;
    const raw = match[1].trim();
    if (!raw) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const status = (name) => {
    const variants = [
      name,
      name.replace(/_/g, ' '),
      name.replace(/_/g, '-'),
    ];
    for (const variant of variants) {
      const bracketMatch = text.match(new RegExp(
        '\\[\\s*' + variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+(?:status|exit|done)=([0-9]+)\\s*\\]',
        'i',
      ));
      if (bracketMatch) return Number(bracketMatch[1]);
    }
    const match = text.match(new RegExp(
      '(?:' + name + '_status|' + name + '_exit|' + name + '_done)=([0-9]+)',
    ));
    return match ? Number(match[1]) : null;
  };
  const sectionMarkers = new Set([
    'git_status_short',
    'touched_kloel_files',
    'jest_start',
    'typecheck_start',
    'diff_check_start',
    'atomic_trace_isolation',
    'service_line_count',
    'unified_agent_file_line_counts',
    'line_counts',
    'spec_diff',
    'protected_diff',
    'forbidden_pattern_scan',
    'suppression_scan',
    'helper_this_scan',
    'private_methods_scan',
    'private_scan',
    'diff_numstat',
    'diff_stat',
    'untracked_line_counts',
    'atomic_trace_counts',
    'trace_count',
    'focused_jest',
    'focused_eslint',
    'touched_typecheck_errors',
    'unexpected_private_helper_removal_scan',
  ]);
  const sectionName = (value) =>
    String(value || '')
      .trim()
      .replace(/^\[\s*/, '')
      .replace(/\s*\]$/, '')
      .replace(/^==\s*/, '')
      .replace(/\s*==$/, '')
      .replace(/\s+/g, '_');
  const isExternalHeading = (value) => /^==\s*.+\s*==$/.test(String(value || '').trim());
  const section = (name) => {
    const normalizedName = sectionName(name);
    const index = lines.findIndex((line) => sectionName(line) === normalizedName);
    if (index === -1) return [];
    const values = [];
    for (const rawLine of lines.slice(index + 1)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/^\[.*\b(?:status|exit|done)=[0-9]+\s*\]$/i.test(line)) break;
      if (isExternalHeading(line) || sectionMarkers.has(sectionName(line)) || /^[a-z_]+=(.*)$/.test(line)) break;
      values.push(line);
    }
    return values;
  };
  const lineMatch = text.match(/\n\s*(\d+)\s+.*backend\/src\/kloel\/unified-agent\.service\.ts/);
  const traceMatch =
    text.match(/worktree_dot_atomic_traces=(\d+)/) ||
    text.match(/worktree_traces=(\d+)/) ||
    text.match(/"worktreeTraceCount":\s*(\d+)/) ||
    text.match(/\ntrace_count\n\s*(\d+)/);
  const docsTraceMatch = text.match(/worktree_docs_ai_traces=(\d+)/);
  const worktreeTraceCount = countTraceFiles(worktree);
  const typecheckErrorLines = [
    ...section('typecheck'),
    ...section('touched_typecheck_errors'),
  ].filter((line) => /\berror TS\d+/.test(line));
  const typecheckKloelErrors = typecheckErrorLines.filter(
    (line) => line.includes('src/kloel/') || line.includes('backend/src/kloel/'),
  );
  const touchedTypecheckErrorCount = keyedNumber('touched_typecheck_error_count');
  const gitStatusEntries = [...section('git_status_short'), ...section('git_status')]
    .map((line) => {
      const match = line.match(/^(.{1,2})\s+(.+)$/);
      if (!match) return null;
      return { status: match[1].trim(), path: match[2] };
    })
    .filter((entry) => entry && entry.path.includes('backend/src/kloel'));
  const touchedKloelFiles = [
    ...new Set([
      ...section('touched_kloel_files'),
      ...gitStatusEntries.map((entry) => entry.path),
    ]),
  ].sort();
  const sourceNumstat = section('diff_numstat')
    .map((line) => {
      const match = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
      if (!match) return null;
      return {
        insertions: match[1] === '-' ? 0 : Number(match[1]),
        deletions: match[2] === '-' ? 0 : Number(match[2]),
        path: match[3],
      };
    })
    .filter((row) => row && row.path.includes('backend/src/kloel'));
  const fileLineCounts = [...section('unified_agent_file_line_counts'), ...section('line_counts')]
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (!match || match[2] === 'total') return null;
      const matchedPath = match[2];
      const kloelIndex = matchedPath.indexOf('backend/src/kloel/');
      const normalizedPath = kloelIndex === -1 ? matchedPath : matchedPath.slice(kloelIndex);
      return { lines: Number(match[1]), path: normalizedPath };
    })
    .filter((row) => row && row.path.includes('backend/src/kloel'));
  const untrackedPathSet = new Set(
    gitStatusEntries.filter((entry) => entry.status === '??').map((entry) => entry.path),
  );
  const untrackedInsertions = fileLineCounts
    .filter((row) => untrackedPathSet.has(row.path))
    .reduce((sum, row) => sum + row.lines, 0);
  const sourceInsertions =
    sourceNumstat.reduce((sum, row) => sum + row.insertions, 0) + untrackedInsertions;
  const sourceDeletions = sourceNumstat.reduce((sum, row) => sum + row.deletions, 0);
  const actionHelperLines =
    fileLineCounts.find((row) => row.path.endsWith('unified-agent-action.helpers.ts'))?.lines ?? null;
  const runtimeHelperLines =
    fileLineCounts.find((row) => row.path.endsWith('unified-agent-runtime.helpers.ts'))?.lines ?? null;
  const runtimeContextHelperLines =
    fileLineCounts.find((row) => row.path.endsWith('unified-agent-runtime-context.helpers.ts'))?.lines ?? null;
  const toolRouterHelperLines =
    fileLineCounts.find((row) => row.path.endsWith('unified-agent-tool-router.helpers.ts'))?.lines ?? null;
  const totalKloelLines = fileLineCounts.reduce((sum, row) => sum + row.lines, 0);
  const unexpectedPrivateHelperRemovalStatus = status('unexpected_private_helper_removal_scan');
  const scopePreservationPass =
    unexpectedPrivateHelperRemovalStatus === null ? null : unexpectedPrivateHelperRemovalStatus === 0;
  const serviceLines =
    fileLineCounts.find((row) => row.path.endsWith('unified-agent.service.ts'))?.lines ??
    (lineMatch ? Number(lineMatch[1]) : null);
  return {
    jestStatus: status('jest'),
    finalValidationStatus: status('final_validation'),
    typecheckStatus: status('typecheck'),
    typecheckErrorCount: Math.max(typecheckErrorLines.length, touchedTypecheckErrorCount ?? 0),
    typecheckKloelErrorCount: touchedTypecheckErrorCount ?? typecheckKloelErrors.length,
    lintStatus: status('lint') ?? status('eslint') ?? status('lint_touched_files'),
    diffCheckStatus: status('diff_check'),
    traceIsolationStatus: status('trace_isolation'),
    forbiddenPatternStatus: status('service_residue') ?? status('forbidden_pattern') ?? status('suppression_scan'),
    helperThisStatus: status('helper_this_scan') ?? status('helper_this'),
    privateMethodsStatus: status('private_methods_scan') ?? status('private_scan'),
    serviceLines,
    specDiff: section('spec_diff'),
    protectedDiff: section('protected_diff'),
    traceCount: traceMatch ? Number(traceMatch[1]) : worktreeTraceCount,
    docsTraceCount: docsTraceMatch ? Number(docsTraceMatch[1]) : null,
    touchedKloelFiles,
    touchedKloelFileCount: touchedKloelFiles.length,
    fileLineCounts,
    actionHelperLines,
    runtimeHelperLines,
    runtimeContextHelperLines,
    toolRouterHelperLines,
    totalKloelLines,
    unexpectedPrivateHelperRemovalStatus,
    scopePreservationPass,
    untrackedInsertions,
    sourceInsertions,
    sourceDeletions,
    sourceChurn: sourceInsertions + sourceDeletions,
  };
}

function compareLower(normal, atomic, key) {
  const n = normal[key];
  const a = atomic[key];
  if (typeof n !== 'number' || typeof a !== 'number') return 'unknown';
  if (a < n) return 'atomic';
  if (n < a) return 'normal';
  return 'tie';
}

function comparePassBoolean(normalValue, atomicValue) {
  if (normalValue === atomicValue) return 'tie';
  if (atomicValue === true) return 'atomic';
  if (normalValue === true) return 'normal';
  return 'unknown';
}

const normalEventsFile = firstExisting(['opencode-normal-events.jsonl', 'normal-events.jsonl']);
const atomicEventsFile = firstExisting(['opencode-atomic-events.jsonl', 'atomic-events.jsonl']);

const normal = {
  eventsFile: normalEventsFile,
  events: eventMetrics(normalEventsFile, roundMetadata.normalWorktree, 'normal'),
  validation: validationMetrics('normal-external-validation.log', roundMetadata.normalWorktree),
};
const atomic = {
  eventsFile: atomicEventsFile,
  events: eventMetrics(atomicEventsFile, roundMetadata.atomicWorktree, 'atomic'),
  validation: validationMetrics('atomic-external-validation.log', roundMetadata.atomicWorktree),
};

function validationPass(validation, options = {}) {
  const typecheckOk =
    validation.typecheckStatus === 0 ||
    (options.allowTaskScopedTypecheckNoise === true && validation.typecheckKloelErrorCount === 0);
  const lintOk = validation.lintStatus === null || validation.lintStatus === 0;
  const finalValidationOk =
    validation.finalValidationStatus === null || validation.finalValidationStatus === 0;
  return (
    validation.jestStatus === 0 &&
    finalValidationOk &&
    typecheckOk &&
    lintOk &&
    validation.diffCheckStatus === 0 &&
    validation.forbiddenPatternStatus === 1 &&
    (validation.helperThisStatus === null || validation.helperThisStatus === 1) &&
    (validation.privateMethodsStatus === null || validation.privateMethodsStatus === 1) &&
    (validation.scopePreservationPass === null || validation.scopePreservationPass === true)
  );
}

const sharedTypecheckNoiseOnly =
  normal.validation.typecheckStatus !== 0 &&
  atomic.validation.typecheckStatus !== 0 &&
  normal.validation.typecheckKloelErrorCount === 0 &&
  atomic.validation.typecheckKloelErrorCount === 0;
const globalFunctionalPass = validationPass(normal.validation) && validationPass(atomic.validation);
const normalTaskFunctionalPass = validationPass(normal.validation, {
  allowTaskScopedTypecheckNoise:
    normal.validation.typecheckStatus !== 0 && normal.validation.typecheckKloelErrorCount === 0,
});
const atomicTaskFunctionalPass = validationPass(atomic.validation, {
  allowTaskScopedTypecheckNoise:
    atomic.validation.typecheckStatus !== 0 && atomic.validation.typecheckKloelErrorCount === 0,
});
const taskFunctionalPass = normalTaskFunctionalPass && atomicTaskFunctionalPass;
const shapeComparisonEligible = normalTaskFunctionalPass && atomicTaskFunctionalPass;
const normalLaneCompleted = normal.events.laneStatus === null || normal.events.laneStatus === 'completed';
const atomicLaneCompleted = atomic.events.laneStatus === null || atomic.events.laneStatus === 'completed';

const scorecard = {
  functionalPass: taskFunctionalPass,
  taskFunctionalPass,
  normalTaskFunctionalPass,
  atomicTaskFunctionalPass,
  shapeComparisonEligible,
  globalFunctionalPass,
  sharedTypecheckNoiseOnly,
  normalLaneStatus: normal.events.laneStatus,
  atomicLaneStatus: atomic.events.laneStatus,
  normalLaneCompleted,
  atomicLaneCompleted,
  laneCompletionWinner: comparePassBoolean(normalLaneCompleted, atomicLaneCompleted),
  benchmarkIsolationPass:
    normal.events.forbiddenAtomicToolUses.length === 0 &&
    normal.events.forbiddenAtomicCommands.length === 0 &&
    atomic.events.atomicCallWorktreeEscapes.length === 0,
  normalModeClean:
    normal.events.forbiddenAtomicToolUses.length === 0 && normal.events.forbiddenAtomicCommands.length === 0,
  normalForbiddenAtomicToolUseCount: normal.events.forbiddenAtomicToolUses.length,
  normalForbiddenAtomicCommandCount: normal.events.forbiddenAtomicCommands.length,
  atomicModeClean:
    atomic.events.nativeFileToolViolations.length === 0 &&
    atomic.events.nativeShellReadCommands.length === 0 &&
    atomic.events.maskedAtomicFailurePipelineCommands.length === 0 &&
    atomic.events.atomicCallWorktreeEscapes.length === 0,
  atomicNativeFileToolViolationCount: atomic.events.nativeFileToolViolations.length,
  atomicNativeShellReadCommandCount: atomic.events.nativeShellReadCommands.length,
  atomicMaskedPipelineCommandCount: atomic.events.maskedAtomicFailurePipelineCommands.length,
  atomicWorktreeEscapeCount: atomic.events.atomicCallWorktreeEscapes.length,
  atomicTraceIsolationPass:
    atomic.validation.traceIsolationStatus === null || atomic.validation.traceIsolationStatus === 0,
  serviceLineWinner: shapeComparisonEligible
    ? compareLower(
        { value: normal.validation.serviceLines },
        { value: atomic.validation.serviceLines },
        'value',
      )
    : 'not_applicable',
  totalProductLineWinner: shapeComparisonEligible
    ? compareLower(
        { value: normal.validation.totalKloelLines },
        { value: atomic.validation.totalKloelLines },
        'value',
      )
    : 'not_applicable',
  normalScopePreservationPass: normal.validation.scopePreservationPass,
  atomicScopePreservationPass: atomic.validation.scopePreservationPass,
  scopePreservationWinner: comparePassBoolean(
    normal.validation.scopePreservationPass,
    atomic.validation.scopePreservationPass,
  ),
  eventRowWinner: compareLower(normal.events, atomic.events, 'rows'),
  firstActionWinner: compareLower(normal.events, atomic.events, 'firstActionMs'),
  totalAgentTimeWinner: compareLower(normal.events, atomic.events, 'totalAgentMs'),
  shellCommandWinner: compareLower(normal.events, atomic.events, 'completedCommands'),
  normalFailedCommandCount: normal.events.failedCommands.length,
  atomicFailedCommandCount: atomic.events.failedCommands.length,
  failedCommandWinner: compareLower(
    { value: normal.events.failedCommands.length },
    { value: atomic.events.failedCommands.length },
    'value',
  ),
  inputTokenWinner: compareLower(normal.events.usage, atomic.events.usage, 'input_tokens'),
  outputTokenWinner: compareLower(normal.events.usage, atomic.events.usage, 'output_tokens'),
  reasoningTokenWinner: compareLower(
    normal.events.usage,
    atomic.events.usage,
    'reasoning_output_tokens',
  ),
  traceWinner:
    atomic.events.completedMcpCalls > 0 || Number(atomic.validation.traceCount || 0) > 0
      ? 'atomic'
      : 'normal',
  protectedDiffTie:
    JSON.stringify(normal.validation.protectedDiff) === JSON.stringify(atomic.validation.protectedDiff),
  touchedFileWinner: shapeComparisonEligible
    ? compareLower(
        { value: normal.validation.touchedKloelFileCount },
        { value: atomic.validation.touchedKloelFileCount },
        'value',
      )
    : 'not_applicable',
  sourceChurnWinner: shapeComparisonEligible
    ? compareLower(
        { value: normal.validation.sourceChurn },
        { value: atomic.validation.sourceChurn },
        'value',
      )
    : 'not_applicable',
}

console.log(JSON.stringify({ roundDir, normal, atomic, scorecard }, null, 2));
