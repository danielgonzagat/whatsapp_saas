#!/usr/bin/env node
/**
 * bypass-report.mjs — MOVE E. Reads .atomic/bypass-ledger.jsonl and reports the
 * bypass-rate: how often the agent reached for a factory/Bash tool when an
 * atomic tool existed. Separates preventedByDenyHook (already blocked — NOT a
 * real bypass) from silentlyAllowedBypasses (the genuine signal). Denominator =
 * detectable opportunities only (undetectable calls never reach the ledger), so
 * the headline rate stays honest.
 *
 * HONESTY (proof #1) — three states, never green-by-absence:
 *   - 'unobserved'      : no opportunity AND no heartbeat. The observer may not be
 *                         wired or no traffic has flowed. Certifies NOTHING.
 *   - 'watching'        : heartbeats present (the hook FIRED on some tool calls)
 *                         but ZERO real bypass opportunities yet. The observer is
 *                         alive but has not yet observed a routable decision, so it
 *                         still proves nothing about no-bypass.
 *   - 'observed-clean'  : >=1 real detectable opportunity, all clean. THIS is the
 *                         only state that certifies no-bypass.
 *   - 'bypasses-present': >=1 silently-allowed bypass. RED.
 * A heartbeat alone NEVER yields observed-clean — that was the laundering bug.
 * Flags: --json, --strict (exit 1 if any silent bypass), --since=<ms-epoch>.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const strict = args.includes('--strict');
const sinceArg = args.find((a) => a.startsWith('--since='));
const since = sinceArg ? Number(sinceArg.split('=')[1]) : 0;

const repoRoot = process.env.CODEX_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const ledger = path.join(repoRoot, '.atomic', 'bypass-ledger.jsonl');
const heartbeatLedger = path.join(repoRoot, '.atomic', 'bypass-observer-heartbeat.jsonl');

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
const isForeignShellNoise = (r) => r.strictAtomicOnly !== true && typeof r.category === "string" && r.category.startsWith("bash-");
const silentlyAllowed = recs.filter((r) => !r.blockedByDenyHook && !isForeignShellNoise(r)).length;
const bypassRate = detectable ? silentlyAllowed / detectable : 0;
const perCategory = {};
for (const r of recs) perCategory[r.category] = (perCategory[r.category] || 0) + 1;

const observedHookEvents = heartbeats.length;
const lastObservedAt = Math.max(0, ...recs.map((r) => Number(r.ts) || 0), ...heartbeats.map((r) => Number(r.ts) || 0));
// observed = a real bypass OPPORTUNITY was recorded. A heartbeat alone is NOT an
// observation of no-bypass — the hook fired on some tool, but proved nothing.
const observed = detectable > 0;
const observerInstalled = detectObserverInstalled();
// Three honest states (+ RED). observed-clean REQUIRES detectable>0.
const status =
  silentlyAllowed > 0
    ? 'bypasses-present'
    : detectable > 0
      ? 'observed-clean'
      : observedHookEvents > 0
        ? 'watching'
        : 'unobserved';

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
  if (status === 'watching') {
    console.log('  (observer ALIVE — heartbeats recorded — but ZERO bypass opportunities yet; proves nothing about no-bypass until a real opportunity flows)');
  } else if (status === 'unobserved') {
    console.log(
      observerInstalled
        ? '  (observer wired but no heartbeat/opportunity recorded yet — UNOBSERVED until hook traffic flows)'
        : '  (ledger empty AND observer not wired — UNOBSERVED; wire bypass-observer-hook.mjs into .codex/hooks.json or .claude/settings*.json PreToolUse)',
    );
  }
}

process.exit(strict && silentlyAllowed > 0 ? 1 : 0);
