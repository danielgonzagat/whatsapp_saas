import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { HUD_DIR, BLOCKER_PATH, PROVIDER_PATH } from './constants.mjs';
import { loadJson, checkAutoGen, writeAtomic } from './helpers.mjs';
import {
  genNext,
  genBlockers,
  genDag,
  genProviders,
  genRegressions,
  genReadme,
} from './generators.mjs';

export function parseArgs() {
  const dry = process.argv.includes('--dry');
  const emit = process.argv.includes('--emit') || !dry;
  return { dry, emit };
}

export function main() {
  const opts = parseArgs();

  if (!existsSync(BLOCKER_PATH)) {
    process.stderr.write(
      'hubs-generator: BLOCKER_RANK.json not found. Run blocker-rank.mjs (R1) first.\n',
    );
    process.exit(2);
  }

  const blockerData = loadJson(BLOCKER_PATH, 'BLOCKER_RANK.json');
  if (!blockerData || !Array.isArray(blockerData.topN)) {
    process.stderr.write('hubs-generator: BLOCKER_RANK.json is invalid or missing topN array.\n');
    process.exit(2);
  }

  const blockers = blockerData.topN;

  const providerState = existsSync(PROVIDER_PATH)
    ? loadJson(PROVIDER_PATH, 'provider-state.json')
    : null;

  const hubs = [
    { name: '00-NEXT.md', content: genNext(blockers) },
    { name: '00-BLOCKERS.md', content: genBlockers(blockers) },
    { name: '00-DAG.md', content: genDag(blockers) },
    {
      name: '00-PROVIDERS.md',
      content: genProviders(providerState),
    },
    { name: '00-REGRESSIONS.md', content: genRegressions() },
    { name: '00-HUD-README.md', content: genReadme() },
  ];

  if (opts.dry) {
    const sampleTop3 = blockers.slice(0, 3).map((b) => ({
      file: b.file,
      score: b.score,
      tier: b.tier,
      phase: b.phase,
    }));

    process.stderr.write(
      JSON.stringify(
        {
          subagent: 'H1',
          dry: true,
          vault_dir: HUD_DIR,
          hubs_to_create: hubs.map((h) => h.name),
          sample_top_3: sampleTop3,
          total_blockers: blockers.length,
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  mkdirSync(HUD_DIR, { recursive: true });

  for (const hub of hubs) {
    const path = join(HUD_DIR, hub.name);
    const status = checkAutoGen(path);
    if (status === 'human') {
      process.stderr.write(
        `hubs-generator: ABORT \u2014 ${hub.name} exists WITHOUT auto-gen marker (human-edited). Remove manually or add marker.\n`,
      );
      process.exit(3);
    }
  }

  const created = [];
  for (const hub of hubs) {
    const path = join(HUD_DIR, hub.name);
    writeAtomic(path, hub.content);
    created.push(hub.name);
    process.stderr.write(`hubs-generator: wrote ${hub.name}\n`);
  }

  const sampleTop3 = blockers.slice(0, 3).map((b) => ({
    file: b.file,
    score: b.score,
    tier: b.tier,
    phase: b.phase,
  }));

  process.stdout.write(
    JSON.stringify(
      {
        subagent: 'H1',
        hubs_created: created,
        vault_dir: HUD_DIR,
        files_created: [
          'scripts/orchestration/hubs-generator.mjs',
          ...created.map((n) => join(HUD_DIR, n)),
        ],
        sample_top_3: sampleTop3,
        status: 'pass',
        blockers: `${blockers.length} ranked, top score: ${blockers[0]?.score || 'N/A'}`,
      },
      null,
      2,
    ) + '\n',
  );
}
