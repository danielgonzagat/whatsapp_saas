#!/usr/bin/env node
/**
 * codeclash-admission.proof.mjs — executable proof for pure CodeClash
 * readiness/admission decisions in the existing Codex A/B loop.
 */
const {
  ADMISSION_ACTIONS,
  evaluateCodeClashAdmission,
  runCli,
} = await import('./codeclash-admission-harness.mjs');

const checks = [];
const check = (id, ok, detail) => checks.push({ id, ok: ok === true, detail: detail ?? null });

const readyFacts = (overrides = {}) => ({
  codeclash: {
    python: { available: true, version: '3.11.8' },
    uv: { available: true },
    docker: { installed: true, daemonRunning: true },
    git: { available: true },
    githubToken: { available: true },
    llmProviderKeys: ['OPENAI_API_KEY'],
    ...(overrides.codeclash ?? {}),
  },
  githubIssues: {
    authAvailable: true,
    taskSourceAvailable: true,
    ...(overrides.githubIssues ?? {}),
  },
  taskName: overrides.taskName ?? 'general CodeClash admission readiness',
  repoRoot: overrides.repoRoot ?? '/Users/danielpenin/kloel',
});

const real = evaluateCodeClashAdmission(readyFacts());
check(
  'admits-full-codeclash-real-tournament',
  real.ok === true
    && real.action === ADMISSION_ACTIONS.ADMIT_CODECLASH_REAL_TOURNAMENT
    && real.canUseCodeClashLocally === true
    && real.codeclash.realTournamentAdmitted === true
    && real.codeclash.dummySmokeAdmitted === false
    && real.blockers.length === 0,
  JSON.stringify(real),
);

const dummyOnly = evaluateCodeClashAdmission(readyFacts({
  codeclash: { llmProviderKeys: [] },
}));
check(
  'admits-codeclash-dummy-smoke-when-only-provider-keys-missing',
  dummyOnly.ok === true
    && dummyOnly.action === ADMISSION_ACTIONS.ADMIT_CODECLASH_DUMMY_SMOKE
    && dummyOnly.canUseCodeClashLocally === true
    && dummyOnly.codeclash.realTournamentAdmitted === false
    && dummyOnly.codeclash.dummySmokeAdmitted === true
    && dummyOnly.codeclash.blockers.length === 1
    && dummyOnly.codeclash.blockerKinds.includes('MISSING_LLM_PROVIDER_KEY'),
  JSON.stringify(dummyOnly),
);

const dockerBlockedWithFallback = evaluateCodeClashAdmission(readyFacts({
  codeclash: {
    docker: { installed: true, daemonRunning: false },
  },
  githubIssues: { authAvailable: true, taskSourceAvailable: true },
}));
check(
  'blocks-local-codeclash-on-docker-daemon-and-admits-github-issues-fallback',
  dockerBlockedWithFallback.ok === true
    && dockerBlockedWithFallback.action === ADMISSION_ACTIONS.ADMIT_GITHUB_ISSUES_FALLBACK
    && dockerBlockedWithFallback.canUseCodeClashLocally === false
    && dockerBlockedWithFallback.githubIssues.fallbackAdmitted === true
    && dockerBlockedWithFallback.codeclash.blockerKinds.includes('DOCKER_DAEMON_NOT_RUNNING'),
  JSON.stringify(dockerBlockedWithFallback),
);

const toolingBlockedWithFallback = evaluateCodeClashAdmission(readyFacts({
  codeclash: {
    python: { available: true, version: '3.10.13' },
    uv: { available: false },
    git: { available: false },
    docker: { installed: false, daemonRunning: false },
  },
  githubIssues: { authAvailable: true, taskSourceAvailable: true },
}));
check(
  'blocks-local-codeclash-on-missing-tooling-and-admits-github-issues-fallback',
  toolingBlockedWithFallback.ok === true
    && toolingBlockedWithFallback.action === ADMISSION_ACTIONS.ADMIT_GITHUB_ISSUES_FALLBACK
    && toolingBlockedWithFallback.canUseCodeClashLocally === false
    && toolingBlockedWithFallback.codeclash.status === 'BLOCKED_MISSING_DOCKER_OR_TOOLING'
    && toolingBlockedWithFallback.codeclash.blockerKinds.includes('PYTHON_BELOW_3_11')
    && toolingBlockedWithFallback.codeclash.blockerKinds.includes('MISSING_UV')
    && toolingBlockedWithFallback.codeclash.blockerKinds.includes('MISSING_GIT')
    && toolingBlockedWithFallback.codeclash.blockerKinds.includes('MISSING_DOCKER'),
  JSON.stringify(toolingBlockedWithFallback),
);

const noArena = evaluateCodeClashAdmission(readyFacts({
  codeclash: {
    docker: { installed: false, daemonRunning: false },
  },
  githubIssues: { authAvailable: false, taskSourceAvailable: false },
}));
check(
  'reports-no-usable-arena-when-codeclash-and-github-issues-are-unavailable',
  noArena.ok === true
    && noArena.action === ADMISSION_ACTIONS.NO_USABLE_ARENA
    && noArena.canUseCodeClashLocally === false
    && noArena.githubIssues.fallbackAdmitted === false
    && noArena.githubIssues.blockers.length === 2,
  JSON.stringify(noArena),
);

const namedLikeThisTask = evaluateCodeClashAdmission(readyFacts({
  codeclash: { docker: { installed: false, daemonRunning: false } },
  githubIssues: { authAvailable: true, taskSourceAvailable: true },
  taskName: 'Implement CodeClash admission/readiness harness for /Users/danielpenin/kloel',
  repoRoot: '/Users/danielpenin/kloel',
}));
const unrelatedName = evaluateCodeClashAdmission(readyFacts({
  codeclash: { docker: { installed: false, daemonRunning: false } },
  githubIssues: { authAvailable: true, taskSourceAvailable: true },
  taskName: 'random unrelated tournament task',
  repoRoot: '/tmp/not-kloel',
}));
check(
  'does-not-special-case-task-name-or-repo-path-as-winning-condition',
  namedLikeThisTask.action === unrelatedName.action
    && namedLikeThisTask.codeclash.status === unrelatedName.codeclash.status
    && namedLikeThisTask.canUseCodeClashLocally === unrelatedName.canUseCodeClashLocally
    && namedLikeThisTask.githubIssues.fallbackAdmitted === unrelatedName.githubIssues.fallbackAdmitted,
  JSON.stringify({ namedLikeThisTask, unrelatedName }),
);

const cli = runCli(['--evaluate'], JSON.stringify(readyFacts({
  codeclash: { llmProviderKeys: [] },
})));
check(
  'runCli-evaluate-ok',
  cli.ok === true && cli.action === ADMISSION_ACTIONS.ADMIT_CODECLASH_DUMMY_SMOKE,
  JSON.stringify(cli),
);

const failed = checks.filter((c) => !c.ok);
const result = {
  ok: failed.length === 0,
  gate: 'codeclash-admission',
  checks,
  failedCount: failed.length,
  honestCeiling: 'Admission/readiness only. It consumes supplied facts and does not inspect Docker, env, filesystem, network, GitHub, or run CodeClash tournaments.',
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.ok ? 0 : 1);
