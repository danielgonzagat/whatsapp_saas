#!/usr/bin/env node

import { readFileSync, existsSync, writeFileSync, renameSync } from 'node:fs';
import { join, relative, resolve, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rewriteMirrorFrontmatterTags } from '../obsidian-mirror-daemon-indexes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(join(__dirname, '..', '..'));

const VAULT_ROOT = resolve(
  process.env.KLOEL_VAULT_ROOT || '/Users/danielpenin/Documents/Obsidian Vault',
);
const MIRROR_ROOT = resolve(
  process.env.KLOEL_MIRROR_ROOT || join(VAULT_ROOT, 'Kloel', '99 - Espelho do Codigo'),
);
const SOURCE_MIRROR_DIR = join(MIRROR_ROOT, '_source');
const MANIFEST_PATH = join(SOURCE_MIRROR_DIR, 'manifest.json');

const PULSE_HEALTH_PATH = join(REPO_ROOT, '.pulse', 'current', 'PULSE_HEALTH.json');
const PULSE_MANIFEST_PATH = join(REPO_ROOT, 'pulse.manifest.json');

const TIER_TAG_PREFIX = 'kloel/tier-';
const SHELL_SIZE_THRESHOLD = 500;

const SOURCE_DIR_PREFIXES = ['backend/src/', 'frontend/src/', 'worker/', 'scripts/pulse/'];

const SKIP_PREFIXES = [
  'docs/',
  'ops/',
  '.github/',
  '.husky/',
  'prisma/',
  'nginx/',
  'e2e/',
  '.claude/',
  '.agents/',
  '.pulse/',
  '.omx/',
  '.gitnexus/',
  '.kilo/',
  '.beads/',
  '.serena/',
  '.turbo/',
  'node_modules/',
  'dist/',
  'build/',
  'coverage/',
  '.next/',
  'artifacts/',
  'tmp/',
];

const SKIP_ROOT_FILES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
  '.editorconfig',
  '.prettierrc.json',
  '.gitignore',
  '.nvmrc',
  '.node-version',
  '.npmrc',
  '.codacy.yml',
  'CLAUDE.md',
  'AGENTS.md',
  'CODEX.md',
  '.sentryclirc',
]);

const SKIP_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.mp3',
  '.mp4',
  '.webm',
  '.mov',
  '.sqlite',
  '.sqlite3',
  '.db',
  '.wasm',
  '.bin',
  '.lock',
  '.log',
  '.map',
  '.tsbuildinfo',
]);

function isSourceFile(relPath) {
  if (SKIP_ROOT_FILES.has(relPath)) return false;
  for (const prefix of SKIP_PREFIXES) {
    if (relPath.startsWith(prefix)) return false;
  }
  const ext = relPath.includes('.') ? '.' + relPath.split('.').pop() : '';
  if (SKIP_EXTS.has(ext)) return false;
  if (
    relPath.includes('/node_modules/') ||
    relPath.includes('/dist/') ||
    relPath.includes('/build/') ||
    relPath.includes('/coverage/') ||
    relPath.includes('/.next/') ||
    relPath.includes('/__pycache__/')
  )
    return false;
  return SOURCE_DIR_PREFIXES.some((p) => relPath.startsWith(p));
}

function isTestFile(relPath, machineKinds) {
  if (machineKinds && machineKinds.includes('test')) return true;
  return (
    relPath.endsWith('.spec.ts') ||
    relPath.endsWith('.spec.tsx') ||
    relPath.endsWith('.test.ts') ||
    relPath.endsWith('.test.tsx') ||
    relPath.endsWith('.spec.js') ||
    relPath.endsWith('.test.js') ||
    relPath.includes('/__tests__/')
  );
}

function buildTestSet(manifestFiles) {
  const testSet = new Set();
  for (const [relMirror, entry] of Object.entries(manifestFiles)) {
    const source = entry.source;
    if (!source) continue;
    if (isTestFile(source, entry.machine_kinds)) {
      testSet.add(source);
      const base = source.replace(/\.(spec|test)\.[cm]?[jt]sx?$/, '').replace(/\/__tests__\//, '/');
      testSet.add(base);
    }
  }
  return testSet;
}

function hasTest(relPath, testSet, manifestFiles) {
  if (testSet.has(relPath)) return true;
  const ext = extname(relPath);
  const withoutExt = ext ? relPath.slice(0, -ext.length) : relPath;
  const candidates = [
    `${withoutExt}.spec${ext}`,
    `${withoutExt}.test${ext}`,
    `${dirname(relPath)}/__tests__/${basename(withoutExt)}.spec${ext}`,
    `${dirname(relPath)}/__tests__/${basename(withoutExt)}.test${ext}`,
  ];
  for (const c of candidates) {
    const mirrorRel = c.replace(/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/, '.md');
    if (manifestFiles[mirrorRel]) return true;
  }
  const stem = basename(withoutExt).replace(
    /\.(controller|service|module|dto|route|page|component)$/i,
    '',
  );
  return [...testSet].some((testSource) => testSource.includes(stem) && stem.length > 3);
}

function atomWrite(absPath, content) {
  const tmp = absPath + '.tmp';
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, absPath);
}

function buildFileSignalMap(breaks, repoRoot) {
  const map = new Map();
  for (const b of breaks) {
    let file = b.file || '';
    if (file.startsWith(repoRoot + '/')) {
      file = file.slice(repoRoot.length + 1);
    }
    if (!file) continue;

    let entry = map.get(file);
    if (!entry) {
      entry = {
        deadHandlers: 0,
        stubSignals: 0,
        fakeDataSignals: 0,
        weakSignals: 0,
        totalBreaks: 0,
        allTypes: new Set(),
      };
      map.set(file, entry);
    }

    const bt = b.type || '';
    const src = b.source || '';
    const tm = b.truthMode || '';
    const combined = `${bt} ${src}`.toLowerCase();

    if (bt.includes('handler-effect-unobserved') || bt.includes('dead-handler')) {
      entry.deadHandlers++;
    }
    if (combined.includes('dead-code') || combined.includes('stub') || combined.includes('todo')) {
      entry.stubSignals++;
    }
    if (
      combined.includes('fake_data') ||
      combined.includes('fake_save') ||
      combined.includes('hardcoded_data') ||
      combined.includes('random_data')
    ) {
      entry.fakeDataSignals++;
    }
    if (tm === 'weak_signal') {
      entry.weakSignals++;
    }
    entry.totalBreaks++;
    entry.allTypes.add(bt);
  }
  return map;
}

function buildModuleStateMap() {
  if (!existsSync(PULSE_MANIFEST_PATH)) return new Map();
  try {
    const manifest = JSON.parse(readFileSync(PULSE_MANIFEST_PATH, 'utf8'));
    const map = new Map();
    for (const mod of manifest.modules || []) {
      if (mod.name) map.set(mod.name.toLowerCase(), mod.state);
    }
    for (const mod of manifest.legacyModules || []) {
      if (mod.name) map.set(mod.name.toLowerCase(), mod.state);
    }
    return map;
  } catch {
    return new Map();
  }
}

function inferTier(relPath, signalEntry, testsExist, sourceSize, entryFields) {
  const deadHandlers = signalEntry ? signalEntry.deadHandlers : 0;
  const stubSignals = signalEntry ? signalEntry.stubSignals : 0;
  const fakeData = signalEntry ? signalEntry.fakeDataSignals : 0;
  const totalBreaks = signalEntry ? signalEntry.totalBreaks : 0;
  const weakSignals = signalEntry ? signalEntry.weakSignals : 0;
  const hardSignals = deadHandlers + stubSignals + fakeData;

  const evidence = [];
  if (deadHandlers > 0) evidence.push(`pulse:${deadHandlers} dead-handler(s)`);
  if (stubSignals > 0) evidence.push(`pulse:${stubSignals} stub signal(s)`);
  if (fakeData > 0) evidence.push(`pulse:${fakeData} fake-data signal(s)`);
  if (weakSignals > 0) evidence.push(`pulse:${weakSignals} weak signal(s)`);
  if (totalBreaks > 0 && evidence.length === 0) {
    evidence.push(`pulse:${totalBreaks} diagnostic break(s)`);
  }
  if (testsExist) evidence.push('test:exists');

  if (sourceSize < SHELL_SIZE_THRESHOLD) {
    return {
      tier: 4,
      evidence: [`size:${sourceSize}b below ${SHELL_SIZE_THRESHOLD}b threshold`, ...evidence],
    };
  }

  if (hardSignals >= 3) {
    return { tier: 3, evidence };
  }

  if (hardSignals === 0 && testsExist) {
    return { tier: 1, evidence };
  }

  if (hardSignals >= 1 && hardSignals <= 2) {
    return { tier: 2, evidence };
  }

  return { tier: 2, evidence };
}

function readMirrorTags(mirrorRelPath) {
  const absPath = join(SOURCE_MIRROR_DIR, mirrorRelPath);
  if (!existsSync(absPath)) return null;
  const content = readFileSync(absPath, 'utf8');
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

function main() {
  const dry = process.argv.includes('--dry');

  if (!existsSync(SOURCE_MIRROR_DIR)) {
    process.stderr.write(
      JSON.stringify({ error: 'mirror source dir not found', path: SOURCE_MIRROR_DIR }) + '\n',
    );
    process.exit(2);
  }

  if (!existsSync(MANIFEST_PATH)) {
    process.stderr.write(
      JSON.stringify({ error: 'mirror manifest not found', path: MANIFEST_PATH }) + '\n',
    );
    process.exit(2);
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (e) {
    process.stderr.write(
      JSON.stringify({ error: 'failed to parse mirror manifest', msg: e.message }) + '\n',
    );
    process.exit(2);
  }

  const manifestFiles = manifest.files || {};

  let signalMap = new Map();
  if (existsSync(PULSE_HEALTH_PATH)) {
    try {
      const pulseHealth = JSON.parse(readFileSync(PULSE_HEALTH_PATH, 'utf8'));
      signalMap = buildFileSignalMap(pulseHealth.breaks || [], REPO_ROOT);
    } catch (e) {
      process.stderr.write(`tier-tags-emitter: WARN cannot read PULSE_HEALTH: ${e.message}\n`);
    }
  }

  const moduleStates = buildModuleStateMap();
  const testSet = buildTestSet(manifestFiles);

  const tiersDistribution = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let sidecarsWritten = 0;
  let mirrorsTagged = 0;
  let skipped = 0;
  let filesScanned = 0;

  for (const [relMirror, entry] of Object.entries(manifestFiles)) {
    const source = entry.source;
    if (!source) continue;

    if (!isSourceFile(source)) {
      skipped++;
      continue;
    }

    filesScanned++;

    const sourceSize = entry.source_size || 0;
    const machineKinds = entry.machine_kinds || [];
    const isTest = isTestFile(source, machineKinds);
    const testsExist = hasTest(source, testSet, manifestFiles);

    const signalEntry = signalMap.get(source) || null;

    let { tier, evidence } = inferTier(
      source,
      signalEntry,
      testsExist || isTest,
      sourceSize,
      entry,
    );

    if (isTest && tier !== 1) {
      tier = 1;
      evidence = ['test:file-itself', ...evidence];
    }

    tiersDistribution[tier]++;

    const mirrorAbs = join(SOURCE_MIRROR_DIR, relMirror);
    const sidecarPath = mirrorAbs.replace(/\.md$/, '.tier.json');
    const sidecar =
      JSON.stringify(
        {
          schema: 'kloel.tier.v1',
          tier,
          evidence,
          computedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + '\n';

    if (!dry) {
      atomWrite(sidecarPath, sidecar);
    }
    sidecarsWritten++;

    if (!existsSync(mirrorAbs)) continue;

    const existingTags = readMirrorTags(relMirror);
    if (existingTags === null) continue;

    const tierTag = `kloel/tier-${tier}`;
    const merged = existingTags.filter((t) => !t.startsWith(TIER_TAG_PREFIX));
    merged.push(tierTag);
    merged.sort();

    if (JSON.stringify(merged) === JSON.stringify(existingTags)) continue;

    if (!dry) {
      rewriteMirrorFrontmatterTags(relMirror, merged);
    }
    mirrorsTagged++;
  }

  const summary = {
    filesScanned,
    tiersDistribution,
    mirrorsTagged,
    sidecarsWritten,
    skipped,
  };
  process.stderr.write(JSON.stringify(summary) + '\n');
}

main();
