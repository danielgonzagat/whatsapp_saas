#!/usr/bin/env node
// tools/auto-pr/update-stale-branches.mjs — rebase/merge-main on PRs behind main.
//
// After a base-fix PR lands on main, the open PRs branched from the older
// state need to pull the new main into their branch to see the fix. This tool
// invokes `gh pr update-branch` on every PR whose head is behind main, with
// optional filtering by branch prefix.
//
// CLI:
//   node tools/auto-pr/update-stale-branches.mjs                  # all open PRs by me
//   node tools/auto-pr/update-stale-branches.mjs --prefix=auto/   # filter
//   node tools/auto-pr/update-stale-branches.mjs --dry-run

import { argv } from 'node:process';
import { spawn } from 'node:child_process';

const REMOTE = 'danielgonzagat/whatsapp_saas';
const DRY = argv.includes('--dry-run');
const PREFIX_FILTER = argv.find((a) => a.startsWith('--prefix='))?.split('=')[1] || 'auto/,chore/batch-';
const PREFIXES = PREFIX_FILTER.split(',').filter(Boolean);

async function main() {
  const out = await capture(['gh', 'pr', 'list', '--repo', REMOTE, '--state', 'open', '--author', '@me', '--limit', '50', '--json', 'number,headRefName,baseRefName,mergeStateStatus']);
  const prs = JSON.parse(out);
  let updated = 0;
  let skipped = 0;

  for (const pr of prs) {
    if (!PREFIXES.some((p) => pr.headRefName.startsWith(p))) {
      skipped++;
      continue;
    }
    // BEHIND, OUT_OF_DATE, or just refresh anyway. The gh CLI handles no-op gracefully.
    console.log(`update #${pr.number} ${pr.headRefName}`);
    if (DRY) continue;
    try {
      await capture(['gh', 'pr', 'update-branch', String(pr.number), '--repo', REMOTE]);
      updated++;
    } catch (err) {
      console.error(`  ERROR #${pr.number}: ${err.message.split('\n')[0]}`);
    }
  }
  console.log(`done: ${updated} updated, ${skipped} skipped (prefix mismatch)`);
}

function capture(args) {
  return new Promise((resolve, reject) => {
    let out = '';
    const child = spawn(args[0], args.slice(1), { stdio: ['inherit', 'pipe', 'pipe'] });
    child.stdout?.on('data', (d) => (out += d.toString()));
    child.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`${args.join(' ')} → ${code}`))));
    child.on('error', reject);
  });
}

await main();
