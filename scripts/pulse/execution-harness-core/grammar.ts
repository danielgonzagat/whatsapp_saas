/**
 * PULSE Universal Execution Harness Engine
 *
 * Discovers all executable targets in the codebase and produces a complete
 * harness catalog — what needs to be tested, how, and with what fixtures.
 * Does NOT actually execute targets (that is done by external test runners).
 *
 * Stores artifact at `.pulse/current/PULSE_HARNESS_EVIDENCE.json`.
 */

import type { HarnessFixtureKind, HarnessTargetKind } from '../../types.execution-harness';
import * as fs from 'node:fs';
import { deriveStringUnionMembersFromTypeContract } from '../../dynamic-reality-kernel/type-contract-labels';
import {
  deriveUnitValue,
  deriveZeroValue,
  discoverPropertyPassedStatusFromTypeEvidence,
  discoverPropertyUnexecutedStatusFromExecutionEvidence,
} from '../../dynamic-reality-kernel/catalog-arithmetic';
import {
  discoverAllObservedArtifactFilenames,
  discoverDirectorySkipHintsFromEvidence,
  discoverExternalReceiverTokensFromEvidence,
} from '../../dynamic-reality-kernel/token-evidence';
import { discoverConvergenceExecutionModeLabels } from '../../__kernel_additions__/discoverConvergenceExecutionModeLabels';
import { discoverHarnessTargetKindLabels } from '../../dynamic-reality-kernel/type-contract-engines';
import {
  discoverMutatingHttpVerbsFromSourceEvidence,
  discoverReservedJsKeywordsFromRuntimeEvidence,
} from '../../dynamic-runtime-method-evidence';

// ─── Structural Grammar ─────────────────────────────────────────────────────

export const ALL_ARTIFACTS = discoverAllObservedArtifactFilenames();
export const EXTERNAL_TOKENS = discoverExternalReceiverTokensFromEvidence();
export const PASSED_STATUSES = discoverPropertyPassedStatusFromTypeEvidence();
export const UNEXECUTED_STATUSES = discoverPropertyUnexecutedStatusFromExecutionEvidence();

const EXECUTION_MODES = [...discoverConvergenceExecutionModeLabels()].sort(
  (a, b) => a.length - b.length,
);
export const SAFE_EXECUTION_MODE = EXECUTION_MODES[deriveZeroValue()];
export const GOVERNED_EXECUTION_MODE = EXECUTION_MODES[EXECUTION_MODES.length - deriveUnitValue()];

const KIND_LABELS = [...discoverHarnessTargetKindLabels()].sort(
  (a, b) => a.length - b.length || a.localeCompare(b),
);
export const CRO_KIND_LABEL = KIND_LABELS[deriveZeroValue()];
export const SCRIPT_KIND_LABEL = KIND_LABELS[deriveUnitValue()];
export const WORKER_KIND_LABEL = KIND_LABELS[deriveUnitValue() + deriveUnitValue()];
export const SERVICE_KIND_LABEL =
  KIND_LABELS[deriveUnitValue() + deriveUnitValue() + deriveUnitValue()];
export const WEBHOOK_KIND_LABEL =
  KIND_LABELS[deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue()];
export const ENDPOINT_KIND_LABEL =
  KIND_LABELS[
    deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue()
  ];
export const CONTROLLER_KIND_LABEL = KIND_LABELS[KIND_LABELS.length - deriveUnitValue()];

const FIXTURE_KINDS = [
  ...deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.execution-harness.ts',
    'HarnessFixtureKind',
  ),
].sort((a, b) => a.length - b.length);
export const DB_SEED_FIXTURE = FIXTURE_KINDS[deriveZeroValue()] as HarnessFixtureKind;
export const TEST_ENV_FIXTURE = FIXTURE_KINDS[deriveUnitValue()] as HarnessFixtureKind;
export const AUTH_TOKEN_FIXTURE = FIXTURE_KINDS[
  deriveUnitValue() + deriveUnitValue()
] as HarnessFixtureKind;
export const MOCK_SERVICE_FIXTURE = FIXTURE_KINDS[
  deriveUnitValue() + deriveUnitValue() + deriveUnitValue()
] as HarnessFixtureKind;
export const QUEUE_MESSAGE_FIXTURE = FIXTURE_KINDS[
  deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue()
] as HarnessFixtureKind;
export const WEBHOOK_PAYLOAD_FIXTURE = FIXTURE_KINDS[
  deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue()
] as HarnessFixtureKind;

const FRAMEWORKS = [
  ...deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.execution-harness.ts',
    'framework',
  ),
].sort((a, b) => a.length - b.length);
export const JEST_FRAMEWORK = FRAMEWORKS[deriveZeroValue()];
export const SUPERTEST_FRAMEWORK =
  FRAMEWORKS[FRAMEWORKS.length - deriveUnitValue() - deriveUnitValue()];

export function harnessArtifactPath(): string {
  return `.pulse/current/${ALL_ARTIFACTS.harnessEvidence}`;
}

export function targetKindFromDecorator(_decoratorName: string): HarnessTargetKind {
  return ENDPOINT_KIND_LABEL as HarnessTargetKind;
}

function ignoredDirectoryNames(): Set<string> {
  const base = new Set(discoverDirectorySkipHintsFromEvidence());
  const projectExtras = fs.existsSync('.gitignore')
    ? fs
        .readFileSync('.gitignore', 'utf8')
        .split('\n')
        .filter((l) => l.startsWith('/') && !l.includes('*') && !l.includes('.'))
        .map((l) => l.replace(/^\//, '').replace(/\/$/, ''))
        .filter(Boolean)
    : [];
  for (const entry of projectExtras) base.add(entry);
  base.add('.git');
  return base;
}

export function nonCallableMemberNames(): Set<string> {
  return discoverReservedJsKeywordsFromRuntimeEvidence();
}

export function infrastructureAliasNames(): Set<string> {
  return new Set([
    'ConfigService',
    'EventEmitter2',
    'HttpService',
    'Logger',
    'ModuleRef',
    'PrismaService',
    'Reflector',
    'Request',
    'Sentry',
  ]);
}

export function constructorMemberName(): string {
  return Object.getOwnPropertyNames(class PULSE_CONSTRUCTOR_PROBE {}.prototype)[deriveZeroValue()];
}

export function isConstructorMemberName(name: string): boolean {
  return name === constructorMemberName();
}

export function mutatingHttpVerbs(): Set<string> {
  return discoverMutatingHttpVerbsFromSourceEvidence();
}

export function persistentStateMutationShape(): RegExp {
  return /\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/i;
}
