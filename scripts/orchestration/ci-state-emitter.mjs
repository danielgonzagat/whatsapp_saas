#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { rewriteMirrorFrontmatterTags } from '../obsidian-mirror-daemon-indexes.mjs';

const VAULT_ROOT = resolve(
  process.env.KLOEL_VAULT_ROOT || '/Users/danielpenin/Documents/Obsidian Vault',
);
const MIRROR_ROOT = resolve(
  process.env.KLOEL_MIRROR_ROOT || join(VAULT_ROOT, 'Kloel', '99 - Espelho do Codigo'),
);
const SOURCE_MIRROR_DIR = join(MIRROR_ROOT, '_source');
const HUD_DIR = join(SOURCE_MIRROR_DIR, '.hud');
const CI_STATE_PATH = join(HUD_DIR, 'ci-state.json');

const ANCHOR_REL = '_dot_github/workflows/ci-cd.yml.md';
const ANCHOR_ABS = join(SOURCE_MIRROR_DIR, ANCHOR_REL);

const CI_TAG_PREFIX = 'ci/';

function ghAvailable() {
  try {
    execSync('gh --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getCurrentBranch() {
  try {
    return execSync('git branch --show-current', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function fetchCiRuns(branch) {
  const raw = execSync(
    `gh run list --branch ${branch} --limit 10 --json databaseId,name,status,conclusion,url,createdAt,headSha`,
    { encoding: 'utf8', maxBuffer: 512 * 1024 },
  );
  return JSON.parse(raw);
}

function computeAggregateStatus(runs) {
  if (!runs.length) return 'unknown';
  const conclusions = runs.map((r) => r.conclusion).filter(Boolean);
  if (!conclusions.length) return 'unknown';
  const allSuccess = conclusions.every((c) => c === 'success');
  const anyFailure = conclusions.some(
    (c) => c === 'failure' || c === 'cancelled' || c === 'timed_out',
  );
  if (allSuccess) return 'passing';
  if (anyFailure && conclusions.every((c) => c !== 'success')) return 'failing';
  return 'mixed';
}

function readMirrorTags(mirrorAbsPath) {
  if (!existsSync(mirrorAbsPath)) return null;
  const content = readFileSync(mirrorAbsPath, 'utf8');
  if (!content.startsWith('---\n')) return null;
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) return null;
  const frontmatter = content.slice(4, end).split('\n');
  const tags = [];
  let inTags = false;
  for (const line of frontmatter) {
    if (line === 'tags:') {
      inTags = true;
      continue;
    }
    if (inTags) {
      if (line.startsWith('  - ')) {
        tags.push(line.slice(4));
        continue;
      }
      inTags = false;
    }
  }
  return tags;
}

function tagAnchor(aggregateStatus, dry) {
  if (!['passing', 'failing'].includes(aggregateStatus)) return false;
  if (!existsSync(ANCHOR_ABS)) return false;

  const existing = readMirrorTags(ANCHOR_ABS);
  if (existing === null) return false;

  const nextTag = `ci/${aggregateStatus}`;
  const merged = existing.filter((t) => !t.startsWith(CI_TAG_PREFIX));
  merged.push(nextTag);
  merged.sort();

  if (JSON.stringify(merged) === JSON.stringify(existing)) return false;

  if (!dry) {
    return rewriteMirrorFrontmatterTags(ANCHOR_REL, merged);
  }
  return true;
}

function writeJsonAtomic(filePath, value) {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  if (existsSync(filePath) && readFileSync(filePath, 'utf8') === next) {
    return false;
  }
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, next, 'utf8');
  renameSync(tmp, filePath);
  return true;
}

function main() {
  const dry = process.argv.includes('--dry');

  if (!ghAvailable()) {
    process.stderr.write(
      JSON.stringify({ status: 'fail', blocker: 'gh CLI not available' }) + '\n',
    );
    process.exit(1);
  }

  const branch = getCurrentBranch();
  if (!branch) {
    process.stderr.write(
      JSON.stringify({ status: 'fail', blocker: 'cannot determine current git branch' }) + '\n',
    );
    process.exit(1);
  }

  let runs;
  try {
    runs = fetchCiRuns(branch);
  } catch (e) {
    process.stderr.write(
      JSON.stringify({ status: 'fail', blocker: `gh run list failed: ${e.message}` }) + '\n',
    );
    process.exit(1);
  }

  const aggregateStatus = computeAggregateStatus(runs);
  const lastRun = new Date().toISOString();

  const payload = {
    schema: 'kloel.ci.v1',
    lastRun,
    runs: runs.map((r) => ({
      name: r.name,
      status: r.status,
      conclusion: r.conclusion,
      url: r.url,
      createdAt: r.createdAt,
    })),
    aggregateStatus,
  };

  if (!dry) {
    mkdirSync(HUD_DIR, { recursive: true });
    writeJsonAtomic(CI_STATE_PATH, payload);
  }

  let anchorTagged = false;
  if (['passing', 'failing'].includes(aggregateStatus)) {
    anchorTagged = tagAnchor(aggregateStatus, dry);
  }

  const summary = {
    runsFetched: runs.length,
    aggregateStatus,
    anchorTagged,
  };
  process.stderr.write(JSON.stringify(summary) + '\n');
}

main();
