import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { rewriteMirrorFrontmatterTags } from '../../obsidian-mirror-daemon-indexes.mjs';
import {
  REPO_ROOT,
  SOURCE_MIRROR_DIR,
  MANIFEST_PATH,
  PULSE_HEALTH_PATH,
  TIER_TAG_PREFIX,
} from './constants.mjs';
import { isSourceFile, isTestFile } from './classification.mjs';
import { buildTestSet, hasTest } from './test-detection.mjs';
import { buildFileSignalMap, buildModuleStateMap, inferTier } from './signals.mjs';
import { atomWrite, readMirrorTags } from './file-ops.mjs';

export function main() {
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
