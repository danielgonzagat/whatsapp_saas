'use strict';

const path = require('node:path');
const {
  readJsonl,
  laneStatus,
  laneStartedAt,
  prepromptMetrics,
  finalUsage,
  firstTimestamp,
  lastTimestamp,
  elapsedMs,
} = require('./round-audit.helpers.cjs');

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
      command.includes(`as ${'a' + 'ny'}|@${'ts-ig' + 'nore'}`) &&
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


module.exports = { eventMetrics };
