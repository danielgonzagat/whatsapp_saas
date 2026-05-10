/**
 * PULSE Wave 5 — Scenario Queries & Mappings
 *
 * Part of the Scenario Evidence Engine. Provides artifact loaders,
 * behavior/harness/dataflow queries, surface/capability mappings,
 * and shared types used by the playwright spec generator and scenario builder.
 */

import * as path from 'path';
import { safeJoin } from '../lib/safe-path';
import {
  isObservedHttpEntrypointMethod,
  toPlaywrightHttpMethod,
} from '../dynamic-reality-grammar';
import { pathExists, readJsonFile } from '../safe-fs';
import {
  deriveCatalogPercentScaleFromObservedCatalog,
  deriveHttpStatusFromObservedCatalog,
  deriveUnitValue,
  deriveZeroValue,
  discoverPropertyUnexecutedStatusFromExecutionEvidence,
  observeStatusTextLengthFromCatalog,
} from '../dynamic-reality-kernel/catalog-arithmetic';
import { deriveLengthBoundariesFromObservedCatalog } from '../dynamic-reality-kernel/profile-derivations';
import {
  discoverAllObservedArtifactFilenames,
  discoverDirectorySkipHintsFromEvidence,
  discoverSourceExtensionsFromObservedTypescript,
} from '../dynamic-reality-kernel/token-evidence';
import { discoverTruthModeLabels } from '../dynamic-reality-kernel/type-contract-engines';
import type {
  PulseProductCapability,
  PulseProductFlow,
  PulseProductGraph,
  PulseProductSurface,
} from '../types.product-graph';
import type { BehaviorGraph, BehaviorNode } from '../types.behavior-graph';
import type { DataflowState, EntityLifecycle } from '../types.dataflow-engine';
import type { HarnessEvidence, HarnessTarget } from '../types.execution-harness';
import type { ScenarioCategory, ScenarioRole } from '../types.scenario-engine';

// ─── Constants ───────────────────────────────────────────────────────────────

const _scale = deriveCatalogPercentScaleFromObservedCatalog();
const _unit = deriveUnitValue();
const _zero = deriveZeroValue();
const _okTextLen = observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('OK'));
const DEFAULT_STEP_TIMEOUT =
  _okTextLen * _scale * deriveLengthBoundariesFromObservedCatalog()[0] + _unit;
const LONG_STEP_TIMEOUT = DEFAULT_STEP_TIMEOUT + DEFAULT_STEP_TIMEOUT;

const _artifactNames = discoverAllObservedArtifactFilenames();
const BEHAVIOR_GRAPH_FILENAME = _artifactNames.behaviorGraph;
const DATAFLOW_STATE_FILENAME = _artifactNames.dataflowState;
const HARNESS_EVIDENCE_FILENAME = _artifactNames.harnessEvidence;
const PRODUCT_GRAPH_FILENAME = _artifactNames.productGraph;
const SCENARIO_EVIDENCE_FILENAME = _artifactNames.scenarioEvidence;

export {
  _scale,
  _unit,
  _zero,
  _okTextLen,
  DEFAULT_STEP_TIMEOUT,
  LONG_STEP_TIMEOUT,
  BEHAVIOR_GRAPH_FILENAME,
  DATAFLOW_STATE_FILENAME,
  HARNESS_EVIDENCE_FILENAME,
  PRODUCT_GRAPH_FILENAME,
  SCENARIO_EVIDENCE_FILENAME,
};

export function _noiseTokenSet(): Set<string> {
  return new Set([
    ...discoverDirectorySkipHintsFromEvidence(),
    ...discoverSourceExtensionsFromObservedTypescript(),
  ]);
}

export function resolveCategory(
  surface: PulseProductSurface | null,
  capabilities: PulseProductCapability[],
  flows: PulseProductFlow[],
  endpoints: BehaviorNode[],
): ScenarioCategory {
  if (!surface) return 'system-flow';
  if (
    flows.length > _zero ||
    capabilities.some((capability) => capability.flowIds.length > _zero)
  ) {
    return endpoints.length > _zero ? 'interaction-flow' : 'runtime-flow';
  }
  return 'surface-map';
}

export function resolveRole(
  surface: PulseProductSurface | null,
  endpoints: BehaviorNode[],
  capabilities: PulseProductCapability[],
): ScenarioRole {
  const discoveredTokens = [
    surface?.id,
    surface?.name,
    ...(surface?.artifactIds || []),
    ...(surface?.capabilities || []),
    ...capabilities.flatMap((capability) => [
      capability.id,
      capability.name,
      ...capability.artifactIds,
    ]),
    ...endpoints.map((endpoint) => endpoint.filePath),
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  if (/\badmin\b/.test(discoveredTokens)) {
    return 'admin';
  }
  if (/\boperator\b/.test(discoveredTokens)) {
    return 'operator';
  }
  if (/\bproducer\b/.test(discoveredTokens)) {
    return 'producer';
  }
  if (/\baffiliate\b/.test(discoveredTokens)) {
    return 'affiliate';
  }
  if (/\bcustomer\b/.test(discoveredTokens)) {
    return 'customer';
  }
  const observedTruthSet = new Set<string>(
    [...discoverTruthModeLabels()].filter((t) => t === 'observed'),
  );
  if (
    endpoints.length === _zero &&
    capabilities.every((capability) => !observedTruthSet.has(capability.truthMode))
  ) {
    return 'anonymous';
  }
  return 'anonymous';
}

// ─── Artifact Loaders ────────────────────────────────────────────────────────

export function resolveArtifactPath(rootDir: string, fileName: string): string {
  const candidates = [
    path.join(rootDir, fileName),
    safeJoin(rootDir, '.pulse', 'current', fileName),
  ];
  for (const candidate of candidates) {
    if (pathExists(candidate)) {
      return candidate;
    }
  }
  return safeJoin(rootDir, '.pulse', 'current', fileName);
}

export function loadJsonArtifact<T>(rootDir: string, fileName: string): T | null {
  const filePath = resolveArtifactPath(rootDir, fileName);
  try {
    const raw = readJsonFile<T>(filePath);
    if (raw !== null && raw !== undefined) {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

export interface LoadedArtifacts {
  productGraph: PulseProductGraph | null;
  behaviorGraph: BehaviorGraph | null;
  harnessEvidence: HarnessEvidence | null;
  dataflowState: DataflowState | null;
}

export function loadAllArtifacts(rootDir: string): LoadedArtifacts {
  return {
    productGraph: loadJsonArtifact<PulseProductGraph>(rootDir, PRODUCT_GRAPH_FILENAME),
    behaviorGraph: loadJsonArtifact<BehaviorGraph>(rootDir, BEHAVIOR_GRAPH_FILENAME),
    harnessEvidence: loadJsonArtifact<HarnessEvidence>(rootDir, HARNESS_EVIDENCE_FILENAME),
    dataflowState: loadJsonArtifact<DataflowState>(rootDir, DATAFLOW_STATE_FILENAME),
  };
}

// ─── Behavior Graph Queries ──────────────────────────────────────────────────

export function tokenizeScenarioText(value: string): string[] {
  const tokens: string[] = [];
  let current = '';
  for (const char of value.toLowerCase()) {
    const isDigit = char >= '0' && char <= '9';
    const isLetter = char >= 'a' && char <= 'z';
    if (isDigit || isLetter) {
      current += char;
      continue;
    }
    if (current) {
      tokens.push(current);
      current = '';
    }
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

export function tokenizeSurface(surface: PulseProductSurface): string[] {
  const raw = [surface.id, surface.name, ...surface.artifactIds, ...surface.capabilities].join(' ');
  return [...new Set(tokenizeScenarioText(raw).filter((token) => !isSurfaceHintNoiseToken(token)))];
}

function isSurfaceHintNoiseToken(token: string): boolean {
  const noiseSet = _noiseTokenSet();
  return (
    token.length <= _unit + _unit || noiseSet.has(token) || isObservedHttpEntrypointMethod(token)
  );
}

export function nodeMatchesSurface(node: BehaviorNode, surface: PulseProductSurface): boolean {
  const hints = tokenizeSurface(surface);
  if (hints.length === 0) return false;
  const lower = node.filePath.toLowerCase();
  return hints.some((hint) => lower.includes(hint));
}

export function getEndpointsForSurface(
  behaviorGraph: BehaviorGraph | null,
  surface: PulseProductSurface,
): BehaviorNode[] {
  if (!behaviorGraph) return [];
  return behaviorGraph.nodes.filter(
    (n) =>
      n.kind === 'api_endpoint' &&
      nodeMatchesSurface(n, surface) &&
      n.decorators.some(isObservedHttpEntrypointMethod),
  );
}

export function getHttpDecorator(node: BehaviorNode): string {
  for (const d of node.decorators) {
    if (isObservedHttpEntrypointMethod(d)) {
      return d.toUpperCase();
    }
  }
  return toPlaywrightHttpMethod('get');
}

export function extractRoutePattern(node: BehaviorNode): string {
  const segments = node.filePath.split('/').filter(Boolean);
  const backendIndex = segments.indexOf('backend');
  const srcIndex = segments.indexOf('src');
  const controllerIndex = segments.findIndex((segment) => segment.endsWith('.controller.ts'));
  if (backendIndex >= 0 && srcIndex === backendIndex + 1 && controllerIndex > srcIndex + 1) {
    const segment = segments[srcIndex + 1];
    return `/api/${segment}`;
  }
  return '/api/';
}

// ─── Execution Harness Queries ───────────────────────────────────────────────

export function getHarnessTargetsForSurface(
  harnessEvidence: HarnessEvidence | null,
  surface: PulseProductSurface,
): HarnessTarget[] {
  if (!harnessEvidence) return [];
  const hints = tokenizeSurface(surface);
  return harnessEvidence.targets.filter((t) => {
    const lower = (t.filePath + (t.routePattern || '')).toLowerCase();
    return hints.some((hint) => lower.includes(hint));
  });
}

export function getHarnessFixtures(targets: HarnessTarget[]): string[] {
  const names = new Set<string>();
  for (const t of targets) {
    for (const f of t.fixtures) {
      names.add(f.name);
    }
  }
  return Array.from(names).slice(_zero, _okTextLen + _scale + _unit);
}

// ─── Dataflow Queries ────────────────────────────────────────────────────────

export function getEntitiesForSurface(
  dataflowState: DataflowState | null,
  surface: PulseProductSurface,
): EntityLifecycle[] {
  if (!dataflowState) return [];
  const hints = tokenizeSurface(surface);
  return dataflowState.entities.filter((e) => {
    const lower = e.model.toLowerCase();
    return hints.some((hint) => lower.includes(hint));
  });
}

export function getPrimaryEntity(entities: EntityLifecycle[]): EntityLifecycle | null {
  if (entities.length === 0) return null;
  const critical = entities.filter((e) => e.critical || e.financial);
  return critical.length > 0 ? critical[0] : entities[0];
}

export function getEntityOperations(entity: EntityLifecycle | null): string[] {
  if (!entity) return [];
  const ops: string[] = [];
  if (entity.createdBy.length > _zero) ops.push('create');
  if (entity.readBy.length > _zero) ops.push('read');
  if (entity.updatedBy.length > _zero) ops.push('update');
  if (entity.deletedBy.length > _zero) ops.push('delete');
  return ops;
}

// ─── Surface / Capability Mappings ───────────────────────────────────────────

export function getSurface(
  productGraph: PulseProductGraph | null,
  surfaceId: string,
): PulseProductSurface | null {
  return productGraph?.surfaces.find((s) => s.id === surfaceId) || null;
}

export function getCapabilitiesForSurface(
  productGraph: PulseProductGraph | null,
  surfaceId: string,
): PulseProductCapability[] {
  if (!productGraph) return [];
  return productGraph.capabilities.filter((c) => c.surfaceId === surfaceId);
}

export function getFlowsForSurface(
  productGraph: PulseProductGraph | null,
  surfaceId: string,
): PulseProductFlow[] {
  if (!productGraph) return [];
  const caps = new Set(
    productGraph.capabilities.filter((c) => c.surfaceId === surfaceId).map((c) => c.id),
  );
  return productGraph.flows.filter((f) => caps.has(f.entryCapability));
}

// ─── Shared Context Type ─────────────────────────────────────────────────────

/**
 * Context passed to each scenario generator, containing resolved artifacts.
 */
export interface ScenarioBuildContext {
  category: ScenarioCategory;
  primarySurfaceId: string;
  role: ScenarioRole;
  productGraph: PulseProductGraph | null;
  behaviorGraph: BehaviorGraph | null;
  harnessEvidence: HarnessEvidence | null;
  dataflowState: DataflowState | null;
  endpoints: BehaviorNode[];
  harnessTargets: HarnessTarget[];
  entities: EntityLifecycle[];
  primaryEntity: EntityLifecycle | null;
}
