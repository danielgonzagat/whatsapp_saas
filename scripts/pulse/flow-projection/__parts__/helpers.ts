import * as path from 'path';
import type { PulseCapabilityState, PulseFlowProjectionItem } from '../../types.capabilities';
import type { PulseCodebaseTruth } from '../../types.truth';
import type { PulseExecutionEvidence } from '../../types.evidence';
import type { PulseResolvedManifest } from '../../types.resolved-manifest';
import type { PulseScopeState } from '../../types.truth.scope';
import type {
  PulseStructuralGraph,
  PulseStructuralRole,
  PulseTruthMode,
} from '../../types.structural';
import type { PulseActorEvidence } from '../../types.evidence';
import {
  deriveRouteFamily,
  deriveStructuralFamilies,
  familiesOverlap,
  isMeaningfulUiLabel,
  titleCaseStructural,
} from '../../structural-family';
import { normalizePath } from '../../scope-state.codacy';
import { readTextFile } from '../../safe-fs';
import { safeJoin } from '../../lib/safe-path';
import type { PulseCapabilityDoD, PulseDoDStatus } from '../../types.capabilities';
import {
  evaluateDone,
  type CapabilityRoleEvidence,
  type StructuralRole as DoDStructuralRole,
} from '../../definition-of-done';

/** Required DoD roles for a runtime-critical user flow. */
const FLOW_REQUIRED_DOD_ROLES: DoDStructuralRole[] = [
  'interface',
  'orchestration',
  'persistence',
  'side_effect',
  'scenario_coverage',
];

/** Translate flow status to DoD status enum. */
function flowToDoDStatus(args: {
  done: boolean;
  pulseStatus: 'real' | 'partial' | 'latent' | 'phantom';
}): PulseDoDStatus {
  if (args.done) {
    return 'done';
  }
  if (args.pulseStatus === 'phantom') {
    return 'phantom';
  }
  if (args.pulseStatus === 'latent') {
    return 'latent';
  }
  return 'partial';
}

/** Build DoD evidence for a flow projection item. */
function buildFlowDoDEvidence(args: {
  rolesPresent: PulseStructuralRole[];
  hasRuntimeEvidence: boolean;
  hasScenarioCoverage: boolean;
  hasStaticValidation: boolean;
  truthMode: PulseTruthMode;
}): CapabilityRoleEvidence[] {
  const tm = args.truthMode;
  const includes = (role: PulseStructuralRole): boolean => args.rolesPresent.includes(role);
  return [
    { role: 'interface', present: includes('interface'), truthMode: tm },
    { role: 'api_surface', present: includes('interface'), truthMode: tm },
    { role: 'orchestration', present: includes('orchestration'), truthMode: tm },
    { role: 'persistence', present: includes('persistence'), truthMode: tm },
    { role: 'side_effect', present: includes('side_effect'), truthMode: tm },
    {
      role: 'runtime_evidence',
      present: args.hasRuntimeEvidence,
      truthMode: args.hasRuntimeEvidence ? 'observed' : 'aspirational',
    },
    {
      role: 'validation',
      present: args.hasStaticValidation || includes('orchestration'),
      truthMode: args.hasStaticValidation ? 'observed' : tm,
    },
    {
      role: 'scenario_coverage',
      present: args.hasScenarioCoverage || args.hasStaticValidation,
      truthMode: args.hasScenarioCoverage ? 'observed' : 'aspirational',
    },
    {
      role: 'observability',
      present: args.hasRuntimeEvidence,
      truthMode: args.hasRuntimeEvidence ? 'inferred' : 'aspirational',
    },
    { role: 'codacy_hygiene', present: true, truthMode: 'inferred' },
  ];
}

export interface BuildFlowProjectionInput {
  structuralGraph: PulseStructuralGraph;
  capabilityState: PulseCapabilityState;
  codebaseTruth: PulseCodebaseTruth;
  resolvedManifest: PulseResolvedManifest;
  scopeState?: PulseScopeState;
  executionEvidence?: Partial<PulseExecutionEvidence>;
}

export interface StaticValidationSource {
  filePath: string;
  normalizedText: string;
  compactText: string;
  families: string[];
}

type PulseScenarioResultItem = PulseActorEvidence['results'][number];

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hasScenarioResults(value: unknown): value is { results: PulseScenarioResultItem[] } {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    'results' in value &&
    Array.isArray(value.results)
  );
}

export function collectScenarioResults(
  executionEvidence: Partial<PulseExecutionEvidence> | undefined,
): PulseScenarioResultItem[] {
  if (!executionEvidence) {
    return [];
  }

  return Object.values(executionEvidence).flatMap((evidenceBlock) =>
    hasScenarioResults(evidenceBlock) ? evidenceBlock.results : [],
  );
}

function compactWords(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function splitValidationTokens(value: string): string[] {
  const ignored = new Set([
    'api',
    'app',
    'backend',
    'frontend',
    'post',
    'get',
    'put',
    'patch',
    'delete',
    'route',
    'routes',
    'src',
    'test',
    'spec',
    'tsx',
    'ts',
    'v1',
    'v2',
  ]);
  return unique(
    String(value || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && /[a-z]/.test(token))
      .filter((token) => !ignored.has(token)),
  );
}

function normalizeForValidation(value: string): string {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9/:-]+/g, ' ')
    .toLowerCase();
}

function compactForValidation(value: string): string {
  return normalizeForValidation(value).replace(/[^a-z0-9]+/g, '');
}

function routeValidationVariants(routePatterns: string[]): string[] {
  return unique(
    routePatterns
      .flatMap((routePattern) => {
        const raw = String(routePattern || '')
          .replace(/:[^/]+/g, '')
          .replace(/\[[^\]]+\]/g, '')
          .replace(/\/+/g, '/')
          .replace(/\/$/g, '')
          .toLowerCase();
        const withoutLeadingSlash = raw.replace(/^\/+/, '');
        return [raw, withoutLeadingSlash].filter((value) => value.length >= 5);
      })
      .filter(Boolean),
  );
}

export function buildStaticValidationSources(
  scopeState: PulseScopeState | undefined,
): StaticValidationSource[] {
  if (!scopeState) {
    return [];
  }

  return scopeState.files
    .filter((file) => {
      const filePath = normalizePath(file.path);
      const isSourceLikeTest = /\.[jt]sx?$/.test(filePath);
      return (
        isSourceLikeTest &&
        (file.kind === 'spec' ||
          /\.(?:spec|test)\.[jt]sx?$/.test(filePath) ||
          /^e2e\/(?:specs|visual|tests)\//.test(filePath) ||
          filePath.includes('/test/'))
      );
    })
    .map((file) => {
      const filePath = normalizePath(file.path);
      try {
        const source = readTextFile(safeJoin(scopeState.rootDir, filePath)).slice(0, 500_000);
        return {
          filePath,
          normalizedText: normalizeForValidation(source),
          compactText: compactForValidation(source),
          families: deriveStructuralFamilies([filePath]),
        };
      } catch {
        return null;
      }
    })
    .filter((value): value is StaticValidationSource => Boolean(value));
}

export function findStaticValidationMatches(input: {
  candidate: BuildFlowProjectionInput['codebaseTruth']['discoveredFlows'][number];
  routePatterns: string[];
  flowFamilies: string[];
  sources: StaticValidationSource[];
}): StaticValidationSource[] {
  const tokens = splitValidationTokens(
    [
      input.candidate.id,
      input.candidate.moduleKey,
      input.candidate.moduleName,
      input.candidate.pageRoute,
      input.candidate.elementLabel,
      input.candidate.endpoint,
      input.candidate.backendRoute || '',
      ...(input.candidate.semanticTokens || []),
    ].join(' '),
  );
  const routeTokens = splitValidationTokens(input.routePatterns.join(' '));
  const requiredRouteTokenHits = Math.min(routeTokens.length, 3);
  const terminalRouteToken = routeTokens[routeTokens.length - 1] || null;
  const routeVariants = routeValidationVariants(input.routePatterns);

  return input.sources.filter((source) => {
    const routeMatched = routeVariants.some(
      (variant) => source.normalizedText.includes(variant) || source.compactText.includes(variant),
    );
    const tokenHits = tokens.filter((token) => source.compactText.includes(token));
    const routeTokenHits = routeTokens.filter((token) => source.compactText.includes(token));
    const familyMatched = familiesOverlap(input.flowFamilies, source.families);
    const routeTokenCoverage =
      requiredRouteTokenHits > 0 &&
      routeTokenHits.length >= requiredRouteTokenHits &&
      (!terminalRouteToken || routeTokenHits.includes(terminalRouteToken));

    return (
      (routeMatched && tokenHits.length >= 2) ||
      (familyMatched && routeTokenCoverage && tokenHits.length >= 3)
    );
  });
}

export function chooseTruthMode(observed: boolean, projected: boolean): PulseTruthMode {
  if (observed) {
    return 'observed';
  }
  if (projected) {
    return 'aspirational';
  }
  return 'inferred';
}

export function chooseFlowName(
  candidate: BuildFlowProjectionInput['codebaseTruth']['discoveredFlows'][number],
): string {
  if (isMeaningfulUiLabel(candidate.elementLabel)) {
    return candidate.elementLabel;
  }

  const family =
    deriveRouteFamily(candidate.backendRoute || '') ||
    deriveRouteFamily(candidate.endpoint) ||
    deriveRouteFamily(candidate.pageRoute) ||
    deriveStructuralFamilies([
      candidate.declaredFlow || '',
      candidate.moduleName,
      candidate.moduleKey,
    ])[0] ||
    candidate.id;

  return titleCaseStructural(family);
}

export function findFlowStatus(
  rolesPresent: PulseStructuralRole[],
  facadeEvidence: boolean,
  executedFailure: boolean,
): PulseFlowProjectionItem['status'] {
  const hasInterface = rolesPresent.includes('interface');
  const hasOrchestration = rolesPresent.includes('orchestration');
  const hasPersistence = rolesPresent.includes('persistence');
  const hasSideEffect = rolesPresent.includes('side_effect');
  const hasSimulation = rolesPresent.includes('simulation');

  if ((hasSimulation && !hasPersistence && !hasSideEffect) || facadeEvidence) {
    return 'phantom';
  }
  if (executedFailure) {
    return 'partial';
  }
  if (hasInterface && hasOrchestration && (hasPersistence || hasSideEffect)) {
    return 'real';
  }
  if (hasInterface || hasOrchestration) {
    return 'partial';
  }
  return 'latent';
}

export { FLOW_REQUIRED_DOD_ROLES, flowToDoDStatus, buildFlowDoDEvidence };
