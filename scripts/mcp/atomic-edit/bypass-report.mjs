#!/usr/bin/env node
/**
 * bypass-report.mjs — MOVE E. Reads .atomic/bypass-ledger.jsonl and reports the
 * bypass-rate: how often the agent reached for a factory/Bash tool when an
 * atomic tool existed. Separates preventedByDenyHook (already blocked — NOT a
 * real bypass) from silentlyAllowedBypasses (the genuine signal). Denominator =
 * detectable opportunities only (undetectable calls never reach the ledger), so
 * the headline rate stays honest. Flags: --json, --strict (exit 1 if any silent
 * bypass), --since=<ms-epoch>.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const strict = args.includes('--strict');
const sinceArg = args.find((a) => a.startsWith('--since='));
const since = sinceArg ? Number(sinceArg.split('=')[1]) : 0;

const repoRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const ledger = path.join(repoRoot, '.atomic', 'bypass-ledger.jsonl');

let recs = [];
try {
  for (const line of fs.readFileSync(ledger, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (!since || (r.ts && r.ts >= since)) recs.push(r);
    } catch {
      /* tolerate a truncated trailing line */
    }
  }
} catch {
  /* no ledger yet */
}

const detectable = recs.length;
const prevented = recs.filter((r) => r.blockedByDenyHook).length;
const silentlyAllowed = recs.filter((r) => !r.blockedByDenyHook).length;
const bypassRate = detectable ? silentlyAllowed / detectable : 0;
const perCategory = {};
for (const r of recs) perCategory[r.category] = (perCategory[r.category] || 0) + 1;

const out = {
  detectableOpportunities: detectable,
  preventedByDenyHook: prevented,
  silentlyAllowedBypasses: silentlyAllowed,
  bypassRate: Number(bypassRate.toFixed(3)),
  perCategory,
};

if (asJson) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(
    `bypass-rate: ${(bypassRate * 100).toFixed(1)}% — ${silentlyAllowed}/${detectable} detectable opportunities ` +
      `were silently allowed (${prevented} prevented by the deny-hook).`,
  );
  for (const [k, v] of Object.entries(perCategory)) console.log(`  ${k}: ${v}`);
  if (detectable === 0) {
    console.log('  (ledger empty — wire bypass-observer-hook.mjs into .claude/settings.json PreToolUse to populate it)');
  }
}

process.exit(strict && silentlyAllowed > 0 ? 1 : 0);
