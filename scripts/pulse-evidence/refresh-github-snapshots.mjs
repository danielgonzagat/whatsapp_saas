#!/usr/bin/env node
/**
 * Refresh `PULSE_GITHUB_STATE.json` and `PULSE_GITHUB_ACTIONS_STATE.json`
 * (gitignored runtime evidence files) using the `gh` CLI.
 *
 * PULSE marks these files stale after 6 hours
 * (`scripts/pulse/external-signals/snapshot-config.ts:14-15`).
 * When stale the `evidenceFresh` gate fails, knocking 4-7 points off the
 * cert score with `failureClass=missing_evidence`.
 *
 * This script lives OUTSIDE `scripts/pulse/` because the PULSE auditor source
 * is locked per CLAUDE.md (REGRA DE AUTO-CORRECAO DO PULSE). We only refresh
 * runtime artifacts that PULSE already reads, never touch its detector code.
 *
 * Usage:
 *   node scripts/pulse-evidence/refresh-github-snapshots.mjs
 *
 * Requires:
 *   - `gh` CLI authenticated (gh auth status)
 *   - Run from repo root (resolves origin/owner via `gh repo view`)
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf-8', cwd: REPO_ROOT }).trim();
}

function ghJson(cmd) {
  const out = sh(cmd);
  if (!out) return null;
  return JSON.parse(out);
}

function resolveOwnerRepo() {
  try {
    const view = ghJson('gh repo view --json owner,name');
    return { owner: view.owner.login, repo: view.name };
  } catch (err) {
    process.stderr.write(`Could not resolve owner/repo via gh: ${err.message}\n`);
    process.exit(2);
  }
}

function refreshGithubState({ owner, repo }) {
  const now = new Date().toISOString();
  // Recent commits on default branch (main).
  const commitsRaw = ghJson(
    `gh api -X GET repos/${owner}/${repo}/commits -F per_page=20 --jq '[.[] | {sha: .sha, message: .commit.message, timestamp: .commit.committer.date, url: .html_url}]'`,
  ) ?? [];

  // Recent PRs (any state).
  const prsRaw = ghJson(
    `gh api -X GET 'repos/${owner}/${repo}/pulls?state=all&per_page=20&sort=updated&direction=desc' --jq '[.[] | {id: .id|tostring, number: .number, title: .title, state: .state, merged: (.merged_at != null), updatedAt: .updated_at, mergedAt: .merged_at, createdAt: .created_at, url: .html_url, labels: [.labels[].name]}]'`,
  ) ?? [];

  const payload = {
    generatedAt: now,
    syncedAt: now,
    owner,
    repo,
    commits: commitsRaw,
    pullRequests: prsRaw,
  };

  const outPath = resolve(REPO_ROOT, 'PULSE_GITHUB_STATE.json');
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  process.stderr.write(
    `Wrote ${outPath} (${commitsRaw.length} commits, ${prsRaw.length} PRs, syncedAt=${now})\n`,
  );
}

function refreshGithubActionsState({ owner, repo }) {
  const now = new Date().toISOString();
  // Recent workflow runs on any branch.
  const runsRaw =
    ghJson(
      `gh api -X GET 'repos/${owner}/${repo}/actions/runs?per_page=20' --jq '[.workflow_runs[] | {id: .id|tostring, name: .name, workflow: .display_title, status: .status, conclusion: .conclusion, createdAt: .created_at, updatedAt: .updated_at, timestamp: .updated_at, url: .html_url, headSha: .head_sha}]'`,
    ) ?? [];

  const payload = {
    generatedAt: now,
    syncedAt: now,
    owner,
    repo,
    runs: runsRaw,
  };

  const outPath = resolve(REPO_ROOT, 'PULSE_GITHUB_ACTIONS_STATE.json');
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  process.stderr.write(
    `Wrote ${outPath} (${runsRaw.length} runs, syncedAt=${now})\n`,
  );
}

function main() {
  const { owner, repo } = resolveOwnerRepo();
  process.stderr.write(`Refreshing PULSE GitHub adapters for ${owner}/${repo}…\n`);
  refreshGithubState({ owner, repo });
  refreshGithubActionsState({ owner, repo });
  process.stderr.write('Done.\n');
}

main();
