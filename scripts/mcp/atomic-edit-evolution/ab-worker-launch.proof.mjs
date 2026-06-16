#!/usr/bin/env node
/**
 * ab-worker-launch.proof.mjs - executable proof for the pure Codex A/B
 * worker launch planner.
 */
const {
  buildCodexWorkerLaunchPlan,
  runCli,
} = await import('./ab-worker-launch-harness.mjs');

const checks = [];
const check = (id, ok, detail) => checks.push({ id, ok: ok === true, detail: detail ?? null });

const validationCommands = [
  'node scripts/mcp/atomic-edit-evolution/ab-worker-launch.proof.mjs',
  'node scripts/mcp/atomic-edit-evolution/ab-round.proof.mjs',
  'node scripts/mcp/atomic-edit-evolution/codeclash-admission.proof.mjs',
];

const validInput = (overrides = {}) => ({
  roundId: 'codex-ab-r3-20260611154650',
  complexity: 'medium',
  task: 'Implement a general Codex A/B worker launch planner for the Atomic evolution loop.',
  baselineCommit: '0123456789abcdef0123456789abcdef01234567',
  factoryWorkspaceRoot: '/tmp/kloel-ab/factory-workspace',
  atomicWorkspaceRoot: '/tmp/kloel-ab/atomic-workspace',
  policy: {
    factoryNoAtomicAllowed: true,
    atomicMcpAllowed: true,
    codexOnly: true,
    ...(overrides.policy ?? {}),
  },
  arenaAdmission: {
    ok: true,
    action: 'ADMIT_GITHUB_ISSUES_FALLBACK',
    selectedArena: 'github-issues-fallback',
    ...(overrides.arenaAdmission ?? {}),
  },
  validationCommands: overrides.validationCommands ?? validationCommands,
  ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !['policy', 'arenaAdmission', 'validationCommands'].includes(key))),
});

const blockerKinds = (result) => (Array.isArray(result.blockers) ? result.blockers.map((blocker) => blocker.kind) : []);

const githubFallback = buildCodexWorkerLaunchPlan(validInput());
check(
  'valid-github-issues-fallback-builds-two-codex-launch-specs',
  githubFallback.ok === true
    && githubFallback.selectedArena === 'github-issues-fallback'
    && githubFallback.launchSpecs.length === 2
    && githubFallback.launchSpecs.every((spec) => spec.task === validInput().task)
    && githubFallback.launchSpecs.every((spec) => JSON.stringify(spec.validationCommands) === JSON.stringify(validationCommands))
    && githubFallback.launchSpecs.every((spec) => spec.acceptance.selectedArena === 'github-issues-fallback'),
  JSON.stringify(githubFallback),
);

const realTournament = buildCodexWorkerLaunchPlan(validInput({
  arenaAdmission: {
    action: 'ADMIT_CODECLASH_REAL_TOURNAMENT',
    selectedArena: 'codeclash-real-tournament',
  },
}));
check(
  'valid-codeclash-real-tournament-builds-launch-plan',
  realTournament.ok === true
    && realTournament.selectedArena === 'codeclash-real-tournament'
    && realTournament.acceptance.selectedArena === 'codeclash-real-tournament'
    && realTournament.launchSpecs.length === 2,
  JSON.stringify(realTournament),
);

const missingRoots = buildCodexWorkerLaunchPlan(validInput({
  factoryWorkspaceRoot: '',
  atomicWorkspaceRoot: 'relative/atomic',
}));
check(
  'missing-or-relative-roots-are-rejected',
  missingRoots.ok === false
    && blockerKinds(missingRoots).includes('MISSING_WORKSPACE_ROOT')
    && blockerKinds(missingRoots).includes('WORKSPACE_ROOT_NOT_ABSOLUTE'),
  JSON.stringify(missingRoots),
);

const nestedRoots = buildCodexWorkerLaunchPlan(validInput({
  factoryWorkspaceRoot: '/tmp/kloel-ab/root',
  atomicWorkspaceRoot: '/tmp/kloel-ab/root/atomic-child',
}));
check(
  'overlapping-or-nested-roots-are-rejected',
  nestedRoots.ok === false
    && blockerKinds(nestedRoots).includes('WORKSPACE_ROOTS_OVERLAP'),
  JSON.stringify(nestedRoots),
);

const factoryBlocked = buildCodexWorkerLaunchPlan(validInput({
  policy: { factoryNoAtomicAllowed: false },
}));
check(
  'policy-blocks-factory-arm-when-no-atomic-control-not-allowed',
  factoryBlocked.ok === false
    && blockerKinds(factoryBlocked).includes('FACTORY_POLICY_BLOCKED'),
  JSON.stringify(factoryBlocked),
);

const atomicBlocked = buildCodexWorkerLaunchPlan(validInput({
  policy: { atomicMcpAllowed: false },
}));
check(
  'policy-blocks-atomic-arm-when-mcp-not-allowed',
  atomicBlocked.ok === false
    && blockerKinds(atomicBlocked).includes('ATOMIC_POLICY_BLOCKED'),
  JSON.stringify(atomicBlocked),
);

const noArena = buildCodexWorkerLaunchPlan(validInput({
  arenaAdmission: {
    action: 'NO_USABLE_ARENA',
    selectedArena: null,
  },
}));
check(
  'no-usable-arena-is-rejected',
  noArena.ok === false
    && blockerKinds(noArena).includes('NO_USABLE_ARENA'),
  JSON.stringify(noArena),
);

const fallbackMissionHashes = githubFallback.ok ? githubFallback.launchSpecs.map((spec) => spec.missionHash) : [];
check(
  'both-arms-share-the-same-mission-hash',
  fallbackMissionHashes.length === 2
    && fallbackMissionHashes[0] === fallbackMissionHashes[1]
    && fallbackMissionHashes[0] === githubFallback.missionHash,
  JSON.stringify({ fallbackMissionHashes, missionHash: githubFallback.missionHash }),
);

check(
  'opencode-is-explicitly-forbidden-for-both-arms',
  githubFallback.ok === true
    && githubFallback.launchSpecs.every((spec) => spec.toolPolicy.codexOnly === true)
    && githubFallback.launchSpecs.every((spec) => spec.toolPolicy.openCodeForbidden === true)
    && githubFallback.launchSpecs.every((spec) => spec.toolPolicy.forbiddenTools.includes('OpenCode')),
  JSON.stringify(githubFallback),
);

check(
  'launch-specs-have-no-shared-mutable-paths',
  githubFallback.ok === true
    && Array.isArray(githubFallback.sharedMutablePaths)
    && githubFallback.sharedMutablePaths.length === 0
    && githubFallback.launchSpecs[0].workspaceRoot !== githubFallback.launchSpecs[1].workspaceRoot
    && githubFallback.launchSpecs.every((spec) => spec.mutablePaths.length === 1 && spec.mutablePaths[0] === spec.workspaceRoot),
  JSON.stringify(githubFallback),
);

const cli = runCli(['--build-codex-worker-launch-plan'], JSON.stringify(validInput()));
check(
  'runCli-builds-launch-plan',
  cli.ok === true
    && cli.launchSpecs.length === 2
    && cli.selectedArena === 'github-issues-fallback',
  JSON.stringify(cli),
);

const failed = checks.filter((c) => !c.ok);
const result = {
  ok: failed.length === 0,
  gate: 'ab-worker-launch',
  checks,
  failedCount: failed.length,
  honestCeiling: 'Pure launch planning only. It consumes supplied facts and does not inspect filesystem, env, network, Docker, GitHub, or launch workers.',
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.ok ? 0 : 1);
