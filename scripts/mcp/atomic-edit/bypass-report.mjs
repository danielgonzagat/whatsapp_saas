#!/usr/bin/env node
/**
 * bypass-report.mjs — MOVE E. Reads .atomic/bypass-ledger.jsonl and reports the
 * bypass-rate: how often the agent reached for a factory/Bash tool when an
 * atomic tool existed. Separates preventedByDenyHook (already blocked — NOT a
 * real bypass) from silentlyAllowedBypasses (the genuine signal). Denominator =
 * detectable opportunities only (undetectable calls never reach the ledger), so
 * the headline rate stays honest.
 *
 * HONESTY (proof #1): an EMPTY ledger is UNOBSERVED, not proven-clean, unless the
 * observer heartbeat proves hook traffic flowed with zero detectable opportunities.
 * The report therefore exposes:
 *   - observed: true iff >=1 bypass opportunity OR >=1 observer heartbeat exists
 *   - observerInstalled: true iff bypass-observer-hook.mjs is wired into
 *     Codex .codex/hooks.json or Claude .claude/settings*.json PreToolUse (so
 *     absence of records can be interpreted against a real observer boundary)
 *   - status: 'unobserved' | 'observed-clean' | 'bypasses-present'
 * so the Y certificate can mark the domain UNJUDGED when unobserved instead of
 * green-by-absence. Flags: --json, --strict (exit 1 if any silent bypass),
 * --since=<ms-epoch>.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const strict = args.includes('--strict');
const sinceArg = args.find((a) => a.startsWith('--since='));
const since = sinceArg ? Number(sinceArg.split('=')[1]) : 0;

const repoRoot = process.env.CODEX_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const atomicDir = path.join(repoRoot, '.atomic');
const ledger = path.join(atomicDir, 'bypass-ledger.jsonl');
const heartbeatLedger = path.join(atomicDir, 'bypass-observer-heartbeat.jsonl');

function readJsonl(file) {
  const out = [];
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (!since || (r.ts && r.ts >= since)) out.push(r);
      } catch {
        /* tolerate a truncated trailing line */
      }
    }
  } catch {
    /* no ledger yet */
  }
  return out;
}

const recs = readJsonl(ledger);
const heartbeats = readJsonl(heartbeatLedger);

/** Is the observer hook actually wired into the owner-gated CLI hook settings? */
function detectObserverInstalled() {
  for (const rel of ['.codex/hooks.json', '.claude/settings.json', '.claude/settings.local.json']) {
    try {
      const txt = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
      if (txt.includes('bypass-observer-hook.mjs')) return true;
    } catch {
      /* file may not exist */
    }
  }
  return false;
}

const detectable = recs.length;
const prevented = recs.filter((r) => r.blockedByDenyHook).length;
const silentlyAllowed = recs.filter((r) => !r.blockedByDenyHook).length;
const bypassRate = detectable ? silentlyAllowed / detectable : 0;
const perCategory = {};
for (const r of recs) perCategory[r.category] = (perCategory[r.category] || 0) + 1;

const observedHookEvents = heartbeats.length;
const lastObservedAt = Math.max(0, ...recs.map((r) => Number(r.ts) || 0), ...heartbeats.map((r) => Number(r.ts) || 0));
const observed = detectable > 0 || observedHookEvents > 0;
const observerInstalled = detectObserverInstalled();
const status = silentlyAllowed > 0 ? 'bypasses-present' : observed ? 'observed-clean' : 'unobserved';

const out = {
  detectableOpportunities: detectable,
  preventedByDenyHook: prevented,
  silentlyAllowedBypasses: silentlyAllowed,
  bypassRate: Number(bypassRate.toFixed(3)),
  perCategory,
  observedHookEvents,
  lastObservedAt: lastObservedAt || null,
  observed,
  observerInstalled,
  status,
};

if (asJson) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(
    `bypass-rate: ${(bypassRate * 100).toFixed(1)}% — ${silentlyAllowed}/${detectable} detectable opportunities ` +
      `were silently allowed (${prevented} prevented by the deny-hook). status=${status}, observerInstalled=${observerInstalled}, ` +
      `observedHookEvents=${observedHookEvents}.`,
  );
  for (const [k, v] of Object.entries(perCategory)) console.log(`  ${k}: ${v}`);
  if (!observed) {
    console.log(
      observerInstalled
        ? '  (observer wired but no heartbeat/opportunity recorded yet — UNOBSERVED until hook traffic flows)'
        : '  (ledger empty AND observer not wired — UNOBSERVED; wire bypass-observer-hook.mjs into .codex/hooks.json or .claude/settings*.json PreToolUse)',
    );
  }
}

process.exit(strict && silentlyAllowed > 0 ? 1 : 0);
