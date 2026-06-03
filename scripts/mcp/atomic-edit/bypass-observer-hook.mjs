#!/usr/bin/env node
/**
 * bypass-observer-hook.mjs — MOVE E PreToolUse observer. Records every hook event
 * to .atomic/bypass-observer-heartbeat.jsonl and every detectable BYPASS
 * opportunity (the agent reached for a factory/Bash tool when an atomic tool
 * existed) to .atomic/bypass-ledger.jsonl, so the bypass-rate can be driven to
 * zero without fabricating opportunities. FAIL-OPEN: any parse/classify/write
 * error exits 0 silently and NEVER emits a permissionDecision — an observer must
 * never block or change agent behavior (that would corrupt the metric). Pure
 * regex + append-only ledgers, sub-10ms, zero spawn.
 *
 * Wiring: add this script to Codex .codex/hooks.json or Claude
 * .claude/settings*.json PreToolUse for the broad tool matcher. Until wired, the
 * ledger stays empty and the report shows the no-bypass domain as unobserved.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { classifyToolCall } from './bypass-classify.mjs';

function appendJsonl(file, record) {
  fs.appendFileSync(file, JSON.stringify(record) + '\n');
}

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw || '{}');
    const tool = input.tool_name ?? input.toolName ?? '';
    const ti = input.tool_input ?? input.toolInput ?? {};
    const strictAtomicOnly = process.env.ATOMIC_HOST_ATOMIC_ONLY === '1' || Boolean(process.env.CODEX_PROJECT_DIR);
    const c = classifyToolCall({ tool, toolInput: ti, strictAtomicOnly });
    const repoRoot = process.env.CODEX_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const dir = path.join(repoRoot, '.atomic');
    fs.mkdirSync(dir, { recursive: true });
    const ts = Date.now();
    appendJsonl(path.join(dir, 'bypass-observer-heartbeat.jsonl'), {
      ts,
      tool,
      category: c.category,
      detectable: c.detectable,
      atomicEquivalent: c.atomicEquivalent,
      blockedByDenyHook: c.blockedByDenyHook,
      strictAtomicOnly,
      target: c.target,
    });
    if (c.detectable && c.atomicEquivalent) {
      const rec = {
        ts,
        tool,
        category: c.category,
        atomicEquivalent: c.atomicEquivalent,
        blockedByDenyHook: c.blockedByDenyHook,
        strictAtomicOnly,
        target: c.target,
      };
      appendJsonl(path.join(dir, 'bypass-ledger.jsonl'), rec);
    }
  } catch {
    /* fail-open: never block */
  }
  process.exit(0);
});
