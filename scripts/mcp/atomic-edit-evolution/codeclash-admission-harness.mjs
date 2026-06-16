#!/usr/bin/env node
/**
 * codeclash-admission-harness.mjs — pure CodeClash readiness gate for the
 * Codex A/B loop. It consumes supplied facts only; it does not inspect env,
 * Docker, GitHub, network, filesystem, or launch CodeClash.
 */

export const ADMISSION_ACTIONS = Object.freeze({
  ADMIT_CODECLASH_REAL_TOURNAMENT: 'ADMIT_CODECLASH_REAL_TOURNAMENT',
  ADMIT_CODECLASH_DUMMY_SMOKE: 'ADMIT_CODECLASH_DUMMY_SMOKE',
  ADMIT_GITHUB_ISSUES_FALLBACK: 'ADMIT_GITHUB_ISSUES_FALLBACK',
  NO_USABLE_ARENA: 'NO_USABLE_ARENA',
  FIX_INPUT: 'FIX_INPUT',
});

export const CODECLASH_STATUS = Object.freeze({
  REAL_TOURNAMENT_ADMITTED: 'REAL_TOURNAMENT_ADMITTED',
  DUMMY_SMOKE_ADMITTED: 'DUMMY_SMOKE_ADMITTED',
  BLOCKED_MISSING_DOCKER_OR_TOOLING: 'BLOCKED_MISSING_DOCKER_OR_TOOLING',
  BLOCKED_MISSING_CODECLASH_PREREQUISITE: 'BLOCKED_MISSING_CODECLASH_PREREQUISITE',
});

const HONEST_CEILING = 'Admission/readiness only. It consumes supplied facts and does not inspect Docker, env, filesystem, network, GitHub, or run CodeClash tournaments.';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(error) {
  return {
    ok: false,
    action: ADMISSION_ACTIONS.FIX_INPUT,
    error,
    canUseCodeClashLocally: false,
    honestCeiling: HONEST_CEILING,
  };
}

function factFlag(value, keys = ['available']) {
  if (typeof value === 'boolean') return value;
  if (!isRecord(value)) return false;
  for (const key of keys) {
    if (typeof value[key] === 'boolean') return value[key];
  }
  return false;
}

function parsePythonVersion(python) {
  if (!isRecord(python)) return null;
  if (Number.isInteger(python.major) && Number.isInteger(python.minor)) {
    return { major: python.major, minor: python.minor, raw: `${python.major}.${python.minor}` };
  }
  if (typeof python.version !== 'string') return null;
  const match = python.version.match(/(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    raw: python.version,
  };
}

function pythonReadiness(python) {
  const available = factFlag(python, ['available', 'installed', 'present']);
  if (!available) {
    return {
      available: false,
      version: null,
      python311Plus: false,
      blocker: { kind: 'MISSING_PYTHON', message: 'Python 3.11+ is required for CodeClash' },
    };
  }

  const version = parsePythonVersion(python);
  if (!version) {
    return {
      available: true,
      version: null,
      python311Plus: false,
      blocker: { kind: 'UNKNOWN_PYTHON_VERSION', message: 'Python version must be supplied and prove 3.11+' },
    };
  }

  const python311Plus = version.major > 3 || (version.major === 3 && version.minor >= 11);
  return {
    available: true,
    version: version.raw,
    python311Plus,
    blocker: python311Plus ? null : { kind: 'PYTHON_BELOW_3_11', message: `Python 3.11+ is required; supplied version is ${version.raw}` },
  };
}

function dockerReadiness(docker) {
  if (typeof docker === 'boolean') {
    return {
      installed: docker,
      daemonRunning: docker,
      blockers: docker ? [] : [
        { kind: 'MISSING_DOCKER', message: 'Docker is required for CodeClash tournament execution' },
        { kind: 'DOCKER_DAEMON_NOT_RUNNING', message: 'Docker daemon must be running for CodeClash tournament execution' },
      ],
    };
  }

  const installed = factFlag(docker, ['installed', 'available', 'present']);
  const daemonRunning = isRecord(docker) && factFlag(docker, ['daemonRunning', 'running', 'daemonAvailable']);
  const blockers = [];
  if (!installed) {
    blockers.push({ kind: 'MISSING_DOCKER', message: 'Docker is required for CodeClash tournament execution' });
  }
  if (!daemonRunning) {
    blockers.push({ kind: 'DOCKER_DAEMON_NOT_RUNNING', message: 'Docker daemon must be running for CodeClash tournament execution' });
  }
  return { installed, daemonRunning, blockers };
}

function providerKeyNames(value) {
  if (Array.isArray(value)) return value.filter((key) => typeof key === 'string' && key.trim()).map((key) => key.trim());
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .filter(([, present]) => present === true)
    .map(([name]) => name);
}

function normalizeCodeClashFacts(input) {
  const codeclash = isRecord(input.codeclash) ? input.codeclash : {};
  const python = pythonReadiness(codeclash.python ?? { available: codeclash.pythonAvailable, version: codeclash.pythonVersion });
  const docker = dockerReadiness(codeclash.docker);
  const uvAvailable = factFlag(codeclash.uv, ['available', 'installed', 'present']);
  const gitAvailable = factFlag(codeclash.git, ['available', 'installed', 'present']);
  const githubTokenAvailable = factFlag(codeclash.githubToken, ['available', 'present']);
  const llmProviderKeys = providerKeyNames(codeclash.llmProviderKeys ?? codeclash.providerKeys);

  const blockers = [];
  if (python.blocker) blockers.push(python.blocker);
  if (!uvAvailable) blockers.push({ kind: 'MISSING_UV', message: 'uv is required by the CodeClash quickstart' });
  blockers.push(...docker.blockers);
  if (!gitAvailable) blockers.push({ kind: 'MISSING_GIT', message: 'Git is required by the CodeClash quickstart' });
  if (!githubTokenAvailable) blockers.push({ kind: 'MISSING_GITHUB_TOKEN', message: 'GITHUB_TOKEN is required by the CodeClash quickstart' });

  const providerBlockers = llmProviderKeys.length > 0 ? [] : [
    { kind: 'MISSING_LLM_PROVIDER_KEY', message: 'A provider key such as OPENAI_API_KEY or ANTHROPIC_API_KEY is required for real model tournaments' },
  ];

  const coreReady = blockers.length === 0;
  const realTournamentAdmitted = coreReady && providerBlockers.length === 0;
  const dummySmokeAdmitted = coreReady && !realTournamentAdmitted;
  const toolingBlockerKinds = new Set([
    'MISSING_PYTHON',
    'UNKNOWN_PYTHON_VERSION',
    'PYTHON_BELOW_3_11',
    'MISSING_UV',
    'MISSING_DOCKER',
    'DOCKER_DAEMON_NOT_RUNNING',
    'MISSING_GIT',
  ]);
  const blockedByDockerOrTooling = blockers.some((blocker) => toolingBlockerKinds.has(blocker.kind));

  let status = CODECLASH_STATUS.BLOCKED_MISSING_CODECLASH_PREREQUISITE;
  if (realTournamentAdmitted) {
    status = CODECLASH_STATUS.REAL_TOURNAMENT_ADMITTED;
  } else if (dummySmokeAdmitted) {
    status = CODECLASH_STATUS.DUMMY_SMOKE_ADMITTED;
  } else if (blockedByDockerOrTooling) {
    status = CODECLASH_STATUS.BLOCKED_MISSING_DOCKER_OR_TOOLING;
  }

  const allBlockers = realTournamentAdmitted ? [] : [...blockers, ...providerBlockers];
  return {
    status,
    realTournamentAdmitted,
    dummySmokeAdmitted,
    blockers: allBlockers.map((blocker) => blocker.message),
    blockerKinds: allBlockers.map((blocker) => blocker.kind),
    prerequisites: {
      pythonAvailable: python.available,
      pythonVersion: python.version,
      python311Plus: python.python311Plus,
      uvAvailable,
      dockerInstalled: docker.installed,
      dockerDaemonRunning: docker.daemonRunning,
      gitAvailable,
      githubTokenAvailable,
      llmProviderKeyCount: llmProviderKeys.length,
    },
  };
}

function normalizeGithubIssuesFacts(input) {
  const supplied = isRecord(input.githubIssues)
    ? input.githubIssues
    : isRecord(input.taskSource) && isRecord(input.taskSource.githubIssues)
      ? input.taskSource.githubIssues
      : {};
  const authAvailable = factFlag(supplied, ['authAvailable', 'authenticated', 'available']);
  const taskSourceAvailable = factFlag(supplied, ['taskSourceAvailable', 'issuesAvailable', 'canListIssues', 'repoAvailable']);
  const blockers = [];
  if (!authAvailable) blockers.push({ kind: 'MISSING_GITHUB_ISSUES_AUTH', message: 'GitHub issues fallback requires supplied GitHub auth readiness' });
  if (!taskSourceAvailable) blockers.push({ kind: 'MISSING_GITHUB_ISSUES_TASK_SOURCE', message: 'GitHub issues fallback requires a supplied issue/task source' });
  return {
    fallbackAdmitted: blockers.length === 0,
    authAvailable,
    taskSourceAvailable,
    blockers: blockers.map((blocker) => blocker.message),
    blockerKinds: blockers.map((blocker) => blocker.kind),
  };
}

export function evaluateCodeClashAdmission(input) {
  if (!isRecord(input)) return fail('input must be a JSON object');

  const codeclash = normalizeCodeClashFacts(input);
  const githubIssues = normalizeGithubIssuesFacts(input);
  let action = ADMISSION_ACTIONS.NO_USABLE_ARENA;
  let selectedArena = null;
  if (codeclash.realTournamentAdmitted) {
    action = ADMISSION_ACTIONS.ADMIT_CODECLASH_REAL_TOURNAMENT;
    selectedArena = 'codeclash-real-tournament';
  } else if (codeclash.dummySmokeAdmitted) {
    action = ADMISSION_ACTIONS.ADMIT_CODECLASH_DUMMY_SMOKE;
    selectedArena = 'codeclash-dummy-smoke';
  } else if (githubIssues.fallbackAdmitted) {
    action = ADMISSION_ACTIONS.ADMIT_GITHUB_ISSUES_FALLBACK;
    selectedArena = 'github-issues-fallback';
  }

  const blockers = action === ADMISSION_ACTIONS.ADMIT_CODECLASH_REAL_TOURNAMENT
    ? []
    : action === ADMISSION_ACTIONS.ADMIT_CODECLASH_DUMMY_SMOKE
      ? codeclash.blockers
      : [...codeclash.blockers, ...githubIssues.blockers];

  return {
    ok: true,
    action,
    selectedArena,
    canUseCodeClashLocally: codeclash.realTournamentAdmitted || codeclash.dummySmokeAdmitted,
    codeclash,
    githubIssues,
    blockers,
    next: nextStepForAction(action),
    honestCeiling: HONEST_CEILING,
  };
}

function nextStepForAction(action) {
  if (action === ADMISSION_ACTIONS.ADMIT_CODECLASH_REAL_TOURNAMENT) {
    return 'run a real CodeClash model tournament with supplied provider credentials';
  }
  if (action === ADMISSION_ACTIONS.ADMIT_CODECLASH_DUMMY_SMOKE) {
    return 'run a CodeClash dummy/smoke tournament only; do not claim real model results';
  }
  if (action === ADMISSION_ACTIONS.ADMIT_GITHUB_ISSUES_FALLBACK) {
    return 'source tasks from GitHub issues until Docker/tooling blockers are resolved';
  }
  return 'resolve CodeClash blockers or supply a usable GitHub issues task source';
}

function parseJsonInput(stdinText) {
  if (!stdinText || !stdinText.trim()) throw new Error('stdin JSON is required');
  return JSON.parse(stdinText);
}

export function runCli(argv, stdinText) {
  const args = Array.isArray(argv) ? argv : [];
  if (args.includes('--evaluate')) {
    try {
      return evaluateCodeClashAdmission(parseJsonInput(stdinText));
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  }
  return fail('usage: node codeclash-admission-harness.mjs --evaluate < input.json');
}

function isCliMain() {
  return process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
}

if (isCliMain()) {
  const chunks = [];
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => {
    const result = runCli(process.argv.slice(2), Buffer.concat(chunks).toString('utf8'));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
  });
}
