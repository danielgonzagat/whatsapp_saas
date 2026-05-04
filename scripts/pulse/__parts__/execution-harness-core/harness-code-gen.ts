import type { HarnessTarget, HarnessGeneratedTest } from '../../types.execution-harness';
import { camelToKebab, hasPersistenceDependency, isCriticalHarnessTarget } from './helpers';
import { harnessArtifactPath } from './grammar';

export function generateTestHarnessCode(target: HarnessTarget): HarnessGeneratedTest[] {
  if (target.feasibility === 'cannot_execute') {
    return [];
  }

  const suiteName = camelToKebab(target.name).replace(/\//g, '_');
  const executionMode = target.feasibility === 'needs_staging' ? 'governed_validation' : 'ai_safe';
  const terminalReason =
    target.feasibility === 'needs_staging'
      ? target.feasibilityReason
      : `Target is self-contained and can be converted into an ${executionMode} executable probe.`;

  return [
    {
      testName: `[PULSE] ${suiteName} — planned ${executionMode} harness`,
      status: 'planned',
      framework: target.httpMethod ? 'supertest' : 'jest',
      canRunLocally: false,
      code: buildHarnessBlueprintCode(target, executionMode, terminalReason),
    },
  ];
}

function buildHarnessBlueprintCode(
  target: HarnessTarget,
  executionMode: 'ai_safe' | 'governed_validation',
  terminalReason: string,
): string {
  const assertionItems = buildHarnessRequiredAssertions(target);
  const blueprint = {
    targetId: target.targetId,
    kind: target.kind,
    name: target.name,
    filePath: target.filePath,
    methodName: target.methodName,
    routePattern: target.routePattern,
    httpMethod: target.httpMethod,
    requiresAuth: target.requiresAuth,
    requiresTenant: target.requiresTenant,
    executionMode,
    feasibility: target.feasibility,
    terminalReason,
    evidenceMode: 'blueprint',
    executed: false,
    coverageCountsAsObserved: false,
    validationCommand: `node scripts/pulse/run.js --guidance # refresh harness blueprint for ${target.targetId}`,
    executionPlan: buildHarnessExecutionPlan(target, executionMode),
    expectedEvidence: buildHarnessExpectedEvidence(target),
    structuralSafetyClassification: {
      risk: isCriticalHarnessTarget(target) ? 'high' : 'medium',
      safeToExecute: target.feasibility !== 'cannot_execute',
      executionMode,
      protectedSurface: false,
      reason:
        target.feasibility === 'needs_staging'
          ? target.feasibilityReason
          : 'Target has no detected external infrastructure boundary in the harness classifier.',
    },
    artifactLinks: [
      {
        artifactPath: harnessArtifactPath(),
        relationship: 'harness_evidence',
      },
      {
        artifactPath: target.filePath,
        relationship: 'target_source',
      },
    ],
    dependencies: target.dependencies,
    requiredFixtures: target.fixtures
      .filter((fixture) => fixture.required)
      .map((fixture) => ({
        kind: fixture.kind,
        name: fixture.name,
        description: fixture.description,
      })),
    requiredAssertions: assertionItems,
  };

  return [
    `const pulseHarnessBlueprint = ${JSON.stringify(blueprint, null, 2)};`,
    '',
    "throw new Error('PULSE_HARNESS_BLUEPRINT_NOT_EXECUTED: materialize fixtures and assertions before running this plan');",
  ].join('\n');
}

function buildHarnessExecutionPlan(
  target: HarnessTarget,
  executionMode: 'ai_safe' | 'governed_validation',
): Array<{ step: string; required: boolean; detail: string }> {
  const plan: Array<{ step: string; required: boolean; detail: string }> = [
    {
      step: 'materialize_target',
      required: true,
      detail: `Import ${target.filePath} through the owning package test adapter before invoking ${target.methodName ?? target.name}.`,
    },
    {
      step: 'bind_fixtures',
      required: true,
      detail:
        'Bind every required fixture from this blueprint to real constructors, HTTP app, queue, or database adapters.',
    },
  ];

  if (target.httpMethod && target.routePattern) {
    plan.push({
      step: 'http_contract',
      required: true,
      detail: `Exercise ${target.httpMethod.toUpperCase()} ${target.routePattern} through the app adapter and assert status, response body, and error body contracts.`,
    });
  }

  if (target.kind === 'service') {
    plan.push({
      step: 'service_contract',
      required: true,
      detail:
        'Instantiate the service with explicit dependency doubles or test adapters and assert concrete return values and thrown errors.',
    });
  }

  if (target.kind === 'worker') {
    plan.push({
      step: 'queue_contract',
      required: true,
      detail:
        'Dispatch a real queue payload in an isolated queue adapter and record job completion, retry, and failure evidence.',
    });
  }

  if (target.kind === 'webhook') {
    plan.push({
      step: 'webhook_contract',
      required: true,
      detail:
        'Send signed and invalid inbound payloads through the webhook route and assert acknowledgement, rejection, and idempotency behavior.',
    });
  }

  if (target.kind === 'cron') {
    plan.push({
      step: 'schedule_contract',
      required: true,
      detail:
        'Invoke the scheduled handler through a controlled clock or direct scheduler adapter and record side effects.',
    });
  }

  if (target.requiresAuth) {
    plan.push({
      step: 'auth_boundary',
      required: true,
      detail:
        'Run positive, missing credential, and malformed credential attempts against the discovered guard boundary.',
    });
  }

  if (target.requiresTenant) {
    plan.push({
      step: 'tenant_boundary',
      required: true,
      detail:
        'Run matching-context and mismatched-context attempts before a pass/fail status can count as observed evidence.',
    });
  }

  if (hasPersistenceDependency(target)) {
    plan.push({
      step: 'side_effects',
      required: true,
      detail:
        'Record database reads/writes before and after execution and attach model-level side-effect evidence.',
    });
  }

  plan.push({
    step: 'record_evidence',
    required: true,
    detail: `Persist attempts, timestamps, logs, output, and side effects; ${executionMode} blueprints remain not observed until this exists.`,
  });

  return plan;
}

function buildHarnessRequiredAssertions(target: HarnessTarget): string[] {
  const assertions = [
    'materialize target import and dependency setup from the owning package',
    'bind fixtures to real constructors, HTTP app, queue, or database test adapter',
    'assert concrete output contract instead of defined/non-error placeholders',
    'record attempts, timestamps, output, logs, and side effects before status can pass',
  ];

  if (target.httpMethod) {
    assertions.push(
      'assert HTTP status, response schema, and error schema for the discovered route',
    );
  }

  if (target.requiresAuth) {
    assertions.push('assert authenticated and unauthenticated credential boundaries');
  }

  if (target.requiresTenant) {
    assertions.push('assert same-context success and cross-context rejection');
  }

  if (hasPersistenceDependency(target)) {
    assertions.push('assert persistent side effects and rollback or isolation evidence');
  }

  if (target.kind === 'worker') {
    assertions.push('assert queue job lifecycle, retry behavior, and failure handling');
  }

  if (target.kind === 'webhook') {
    assertions.push(
      'assert signed payload acceptance, invalid signature rejection, and duplicate delivery handling',
    );
  }

  return assertions;
}

function buildHarnessExpectedEvidence(
  target: HarnessTarget,
): Array<{ kind: string; required: boolean; reason: string }> {
  const expectedEvidence: Array<{ kind: string; required: boolean; reason: string }> = [
    {
      kind: 'runtime',
      required: true,
      reason:
        'Harness blueprint must be executed and recorded with attempts, timestamps, and pass/fail status.',
    },
  ];

  if (target.httpMethod) {
    expectedEvidence.push({
      kind: 'integration',
      required: true,
      reason:
        'HTTP target must validate request, response, and status contract through the owning app adapter.',
    });
  }

  if (target.requiresAuth || target.requiresTenant) {
    expectedEvidence.push({
      kind: 'isolation',
      required: true,
      reason:
        'Auth or tenant metadata requires positive and negative isolation proof before observation.',
    });
  }

  if (hasPersistenceDependency(target)) {
    expectedEvidence.push({
      kind: 'side_effect',
      required: true,
      reason: 'Persistent dependency requires recorded state access and side-effect verification.',
    });
  }

  return expectedEvidence;
}
