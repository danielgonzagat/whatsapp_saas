#!/usr/bin/env node
/**
 * TUI-abolished enforcement (Daniel, 2026-05-15, ratified & repeated).
 *
 * "Casca nativa fica; renderer de diff nativo morre." The Claude Code TUI
 * draws a whole-line +/- block ONLY for the built-in Edit/Write/MultiEdit/
 * NotebookEdit tools — and that renderer cannot be disabled from inside.
 * So we BAN those tools for code: every code mutation must go through
 * mcp__atomic-edit__* (whose result carries the char-level atomicDiff +
 * FounderBlock — the only permitted visual proof).
 *
 * PreToolUse hook protocol: read the tool call on stdin, emit a structured
 * permission decision on stdout. We DENY native edits to code files and
 * steer to the atomic tool; non-code (pure docs/text) and all non-edit
 * tools pass through, so the session is never bricked for prose.
 *
 * Honest scope: this enforces avoidance (the harness then renders nothing
 * for code edits and the tool output is the only thing shown). It does NOT
 * "disable the renderer" — that is impossible; avoidance is the mechanism.
 */
import { readFileSync } from 'node:fs';

const NATIVE_EDIT = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
// Code/structured files the atomic-edit engine validates. Pure prose
// (.md/.txt/none) is NOT blocked — Daniel's rule is about *code*.
const CODE_EXT =
  /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json|py|go|rs|java|kt|c|h|cc|cpp|hpp|cs|rb|php|swift|scala|sh|bash|zsh|css|scss|less|sql|ya?ml|toml|prisma)$/i;

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

const input = readStdin();
const tool = input.tool_name ?? input.toolName ?? '';
const ti = input.tool_input ?? input.toolInput ?? {};
const filePath = ti.file_path ?? ti.filePath ?? ti.path ?? '';

const allow = () => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' },
    }),
  );
  process.exit(0);
};

const deny = (reason) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
};

if (!NATIVE_EDIT.has(tool)) allow();
if (filePath && !CODE_EXT.test(String(filePath))) allow(); // prose/docs OK

deny(
  `TUI-abolished rule: native ${tool} on code is banned so the harness never ` +
    `renders its whole-line +/- diff. Use mcp__atomic-edit__* instead ` +
    `(atomic_replace_range / atomic_replace_text / atomic_edit_symbol / ` +
    `atomic_replace_literal / atomic_replace_property_value / atomic_wrap_range / ` +
    `atomic_transaction / atomic_add_import …). The tool returns the char-level ` +
    `atomicDiff [-removed-]{+added+} + FounderBlock — the only permitted visual ` +
    `proof. If mcp__atomic-edit__* is not in this session's tools, the server ` +
    `is not loaded: say so and start a fresh session (it is enabled in ` +
    `.mcp.json + ~/.claude.json). Do NOT silently fall back to native edit.`,
);
