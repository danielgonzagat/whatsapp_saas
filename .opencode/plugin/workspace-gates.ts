// OpenCode plugin: replicates the workspace gate enforcement that Claude Code
// gets via .claude/settings.json PreToolUse hooks. Mounts on tool.execute.before
// and pipes a Claude-shaped JSON envelope to the existing node scripts under
// scripts/decomp/, then aborts the tool if those scripts exit non-zero.
//
// Single source of truth for rules remains scripts/decomp/lib/gate-rules.mjs.
// This plugin only adapts shapes — does not duplicate rule logic.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

type AnyInput = {
  call?: { name?: string; input?: Record<string, unknown> };
  tool?: string;
  args?: Record<string, unknown>;
};
type AnyOutput = { abort?: string; args?: Record<string, unknown> };

// OpenCode tool name → Claude-equivalent tool name
const TOOL_MAP: Record<string, string> = {
  bash: 'Bash',
  Bash: 'Bash',
  write: 'Write',
  Write: 'Write',
  edit: 'Edit',
  Edit: 'Edit',
  multiedit: 'MultiEdit',
  MultiEdit: 'MultiEdit',
};

// Locate the repository root by walking up looking for .git
function findRepoRoot(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const repoRoot = findRepoRoot(process.cwd()) || process.cwd();

function runHook(scriptRel: string, payload: object): { exit: number; stderr: string } {
  const scriptAbs = path.join(repoRoot, scriptRel);
  if (!existsSync(scriptAbs)) return { exit: 0, stderr: '' };
  const r = spawnSync('node', [scriptAbs], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd: repoRoot,
  });
  return { exit: r.status ?? 0, stderr: r.stderr || '' };
}

const PreToolUsePlugin = {
  'tool.execute.before': async (input: AnyInput, output: AnyOutput) => {
    const rawName = input?.call?.name ?? input?.tool ?? '';
    const claudeName = TOOL_MAP[rawName] ?? rawName;
    const toolInput = (input?.call?.input ?? input?.args ?? {}) as Record<string, unknown>;

    // Build a Claude-shaped envelope so the existing hooks understand.
    const envelope = { tool_name: claudeName, tool_input: toolInput };

    let result: { exit: number; stderr: string } = { exit: 0, stderr: '' };
    if (claudeName === 'Write' || claudeName === 'Edit' || claudeName === 'MultiEdit') {
      result = runHook('scripts/decomp/preflight-write-gate.mjs', envelope);
    } else if (claudeName === 'Bash') {
      result = runHook('scripts/decomp/preflight-bash-gate.mjs', envelope);
    } else {
      return; // tool not gated
    }

    if (result.exit !== 0) {
      const msg = result.stderr.trim() || 'Workspace gate blocked this tool call.';
      output.abort = msg;
    }
  },
};

export default PreToolUsePlugin;
