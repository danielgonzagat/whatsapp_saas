/**
 * Diff helpers for atomic-edit/advanced.ts — extracted so the main
 * module stays below the architecture-guard line budget.
 */

import { graphemeDiff } from './textunit.js';

export function previewDiff(before: string, after: string, label: string): string {
  const a = before.split('\n');
  const b = after.split('\n');
  // simple LCS-free context diff: find first/last divergence
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tailA = a.length - 1;
  let tailB = b.length - 1;
  while (tailA >= head && tailB >= head && a[tailA] === b[tailB]) {
    tailA--;
    tailB--;
  }
  const ctx = 2;
  const from = Math.max(0, head - ctx);
  const lines: string[] = [`--- ${label} (before)`, `+++ ${label} (after)`];
  for (let i = from; i < head; i++) lines.push(`  ${a[i]}`);
  for (let i = head; i <= tailA; i++) lines.push(`- ${a[i]}`);
  for (let i = head; i <= tailB; i++) lines.push(`+ ${b[i]}`);
  for (let i = tailA + 1; i <= Math.min(a.length - 1, tailA + ctx); i++) lines.push(`  ${a[i]}`);
  return lines.join('\n');
}

// ─── Atomic char-level diff ──────────────────────────────────────────────
// previewDiff above is the line-oriented +/- block the CLI harness already
// paints (whole line red / whole line green even for a 1-char change).
// characterDiff below is the TRUE atomic proof: preserved chars stay
// neutral, removed chars are red inside [- -], added chars green inside
// {+ +}. A whole line only shows as line-removed/added when the whole line
// was genuinely born or destroyed. ANSI-colored AND bracket-marked so it
// stays legible on no-color terminals (git --word-diff convention). This
// is returned in every mutating tool's payload, so the operator SEES the
// atomicity in the tool output even though the harness's own +/- block
// (which we cannot disable) keeps rendering line-level beside it.

const ESC = '[';
const RESET = `${ESC}0m`;
const RED = `${ESC}31m`;
const GREEN = `${ESC}32m`;
const DIM = `${ESC}2m`;

// LCS char-diff is O(n*m); only the divergent line block is fed to it, but
// cap it so a genuine large rewrite falls back to line markers (honest
// there — the whole block really did change) instead of blowing memory.
const CHAR_DIFF_CAP = 6000;

/**
 * Inline [-removed-]{+added+} diff. Operates on GRAPHEME CLUSTERS via
 * textunit.graphemeDiff — never splits a surrogate pair, combining mark or
 * ZWJ sequence, so the rendered proof can't show half an emoji (the silent
 * failure a UTF-16-index diff produces). The accent/emoji smoke cases lock
 * this in.
 */
function renderCharDiff(oldStr: string, newStr: string): string {
  return graphemeDiff(oldStr, newStr, {
    del: (s) => `${RED}[-${s}-]${RESET}`,
    add: (s) => `${GREEN}{+${s}+}${RESET}`,
  });
}

/**
 * Character-granular inline diff of `before`→`after`. Trims common leading
 * and trailing lines, char-diffs only the divergent block, and prints it
 * with 2 lines of neutral context for orientation.
 */
export function characterDiff(before: string, after: string, label: string): string {
  if (before === after) return `${DIM}= ${label} (no change)${RESET}`;
  const a = before.split('\n');
  const b = after.split('\n');
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tailA = a.length - 1;
  let tailB = b.length - 1;
  while (tailA >= head && tailB >= head && a[tailA] === b[tailB]) {
    tailA--;
    tailB--;
  }
  const oldBlock = a.slice(head, tailA + 1).join('\n');
  const newBlock = b.slice(head, tailB + 1).join('\n');
  const ctx = 2;
  const out: string[] = [`${DIM}--- ${label} (atomic char-level)${RESET}`];
  for (let i = Math.max(0, head - ctx); i < head; i++) out.push(`  ${a[i]}`);
  if (oldBlock.length + newBlock.length > CHAR_DIFF_CAP) {
    for (let i = head; i <= tailA; i++) out.push(`${RED}- ${a[i]}${RESET}`);
    for (let i = head; i <= tailB; i++) out.push(`${GREEN}+ ${b[i]}${RESET}`);
  } else {
    for (const ln of renderCharDiff(oldBlock, newBlock).split('\n')) out.push(`  ${ln}`);
  }
  for (let i = tailA + 1; i <= Math.min(a.length - 1, tailA + ctx); i++) out.push(`  ${a[i]}`);
  return out.join('\n');
}
