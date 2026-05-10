// PULSE — AST/Structural Graph Context & Trace Generation Core

import * as path from 'path';
import { safeJoin } from '../safe-path';
import { pathExists, readJsonFile } from '../safe-fs';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../dynamic-reality-kernel/catalog-arithmetic';
import { discoverAllObservedArtifactFilenames } from '../dynamic-reality-kernel/token-evidence';
import type { OtelSpan, OtelTrace } from '../types.otel-runtime';
import type { PulseStructuralEdge, PulseStructuralGraph } from '../types.structural';
import type { AstCallGraph, AstCallEdge } from '../types.ast-graph';
import {
  stableHex,
  stableNumber,
  stableChoice,
  stableIso,
  clampDuration,
  OTEL_STATUS_OK,
  OTEL_STATUS_ERROR,
  HTTP_STATUS_OK,
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  HTTP_STATUS_TEXT_LEN_OK,
  HTTP_STATUS_TEXT_LEN_FORBIDDEN,
} from './constants';
import {
  buildChildSpanName,
  buildSiblingSpanName,
  buildStructuralFallbackSpanName,
  inferServiceFromAvailableSymbols,
  inferServiceFromSpanName,
  createManualSpanForTrace,
} from './span-gen';

// ─── AST Graph Context ────────────────────────────────────────────────────────

export interface AstGraphContext {
  edges: AstCallEdge[];
  symbols: Map<
    string,
    {
      name: string;
      kind: string;
      filePath: string;
      httpMethod?: string | null;
      routePath?: string | null;
    }
  >;
}

export interface StructuralGraphContext {
  edges: PulseStructuralEdge[];
  nodeFiles: Record<string, string>;
}

/**
 * Load the AST call graph from the canonical artifact directory.
 */
export function loadAstGraphContext(rootDir: string): AstGraphContext {
  const currentDir = safeJoin(rootDir, '.pulse', 'current');
  const edges: AstCallEdge[] = [];
  const symbols = new Map<
    string,
    {
      name: string;
      kind: string;
      filePath: string;
      httpMethod?: string | null;
      routePath?: string | null;
    }
  >();

  try {
    const graphPath = safeJoin(
      currentDir,
      discoverAllObservedArtifactFilenames().astGraph || 'PULSE_AST_GRAPH.json',
    );
    if (pathExists(graphPath)) {
      const graph = readJsonFile<AstCallGraph>(graphPath);
      edges.push(...graph.edges);
      for (const symbol of graph.symbols) {
        symbols.set(symbol.id, {
          name: symbol.name,
          kind: symbol.kind,
          filePath: symbol.filePath,
          httpMethod: symbol.httpMethod,
          routePath: symbol.routePath,
        });
      }
    }
  } catch {
    // AST graph not available
  }

  return { edges, symbols };
}

/**
 * Load structural graph context from the canonical artifact directory.
 */
export function loadStructuralGraphContext(rootDir: string): StructuralGraphContext {
  const currentDir = safeJoin(rootDir, '.pulse', 'current');
  const edges: PulseStructuralEdge[] = [];
  const nodeFiles: Record<string, string> = {};

  try {
    const graphPath = safeJoin(currentDir, discoverAllObservedArtifactFilenames().structuralGraph);
    if (pathExists(graphPath)) {
      const graph = readJsonFile<PulseStructuralGraph>(graphPath);
      edges.push(...graph.edges);
      for (const node of graph.nodes) {
        nodeFiles[node.id] = node.file || '';
      }
    }
  } catch {
    // Structural graph not available — minimal data.
  }

  return { edges, nodeFiles };
}

// ─── Trace Generation from AST and Structural Graphs ─────────────────────────

/**
 * Generate traces rooted in AST graph edges and auto-instrumentation hints
 * instead of purely random simulation. This produces more realistic traces
 * that reflect the actual codebase structure.
 */
export function generateAstBasedTraces(
  astCtx: AstGraphContext,
  structCtx: StructuralGraphContext,
  count: number,
): OtelTrace[] {
  const traces: OtelTrace[] = [];
  const graphSeed = buildStaticTraceSeed(astCtx, structCtx);

  // Collect HTTP routes from AST symbols
  const httpRoutes: Array<{
    method: string;
    routePath: string;
    service: string;
    filePath: string;
  }> = [];
  for (const [, sym] of astCtx.symbols) {
    if (sym.httpMethod && sym.routePath) {
      httpRoutes.push({
        method: sym.httpMethod,
        routePath: sym.routePath,
        service: 'backend',
        filePath: sym.filePath,
      });
    }
  }
  httpRoutes.sort((a, b) =>
    `${a.method} ${a.routePath} ${a.filePath}`.localeCompare(
      `${b.method} ${b.routePath} ${b.filePath}`,
    ),
  );

  for (let t = 0; t < count; t++) {
    const traceSeed = `${graphSeed}:trace:${t}`;
    const traceId = stableHex(traceSeed, 32);
    const spans: OtelSpan[] = [];

    // Pick a root: prefer an AST-resolved HTTP route, fall back to structural evidence.
    let rootName: string;
    let rootService: string;
    if (httpRoutes.length > 0) {
      const route = stableChoice(httpRoutes, `${traceSeed}:root-route`);
      rootName = `${route.method} ${route.routePath}`;
      rootService = route.service;
    } else {
      rootName = buildStructuralFallbackSpanName(astCtx, structCtx, `${traceSeed}:fallback-root`);
      rootService = inferServiceFromSpanName(rootName);
    }

    const rootSpan = createManualSpanForTrace(
      traceId,
      null,
      0,
      rootName,
      'server',
      rootService,
      astCtx,
      structCtx,
      { isRoot: true },
      `${traceSeed}:root`,
    );
    spans.push(rootSpan);

    // Build child spans from AST edges
    const { fromFile, toFile } = pickAstEdgeFiles(astCtx, structCtx, `${traceSeed}:edge`);
    const depth = 1 + stableNumber(`${traceSeed}:depth`, deriveUnitValue() + deriveUnitValue());

    let previousId = rootSpan.spanId;
    for (let i = 1; i <= depth; i++) {
      const kind: OtelSpan['kind'] = i === deriveUnitValue() ? 'client' : 'internal';
      const childName = buildChildSpanName(
        astCtx,
        fromFile,
        toFile,
        kind,
        `${traceSeed}:child:${i}`,
      );
      const childSpan = createManualSpanForTrace(
        traceId,
        previousId,
        i,
        childName,
        kind,
        rootService,
        astCtx,
        structCtx,
        { isRoot: false },
        `${traceSeed}:child:${i}`,
      );
      spans.push(childSpan);
      previousId = childSpan.spanId;
    }

    // Add sibling spans
    const siblingCount = stableNumber(
      `${traceSeed}:sibling-count`,
      deriveUnitValue() + deriveUnitValue(),
    );
    for (let i = 0; i < siblingCount; i++) {
      const siblingName = buildSiblingSpanName(astCtx, `${traceSeed}:sibling:${i}`);
      const sibSpan = createManualSpanForTrace(
        traceId,
        rootSpan.spanId,
        depth + i + 1,
        siblingName,
        'internal',
        rootService,
        astCtx,
        structCtx,
        { isRoot: false },
        `${traceSeed}:sibling:${i}`,
      );
      spans.push(sibSpan);
    }

    const errorSpans = spans.filter((s) => s.status === OTEL_STATUS_ERROR).length;
    const serviceBoundaries = new Set(spans.map((s) => s.serviceName)).size - 1;

    traces.push({
      traceId,
      rootSpan,
      spans,
      totalDurationMs: spans.reduce((max, s) => Math.max(max, s.durationMs), 0),
      errorSpans,
      serviceBoundaries: Math.max(deriveZeroValue(), serviceBoundaries),
    });
  }

  return traces;
}

export function buildStaticTraceSeed(
  astCtx: AstGraphContext,
  structCtx: StructuralGraphContext,
): string {
  const astEdges = astCtx.edges.map((edge) => `${edge.from}->${edge.to}`).sort();
  const astSymbols = [...astCtx.symbols.entries()]
    .map(
      ([id, symbol]) =>
        `${id}:${symbol.name}:${symbol.kind}:${symbol.filePath}:${symbol.httpMethod || ''}:${
          symbol.routePath || ''
        }`,
    )
    .sort();
  const structuralEdges = structCtx.edges.map((edge) => `${edge.from}->${edge.to}`).sort();
  const structuralNodes = Object.entries(structCtx.nodeFiles)
    .map(([id, filePath]) => `${id}:${filePath}`)
    .sort();

  return stableHex(
    [...astEdges, ...astSymbols, ...structuralEdges, ...structuralNodes].join('\n'),
    32,
  );
}

export function pickAstEdgeFiles(
  astCtx: AstGraphContext,
  structCtx: StructuralGraphContext,
  seed: string,
): { fromFile: string; toFile: string } {
  if (astCtx.edges.length > 0) {
    const edge = stableChoice(
      [...astCtx.edges].sort((a, b) => `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`)),
      seed,
    );
    const fromSym = astCtx.symbols.get(edge.from);
    const toSym = astCtx.symbols.get(edge.to);
    return {
      fromFile: fromSym?.filePath || 'unknown.ts',
      toFile: toSym?.filePath || 'unknown.ts',
    };
  }
  if (structCtx.edges.length > 0) {
    const edge = stableChoice(
      [...structCtx.edges].sort((a, b) => `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`)),
      seed,
    );
    return {
      fromFile: structCtx.nodeFiles[edge.from] || 'unknown.ts',
      toFile: structCtx.nodeFiles[edge.to] || 'unknown.ts',
    };
  }
  return { fromFile: 'unknown.ts', toFile: 'unknown.ts' };
}
