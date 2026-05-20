// opencode-round-watchdog — lane diagnostics (extracted).
const path = require('node:path');
const { atomicCallToolPath, atomicWorktree } = require('./opencode-round-watchdog.config.cjs');

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


module.exports = {
  findForbiddenNormalUse,
  commandPinsAtomicWorktree,
  findAtomicWorktreeEscape,
};
