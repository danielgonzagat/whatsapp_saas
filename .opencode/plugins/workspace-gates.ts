import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from '@opencode-ai/plugin';

type ToolArgs = Record<string, unknown>;
type HookInput = {
  call?: { name?: string; input?: ToolArgs };
  tool?: string;
  args?: ToolArgs;
};
type HookOutput = { args?: ToolArgs };

const TOOL_MAP: Record<string, string> = {
  bash: 'Bash',
  Bash: 'Bash',
  write: 'Write',
  Write: 'Write',
  edit: 'Edit',
  Edit: 'Edit',
  multiedit: 'MultiEdit',
  MultiEdit: 'MultiEdit',
  notebookedit: 'NotebookEdit',
  NotebookEdit: 'NotebookEdit',
  patch: 'apply_patch',
  Patch: 'apply_patch',
};

const ATOMIC_GATED_TOOLS = new Set([
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'Bash',
  'apply_patch',
]);

function findRepoRoot(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function normalizeOpenCodeArgs(args: ToolArgs): ToolArgs {
  const normalized = { ...args };
  if (normalized.filePath && !normalized.file_path) normalized.file_path = normalized.filePath;
  if (normalized.path && !normalized.file_path) normalized.file_path = normalized.path;
  return normalized;
}

function runHook(repoRoot: string, scriptRel: string, payload: object): { exit: number; stderr: string } {
  const scriptAbs = path.join(repoRoot, scriptRel);
  if (!existsSync(scriptAbs)) {
    return { exit: 1, stderr: `Missing workspace gate: ${scriptRel}` };
  }
  const result = spawnSync('node', [scriptAbs], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd: repoRoot,
  });
  if (result.error) {
    return { exit: 1, stderr: result.error.message };
  }
  return { exit: result.status ?? 1, stderr: result.stderr || '' };
}

function runAtomicGate(repoRoot: string, payload: object): { deny: boolean; reason: string } {
  const scriptAbs = path.join(repoRoot, 'scripts/mcp/atomic-edit/atomic-only-hook.mjs');
  if (!existsSync(scriptAbs)) {
    return { deny: true, reason: 'Missing atomic gate script.' };
  }
  const result = spawnSync('node', [scriptAbs], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd: repoRoot,
  });
  if (result.error || result.status !== 0) {
    return {
      deny: true,
      reason: result.error?.message || result.stderr || 'Atomic gate failed.',
    };
  }
  try {
    const out = JSON.parse(result.stdout || '{}');
    const decision = out?.hookSpecificOutput;
    if (decision?.permissionDecision === 'deny') {
      return {
        deny: true,
        reason: String(decision.permissionDecisionReason || 'native code edit banned'),
      };
    }
  } catch {
    throw new Error('OpenCode atomic gate returned malformed JSON; refusing tool execution.');
  }
  return { deny: false, reason: '' };
}

function buildEnvelope(input: HookInput, output: HookOutput) {
  const rawName = input?.call?.name ?? input?.tool ?? '';
  const claudeName = TOOL_MAP[rawName] ?? rawName;
  const args = normalizeOpenCodeArgs(output?.args ?? input?.call?.input ?? input?.args ?? {});
  return {
    claudeName,
    envelope: { tool_name: claudeName, tool_input: args },
  };
}

export const WorkspaceGatesPlugin: Plugin = async ({ directory, worktree }) => {
  const repoRoot = findRepoRoot(worktree || directory || process.cwd()) || process.cwd();

  return {
    'tool.execute.before': async (input: HookInput, output: HookOutput) => {
      const { claudeName, envelope } = buildEnvelope(input, output);

      if (ATOMIC_GATED_TOOLS.has(claudeName)) {
        const atomic = runAtomicGate(repoRoot, envelope);
        if (atomic.deny) throw new Error(atomic.reason);
      }

      if (claudeName === 'Write' || claudeName === 'Edit' || claudeName === 'MultiEdit') {
        const result = runHook(repoRoot, 'scripts/decomp/preflight-write-gate.mjs', envelope);
        if (result.exit !== 0) {
          throw new Error(result.stderr.trim() || 'Workspace write gate blocked this tool call.');
        }
      }

      if (claudeName === 'apply_patch') {
        const result = runHook(repoRoot, 'scripts/decomp/adapters/apply-patch-gate.mjs', envelope);
        if (result.exit !== 0) {
          throw new Error(result.stderr.trim() || 'Workspace apply_patch gate blocked this tool call.');
        }
      }

      if (claudeName === 'Bash') {
        const result = runHook(repoRoot, 'scripts/decomp/preflight-bash-gate.mjs', envelope);
        if (result.exit !== 0) {
          throw new Error(result.stderr.trim() || 'Workspace bash gate blocked this tool call.');
        }
      }
    },
  };
};

export default WorkspaceGatesPlugin;
