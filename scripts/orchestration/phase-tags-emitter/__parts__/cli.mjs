import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { rewriteMirrorFrontmatterTags } from '../../../obsidian-mirror-daemon-indexes.mjs';

import { REPO_ROOT, MODULE_PHASE_MAP, PHASE_TAG_PREFIX, SOURCE_MIRROR_DIR } from './constants.mjs';
import {
  listAllRepoFiles,
  pathToModule,
  readMirrorTags,
  mirrorRelPathForSource,
  atomWrite,
} from './lib.mjs';

function main() {
  const dry = process.argv.includes('--dry');

  if (!existsSync(SOURCE_MIRROR_DIR)) {
    process.stderr.write(
      JSON.stringify({ error: 'mirror source dir not found', path: SOURCE_MIRROR_DIR }) + '\n',
    );
    process.exit(2);
  }

  const allFiles = listAllRepoFiles(REPO_ROOT, '');
  const phaseDistribution = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  let sidecarsEmitted = 0;
  let mirrorsTouched = 0;
  let skipped = 0;
  let skippedNoMirror = 0;

  for (const relPath of allFiles) {
    const module = pathToModule(relPath);
    if (!module) {
      skipped++;
      continue;
    }

    const phase = MODULE_PHASE_MAP[module];
    if (phase === undefined) {
      skipped++;
      continue;
    }

    const mirrorRel = mirrorRelPathForSource(relPath);
    const mirrorAbs = join(SOURCE_MIRROR_DIR, mirrorRel);

    if (!existsSync(mirrorAbs)) {
      skippedNoMirror++;
      continue;
    }

    const sidecarPath = mirrorAbs.replace(/\.md$/, '.phase.json');
    const sidecar =
      JSON.stringify(
        {
          schema: 'kloel.phase.v1',
          phase,
          module,
          evidence: [`dag:CLAUDE.md FASE ${phase} — ${module}`, `path:${relPath}`],
          computedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + '\n';

    if (!dry) {
      atomWrite(sidecarPath, sidecar);
    }
    sidecarsEmitted++;
    phaseDistribution[phase]++;

    const existingTags = readMirrorTags(mirrorRel);
    if (existingTags === null) continue;

    const phaseTag = `kloel/phase-${phase}`;
    const merged = existingTags.filter((t) => !t.startsWith(PHASE_TAG_PREFIX));
    merged.push(phaseTag);
    merged.sort();

    if (JSON.stringify(merged) === JSON.stringify(existingTags)) continue;

    if (!dry) {
      rewriteMirrorFrontmatterTags(mirrorRel, merged);
    }
    mirrorsTouched++;
  }

  const summary = {
    filesScanned: allFiles.length,
    phaseDistribution,
    sidecarsEmitted,
    mirrorsTouched,
    skipped,
    skippedNoMirror,
  };
  process.stderr.write(JSON.stringify(summary) + '\n');
}

main();
