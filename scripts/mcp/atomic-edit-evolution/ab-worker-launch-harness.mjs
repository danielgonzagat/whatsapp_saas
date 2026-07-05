#!/usr/bin/env node
/**
 * ab-worker-launch-harness.mjs - pure Codex A/B worker launch planner for the
 * Atomic evolution loop. It consumes supplied facts only and does not inspect
 * filesystem, env, network, Docker, GitHub, or launch workers.
 */
import path from 'node:path';
import { canonicalSha256 } from './ab-worker-manifest-evidence-harness.mjs';

export const WORKER_LAUNCH_MODES = Object.freeze({
  FACTORY: 'FACTORY_BLOCK_ATOMIC',
  ATOMIC: 'ALL_IN_ATOMIC',
});

const ALLOWED_ARENAS = Object.freeze([
  'codeclash-real-tournament',
  'codeclash-dummy-smoke',
  'github-issues-fallback',
]);

const REQUIRED_MANIFEST_FIELDS = Object.freeze([
  'armId',
  'mode',
  'workspaceRoot',
  'status',
  'startedAtMs',
  'finishedAtMs',
  'changedFiles',
  'diffStats',
  'validation',
  'tooling',
  'notes',
]);

const HONEST_CEILING = 'Pure launch planning only. It consumes supplied facts and does not inspect filesystem, env, network, Docker, GitHub, or launch workers.';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function blocker(kind, message, field = null) {
  return { kind, message, field };
}

function fail(blockers) {
  return {
    ok: false,
    blockers,
    launchSpecs: [],
    honestCeiling: HONEST_CEILING,
  };
}

function normalizeRoot(value) {
  if (!nonEmptyString(value)) return null;
  if (!path.isAbsolute(value)) return null;
  return path.normalize(value);
}

function relativePathStaysInside(fromRoot, toRoot) {
  const relative = path.relative(fromRoot, toRoot);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function rootsOverlap(left, right) {
  const leftRoot = normalizeRoot(left);
  const rightRoot = normalizeRoot(right);
  if (!leftRoot || !rightRoot) return false;
  return relativePathStaysInside(leftRoot, rightRoot) || relativePathStaysInside(rightRoot, leftRoot);
}

function validateRequiredFacts(input) {
  const blockers = [];
  for (const field of ['roundId', 'complexity', 'task', 'baselineCommit']) {
    if (!nonEmptyString(input[field])) {
      blockers.push(blocker('MISSING_REQUIRED_FACT', `${field} must be a non-empty string`, field));
    }
  }
  if (!Array.isArray(input.validationCommands)) {
    blockers.push(blocker('VALIDATION_COMMANDS_INVALID', 'validationCommands must be an array', 'validationCommands'));
  } else {
    input.validationCommands.forEach((command, index) => {
      if (!nonEmptyString(command)) {
        blockers.push(blocker('VALIDATION_COMMANDS_INVALID', `validationCommands[${index}] must be a non-empty string`, `validationCommands[${index}]`));
      }
    });
  }
  return blockers;
}

function validateWorkspaceRoots(input) {
  const blockers = [];
  const roots = [
    ['factoryWorkspaceRoot', input.factoryWorkspaceRoot],
    ['atomicWorkspaceRoot', input.atomicWorkspaceRoot],
  ];
  for (const [field, value] of roots) {
    if (!nonEmptyString(value)) {
      blockers.push(blocker('MISSING_WORKSPACE_ROOT', `${field} must be present`, field));
    } else if (!path.isAbsolute(value)) {
      blockers.push(blocker('WORKSPACE_ROOT_NOT_ABSOLUTE', `${field} must be an absolute path`, field));
    }
  }
  if (blockers.length === 0 && rootsOverlap(input.factoryWorkspaceRoot, input.atomicWorkspaceRoot)) {
    blockers.push(blocker('WORKSPACE_ROOTS_OVERLAP', 'factoryWorkspaceRoot and atomicWorkspaceRoot must be distinct, non-overlapping, and not nested'));
  }
  return blockers;
}

function validatePolicy(policy) {
  const blockers = [];
  if (!isRecord(policy)) return [blocker('POLICY_INVALID', 'policy must be an object', 'policy')];
  if (policy.factoryNoAtomicAllowed !== true) {
    blockers.push(blocker('FACTORY_POLICY_BLOCKED', 'factory arm requires policy.factoryNoAtomicAllowed === true', 'policy.factoryNoAtomicAllowed'));
  }
  if (policy.atomicMcpAllowed !== true) {
    blockers.push(blocker('ATOMIC_POLICY_BLOCKED', 'atomic arm requires policy.atomicMcpAllowed === true', 'policy.atomicMcpAllowed'));
  }
  if (policy.codexOnly !== true) {
    blockers.push(blocker('CODEX_ONLY_REQUIRED', 'policy.codexOnly must be true', 'policy.codexOnly'));
  }
  if (policy.openCodeAllowed === true || policy.opencodeAllowed === true || policy.openCodeForbidden === false || policy.opencodeForbidden === false) {
    blockers.push(blocker('OPENCODE_MUST_BE_FORBIDDEN', 'OpenCode must be explicitly forbidden by the Codex-only launch policy', 'policy.openCodeForbidden'));
  }
  return blockers;
}

function validateArena(arenaAdmission) {
  if (!isRecord(arenaAdmission)) {
    return {
      selectedArena: null,
      blockers: [blocker('NO_USABLE_ARENA', 'arenaAdmission must be an object with a selectedArena', 'arenaAdmission')],
    };
  }
  const blockers = [];
  if (arenaAdmission.ok !== true) {
    blockers.push(blocker('ARENA_ADMISSION_BLOCKED', 'arenaAdmission.ok must be true', 'arenaAdmission.ok'));
  }
  const selectedArena = arenaAdmission.selectedArena;
  if (!nonEmptyString(selectedArena)) {
    blockers.push(blocker('NO_USABLE_ARENA', 'arenaAdmission.selectedArena must name a usable arena', 'arenaAdmission.selectedArena'));
  } else if (!ALLOWED_ARENAS.includes(selectedArena)) {
    blockers.push(blocker('UNSUPPORTED_ARENA', `selectedArena must be one of: ${ALLOWED_ARENAS.join(', ')}`, 'arenaAdmission.selectedArena'));
  }
  return { selectedArena, blockers };
}

function factoryToolPolicy() {
  return {
    codexOnly: true,
    openCodeForbidden: true,
    requiredEditor: 'factory-control-no-atomic',
    atomicEditMcpAllowed: false,
    atomicEditMcpRequired: false,
    forbiddenTools: [
      'OpenCode',
      'atomic-edit MCP repository writes',
      'standalone atomic-edit CLI',
      'standalone semantic-edit CLI',
    ],
  };
}

function atomicToolPolicy() {
  return {
    codexOnly: true,
    openCodeForbidden: true,
    requiredEditor: 'atomic-edit MCP',
    atomicEditMcpAllowed: true,
    atomicEditMcpRequired: true,
    forbiddenTools: [
      'OpenCode',
      'apply_patch for repository code/JSON/README edits',
      'heredoc file creation',
      'cat > file',
      'tee > file',
      'python/perl/sed scripts that write repository files',
      'standalone atomic-edit/semantic-edit CLI fallback unless MCP is unreachable',
    ],
  };
}

function buildLaunchSpec({ arm, mode, workspaceRoot, input, selectedArena, missionHash, acceptance, toolPolicy }) {
  const normalizedWorkspaceRoot = normalizeRoot(workspaceRoot);
  return {
    arm,
    armId: `${input.roundId}/${arm}`,
    mode,
    roundId: input.roundId,
    missionHash,
    task: input.task,
    acceptance: clone(acceptance),
    baselineCommit: input.baselineCommit,
    complexity: input.complexity,
    selectedArena,
    workspaceRoot: normalizedWorkspaceRoot,
    validationCommands: clone(input.validationCommands),
    toolPolicy: clone(toolPolicy),
    requiredManifestFields: clone(REQUIRED_MANIFEST_FIELDS),
    mutablePaths: [normalizedWorkspaceRoot],
    sharedMutablePaths: [],
  };
}

export function buildCodexWorkerLaunchPlan(input) {
  if (!isRecord(input)) return fail([blocker('INPUT_INVALID', 'input must be a JSON object')]);

  const factBlockers = validateRequiredFacts(input);
  const rootBlockers = validateWorkspaceRoots(input);
  const policyBlockers = validatePolicy(input.policy);
  const arena = validateArena(input.arenaAdmission);
  const blockers = [...factBlockers, ...rootBlockers, ...policyBlockers, ...arena.blockers];
  if (blockers.length > 0) return fail(blockers);

  const selectedArena = arena.selectedArena;
  const validationCommands = clone(input.validationCommands);
  const missionHash = canonicalSha256({
    kind: 'codex-ab-worker-launch-mission',
    roundId: input.roundId,
    complexity: input.complexity,
    task: input.task,
    baselineCommit: input.baselineCommit,
    selectedArena,
    validationCommands,
  });
  const acceptance = {
    selectedArena,
    arenaAction: input.arenaAdmission.action ?? null,
    baselineCommit: input.baselineCommit,
    complexity: input.complexity,
    codexOnly: true,
    openCodeForbidden: true,
    validationCommands: clone(validationCommands),
  };
  const factoryWorkspaceRoot = normalizeRoot(input.factoryWorkspaceRoot);
  const atomicWorkspaceRoot = normalizeRoot(input.atomicWorkspaceRoot);
  const launchSpecs = [
    buildLaunchSpec({
      arm: 'factory',
      mode: WORKER_LAUNCH_MODES.FACTORY,
      workspaceRoot: factoryWorkspaceRoot,
      input,
      selectedArena,
      missionHash,
      acceptance,
      toolPolicy: factoryToolPolicy(),
    }),
    buildLaunchSpec({
      arm: 'atomic',
      mode: WORKER_LAUNCH_MODES.ATOMIC,
      workspaceRoot: atomicWorkspaceRoot,
      input,
      selectedArena,
      missionHash,
      acceptance,
      toolPolicy: atomicToolPolicy(),
    }),
  ];

  return {
    ok: true,
    roundId: input.roundId,
    missionHash,
    task: input.task,
    baselineCommit: input.baselineCommit,
    complexity: input.complexity,
    selectedArena,
    acceptance: clone(acceptance),
    validationCommands,
    launchSpecs,
    requiredManifestFields: clone(REQUIRED_MANIFEST_FIELDS),
    workspaceIsolation: {
      factoryWorkspaceRoot,
      atomicWorkspaceRoot,
      rootsDistinct: factoryWorkspaceRoot !== atomicWorkspaceRoot,
      rootsNested: false,
      sharedMutablePaths: [],
    },
    sharedMutablePaths: [],
    blockers: [],
    honestCeiling: HONEST_CEILING,
  };
}

function parseJsonInput(stdinText) {
  try {
    return { ok: true, value: JSON.parse(stdinText || '{}') };
  } catch (error) {
    return { ok: false, error: `invalid JSON input: ${error.message}` };
  }
}

export function runCli(argv, stdinText) {
  const args = Array.isArray(argv) ? argv : [];
  const parsed = parseJsonInput(stdinText);
  if (!parsed.ok) return parsed;
  if (args.includes('--build-codex-worker-launch-plan') || args.includes('--plan')) {
    return buildCodexWorkerLaunchPlan(parsed.value);
  }
  return {
    ok: false,
    error: 'usage: node ab-worker-launch-harness.mjs --build-codex-worker-launch-plan < input.json',
  };
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
