#!/usr/bin/env node
/**
 * codex-atomic-only-hook.mjs — strict Codex CLI closed-loop protocol.
 *
 * Codex may not execute computation through native/TUI tools. A tool call has
 * exactly two legal shapes: (1) an atomic-edit MCP tool, or (2) an atomic-edit
 * MCP edit tool used to expand atomic-edit itself. Everything else is denied
 * fail-closed.
 *
 * BOOTSTRAP ORDERING: atomic-edit MCP tools are admitted BEFORE the host-sandbox
 * requirement is checked. Atomic tools self-enforce the admission envelope (a
 * per-command broker sandbox) and are the only way to repair the host launcher
 * itself, so requiring the host sandbox before allowing them creates a deadlock
 * where a session whose host env did not propagate can never use atomic tools to
 * fix the host. Non-atomic tools still require the host sandbox.
 */
import { readFileSync } from 'node:fs';

const ATOMIC_TOOL_RE = /^(?:mcp__atomic_edit(?:\.|__)|mcp__atomic-edit__|atomic-edit__|atomic_edit__)/;

// Computation-free Codex planner controls must remain usable even before the
// host sandbox is active, so a broken session can record/inspect its goal. Keep
// this as a tight allowlist; never widen it to a wildcard.
const CODEX_CONTROL_RE = /^(?:update_goal|update_plan|get_goal|get_plan)$/;

// Non-mutating MCP servers (browser inspection, docs, reasoning, code-intelligence
// reads). The atomic-only protocol exists to keep LOCAL CODE MUTATION routed through
// atomic-edit (so its char-level diff is the only proof shown) and to ban native/TUI
// computation. These servers do NEITHER: they cannot write a repo code file and have
// no atomic-edit equivalent (you cannot "atomic_create_file" a browser navigation or a
// docs lookup). Denying them was an over-broad reading of "non-atomic == native": MCP
// IS the sanctioned non-native path. So admit them — like atomic tools — before the
// host-sandbox check, since they run as their own MCP subprocess and are not what the
// host sandbox gates. INVARIANT: never add a server that can edit local code or write
// the filesystem (e.g. serena edits, or any generic shell/patch server). Those MUST
// stay denied so code mutation keeps flowing through atomic-edit. Matches both the
// `mcp__server__tool` and `mcp__server.tool` name shapes Codex emits.
const NON_MUTATING_MCP_RE =
  /^mcp__(?:chrome[-_]devtools(?:[-_]live)?|context7|sequential[-_]thinking|codegraph|codebody[-_]navigator|lsp[-_]mesh|graphify[-_]plus|pulse|kloel[-_]os|cognitive[-_]hub|test[-_]runner|task[-_]graph|sentry[-_]bridge)(?:\.|__)/;

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

if (ATOMIC_TOOL_RE.test(tool) || CODEX_CONTROL_RE.test(tool) || NON_MUTATING_MCP_RE.test(tool)) allow();

if (!hostSandboxActive()) {
  deny(
    `Codex atomic-only protocol requires the host sandbox before any non-atomic tool call; "${tool || '<unknown>'}" was refused. ` +
      'Relaunch Codex through scripts/mcp/atomic-edit/codex-atomic-host-launcher.mjs so the process, filesystem writes, temp writes, and network boundary are controlled before atomic tools execute.',
  );
}

deny(
  `Codex atomic-only protocol: native/non-atomic tool "${tool || '<unknown>'}" is forbidden. ` +
    'Only atomic-edit MCP tools may execute computation. If no existing atomic tool can perform this action, ' +
    'the next legal action is to use atomic-edit itself (atomic_create_file, atomic_replace_text, atomic_edit_symbol, ' +
    'atomic_transaction, atomic_exec inside its admission envelope, etc.) to implement the missing computation inside atomic-edit first. ' +
    'Positive actions must create only admitted byte-correct results; negative actions must be routed through atomic gates that prove the target bytes are non-correct/removable, never through native tooling.',
);
