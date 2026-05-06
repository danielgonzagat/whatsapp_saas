import { join } from 'node:path';
import { ORCHESTRATION_DIR, HUD_DIR, SOURCE_DIR } from './constants.mjs';
import { checkFile, countSidecars, grepTagCount, checkJsonFile } from './helpers.mjs';
import { findOrphans } from './orphans.mjs';

export function catA_baselineFiles() {
  return {
    name: 'A. baseline-files',
    checks: [
      checkFile(
        'severity-tags-emitter.mjs exists',
        join(ORCHESTRATION_DIR, 'severity-tags-emitter.mjs'),
      ),
      checkFile('extend-graph-lens.mjs exists', join(ORCHESTRATION_DIR, 'extend-graph-lens.mjs')),
      checkFile(
        'graph-color-watchdog.mjs exists',
        join(ORCHESTRATION_DIR, 'graph-color-watchdog.mjs'),
      ),
    ],
  };
}

export function catB_wave1Emitters() {
  const checks = [];

  const tierCount = countSidecars('tier');
  checks.push({
    label: 'tier sidecars',
    pass: tierCount >= 2700,
    detail: `${tierCount} >= 2700`,
  });

  const tierTagCount = grepTagCount(SOURCE_DIR, 'kloel/tier-');
  checks.push({
    label: 'tier tags',
    pass: tierCount >= 2700 && tierTagCount >= 2700,
    detail: tierTagCount >= 0 ? `${tierTagCount} >= 2700` : 'grep error',
  });

  const phaseCount = countSidecars('phase');
  const orphans = findOrphans();
  const orphanPhaseCount = orphans.filter((p) => p.endsWith('.phase.json')).length;
  const orphanNote =
    orphanPhaseCount > 0 ? ` (${orphanPhaseCount} are orphans, run --fix-orphans)` : '';
  checks.push({
    label: 'phase sidecars',
    pass: phaseCount >= 700,
    detail: `${phaseCount} >= 700${orphanNote}`,
  });

  const phaseTagCount = grepTagCount(SOURCE_DIR, 'kloel/phase-');
  checks.push({
    label: 'phase tags',
    pass: phaseCount >= 700 && phaseTagCount >= 700,
    detail: phaseTagCount >= 0 ? `${phaseTagCount} >= 700` : 'grep error',
  });

  checks.push(checkJsonFile('ci-state.json valid', join(HUD_DIR, 'ci-state.json'), 'kloel.ci.v1'));

  checks.push(
    checkJsonFile(
      'provider-state.json valid',
      join(HUD_DIR, 'provider-state.json'),
      'kloel.provider.v1',
    ),
  );

  return { name: 'B. wave1-emitters', checks };
}
