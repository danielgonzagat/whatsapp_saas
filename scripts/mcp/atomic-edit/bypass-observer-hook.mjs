#!/usr/bin/env node
/**
 * bypass-observer-hook.mjs — MOVE E PreToolUse observer. Records every
 * detectable BYPASS opportunity (the agent reached for a factory/Bash tool when
 * an atomic tool existed) to .atomic/bypass-ledger.jsonl, so the bypass-rate can
 * be driven to zero. FAIL-OPEN: any parse/classify/write error exits 0 silently
 * and NEVER emits a permissionDecision — an observer must never block or change
 * agent behavior (that would corrupt the metric). Pure regex + one append,
 * sub-10ms, zero spawn.
 *
 * Wiring (OWNER-GATED — .claude/settings.json is protected): add this script to
 * the PreToolUse hooks for matcher "Read|Grep|Glob|Bash|Write|Edit|MultiEdit".
 * Until wired, the ledger stays empty and the report shows 0 opportunities.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { classifyToolCall } from './bypass-classify.mjs';

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw || '{}');
    const tool = input.tool_name ?? input.toolName ?? '';
    const ti = input.tool_input ?? input.toolInput ?? {};
    const c = classifyToolCall({ tool, toolInput: ti });
    if (c.detectable && c.atomicEquivalent) {
      const repoRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
      const dir = path.join(repoRoot, '.atomic');
      fs.mkdirSync(dir, { recursive: true });
      const rec = {
        ts: Date.now(),
        tool,
        category: c.category,
        atomicEquivalent: c.atomicEquivalent,
        blockedByDenyHook: c.blockedByDenyHook,
        target: c.target,
      };
      fs.appendFileSync(path.join(dir, 'bypass-ledger.jsonl'), JSON.stringify(rec) + '\n');
    }
  } catch {
    /* fail-open: never block */
  }
  process.exit(0);
});
