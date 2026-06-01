#!/usr/bin/env node
/**
 * codex-atomic-only-hook.mjs — strict Codex CLI closed-loop protocol.
 *
 * This is the outer enforcement ring for the user's Y trajectory:
 * Codex may not execute computation through native/TUI tools. A tool call has
 * exactly two legal shapes:
 *
 *   1. It is an atomic-edit MCP tool, which executes the computation inside
 *      the atomic admission envelope; or
 *   2. It is an atomic-edit MCP edit tool used to expand atomic-edit itself so
 *      a missing computation becomes possible inside that envelope.
 *
 * Everything else is denied fail-closed. There are deliberately no environment
 * toggles and no prose/code distinction: this hook is the strict Codex posture,
 * not the softer Claude TUI renderer-avoidance hook.
 */
import { readFileSync } from 'node:fs';

const ATOMIC_TOOL_RE = /^(?:mcp__atomic_edit(?:\.|__)|mcp__atomic-edit__|atomic-edit__|atomic_edit__)/;

function readStdinRaw() {
  try {
    return readFileSync(0, 'utf8') || '';
  } catch {
    return '';
  }
}

function parseToolName(input) {
  return String(input?.tool_name ?? input?.toolName ?? input?.name ?? input?.recipient_name ?? '');
}

function hostSandboxActive() {
  return process.env.ATOMIC_HOST_SANDBOX === 'macos-sandbox-exec' && process.env.ATOMIC_HOST_ATOMIC_ONLY === '1';
}

function deny(reason) {
  const payload = {
    ok: false,
    permissionDecision: 'deny',
    reason,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

function allow() {
  process.exit(0);
}

const raw = readStdinRaw();
let input;
try {
  input = JSON.parse(raw);
} catch {
  deny(
    'Codex atomic-only protocol refused an unparsable tool call (fail-closed). ' +
      'Retry through an atomic-edit MCP tool. If the required computation is missing, first use atomic-edit tools to implement that computation inside atomic-edit.',
  );
}

const tool = parseToolName(input);
if (!hostSandboxActive()) {
  deny(
    `Codex atomic-only protocol requires the host sandbox before any tool call; "${tool || '<unknown>'}" was refused. ` +
      'Relaunch Codex through scripts/mcp/atomic-edit/codex-atomic-host-launcher.mjs so the process, filesystem writes, temp writes, and network boundary are controlled before atomic tools execute.',
  );
}
if (ATOMIC_TOOL_RE.test(tool)) allow();

deny(
  `Codex atomic-only protocol: native/non-atomic tool "${tool || '<unknown>'}" is forbidden. ` +
    'Only atomic-edit MCP tools may execute computation. If no existing atomic tool can perform this action, ' +
    'the next legal action is to use atomic-edit itself (atomic_create_file, atomic_replace_text, atomic_edit_symbol, ' +
    'atomic_transaction, atomic_exec inside its admission envelope, etc.) to implement the missing computation inside atomic-edit first. ' +
    'Positive actions must create only admitted byte-correct results; negative actions must be routed through atomic gates that prove the target bytes are non-correct/removable, never through native tooling.',
);
