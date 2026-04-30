/**
 * PULSE Wave 5 — Scenario Evidence Engine
 *
 * Generates executable scenario definitions for every core product flow.
 * Each scenario includes concrete steps (login, navigate, click, type,
 * submit, assert) derived from the behavior graph, execution harness,
 * dataflow engine, and product graph.
 *
 * Persisted to `.pulse/current/PULSE_SCENARIO_EVIDENCE.json`.
 */

import * as path from 'path';
import { safeJoin } from './lib/safe-path';
import {
  extractRouteFromSurfaceId,
  isObservedHttpEntrypointMethod,
  isObservedMutatingMethod,
  toPlaywrightHttpMethod,
} from './dynamic-reality-grammar';
import { pathExists, readJsonFile, writeTextFile } from './safe-fs';
import type {
  PulseProductCapability,
  PulseProductFlow,
  PulseProductGraph,
  PulseProductSurface,
} from './types';
import type { BehaviorGraph, BehaviorNode } from './types.behavior-graph';
import type { DataflowState, EntityLifecycle } from './types.dataflow-engine';
import type { HarnessEvidence, HarnessTarget } from './types.execution-harness';
import type {
  Scenario,
  ScenarioCategory,
  ScenarioEvidenceLink,
  ScenarioEvidenceState,
  ScenarioPrecondition,
  ScenarioRole,
  ScenarioStep,
  ScenarioStepKind,
  ScenarioStatus,
} from './types.scenario-engine';

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_STEP_TIMEOUT = 15000;
const LONG_STEP_TIMEOUT = 30000;

const BEHAVIOR_GRAPH_FILENAME = 'PULSE_BEHAVIOR_GRAPH.json';
const DATAFLOW_STATE_FILENAME = 'PULSE_DATAFLOW_STATE.json';
const HARNESS_EVIDENCE_FILENAME = 'PULSE_HARNESS_EVIDENCE.json';
const PRODUCT_GRAPH_FILENAME = 'PULSE_PRODUCT_GRAPH.json';
const SCENARIO_EVIDENCE_FILENAME = 'PULSE_SCENARIO_EVIDENCE.json';

function resolveCategory(
  surface: PulseProductSurface | null,
  capabilities: PulseProductCapability[],
  flows: PulseProductFlow[],
  endpoints: BehaviorNode[],
): ScenarioCategory {
  if (!surface) return 'system-flow';
  if (flows.length > 0 || capabilities.some((capability) => capability.flowIds.length > 0)) {
    return endpoints.length > 0 ? 'interaction-flow' : 'runtime-flow';
  }
  return 'surface-map';
}

function resolveRole(
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
  if (
    endpoints.length === 0 &&
    capabilities.every((capability) => capability.truthMode !== 'observed')
  ) {
    return 'anonymous';
  }
  return 'anonymous';
}

// ─── Artifact Loaders ────────────────────────────────────────────────────────

function resolveArtifactPath(rootDir: string, fileName: string): string {
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

function loadJsonArtifact<T>(rootDir: string, fileName: string): T | null {
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

interface LoadedArtifacts {
  productGraph: PulseProductGraph | null;
  behaviorGraph: BehaviorGraph | null;
  harnessEvidence: HarnessEvidence | null;
  dataflowState: DataflowState | null;
}

function loadAllArtifacts(rootDir: string): LoadedArtifacts {
  return {
    productGraph: loadJsonArtifact<PulseProductGraph>(rootDir, PRODUCT_GRAPH_FILENAME),
    behaviorGraph: loadJsonArtifact<BehaviorGraph>(rootDir, BEHAVIOR_GRAPH_FILENAME),
    harnessEvidence: loadJsonArtifact<HarnessEvidence>(rootDir, HARNESS_EVIDENCE_FILENAME),
    dataflowState: loadJsonArtifact<DataflowState>(rootDir, DATAFLOW_STATE_FILENAME),
  };
}

// ─── Behavior Graph Queries ──────────────────────────────────────────────────

function tokenizeSurface(surface: PulseProductSurface): string[] {
  const raw = [surface.id, surface.name, ...surface.artifactIds, ...surface.capabilities].join(' ');
  return [...new Set(tokenizeScenarioText(raw).filter((token) => !isSurfaceHintNoiseToken(token)))];
}

function isSurfaceHintNoiseToken(token: string): boolean {
  return (
    token.length <= 2 ||
    [
      'api',
      'app',
      'backend',
      'component',
      'components',
      'controller',
      'controllers',
      'frontend',
      'lib',
      'page',
      'pages',
      'route',
      'routes',
      'service',
      'services',
      'src',
      'ts',
      'tsx',
      'js',
      'jsx',
    ].includes(token) ||
    isObservedHttpEntrypointMethod(token)
  );
}

function nodeMatchesSurface(node: BehaviorNode, surface: PulseProductSurface): boolean {
  const hints = tokenizeSurface(surface);
  if (hints.length === 0) return false;
  const lower = node.filePath.toLowerCase();
  return hints.some((hint) => lower.includes(hint));
}

function getEndpointsForSurface(
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

function getHttpDecorator(node: BehaviorNode): string {
  for (const d of node.decorators) {
    if (isObservedHttpEntrypointMethod(d)) {
      return d.toUpperCase();
    }
  }
  return 'GET';
}

function extractRoutePattern(node: BehaviorNode): string {
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

function getHarnessTargetsForSurface(
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

function getHarnessFixtures(targets: HarnessTarget[]): string[] {
  const names = new Set<string>();
  for (const t of targets) {
    for (const f of t.fixtures) {
      names.add(f.name);
    }
  }
  return Array.from(names).slice(0, 5);
}

// ─── Dataflow Queries ────────────────────────────────────────────────────────

function getEntitiesForSurface(
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

function getPrimaryEntity(entities: EntityLifecycle[]): EntityLifecycle | null {
  if (entities.length === 0) return null;
  const critical = entities.filter((e) => e.critical || e.financial);
  return critical.length > 0 ? critical[0] : entities[0];
}

function getEntityOperations(entity: EntityLifecycle | null): string[] {
  if (!entity) return [];
  const ops: string[] = [];
  if (entity.createdBy.length > 0) ops.push('create');
  if (entity.readBy.length > 0) ops.push('read');
  if (entity.updatedBy.length > 0) ops.push('update');
  if (entity.deletedBy.length > 0) ops.push('delete');
  return ops;
}

// ─── Surface / Capability Mappings ───────────────────────────────────────────

function getSurface(
  productGraph: PulseProductGraph | null,
  surfaceId: string,
): PulseProductSurface | null {
  return productGraph?.surfaces.find((s) => s.id === surfaceId) || null;
}

function getCapabilitiesForSurface(
  productGraph: PulseProductGraph | null,
  surfaceId: string,
): PulseProductCapability[] {
  if (!productGraph) return [];
  return productGraph.capabilities.filter((c) => c.surfaceId === surfaceId);
}

function getFlowsForSurface(
  productGraph: PulseProductGraph | null,
  surfaceId: string,
): PulseProductFlow[] {
  if (!productGraph) return [];
  const caps = new Set(
    productGraph.capabilities.filter((c) => c.surfaceId === surfaceId).map((c) => c.id),
  );
  return productGraph.flows.filter((f) => caps.has(f.entryCapability));
}
