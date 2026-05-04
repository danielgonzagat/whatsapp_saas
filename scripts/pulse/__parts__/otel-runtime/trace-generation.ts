import * as path from 'path';
import type { OtelSpan, OtelTrace } from '../../types.otel-runtime';
import { clampDuration, stableChoice, stableHex, stableIso, stableNumber } from './helpers';
import type { AstGraphContext, StructuralGraphContext } from './graph-loading';

interface SpanGenOptions {
  isRoot: boolean;
}

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
    const depth = 1 + stableNumber(`${traceSeed}:depth`, 2);

    let previousId = rootSpan.spanId;
    for (let i = 1; i <= depth; i++) {
      const kind: OtelSpan['kind'] = i === 1 ? 'client' : 'internal';
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
    const siblingCount = stableNumber(`${traceSeed}:sibling-count`, 2);
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

    const errorSpans = spans.filter((s) => s.status === 'error').length;
    const serviceBoundaries = new Set(spans.map((s) => s.serviceName)).size - 1;

    traces.push({
      traceId,
      rootSpan,
      spans,
      totalDurationMs: spans.reduce((max, s) => Math.max(max, s.durationMs), 0),
      errorSpans,
      serviceBoundaries: Math.max(0, serviceBoundaries),
    });
  }

  return traces;
}

export function buildStaticTraceSeed(astCtx: AstGraphContext, structCtx: StructuralGraphContext): string {
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

export function buildChildSpanName(
  astCtx: AstGraphContext,
  _fromFile: string,
  toFile: string,
  kind: OtelSpan['kind'],
  seed: string,
): string {
  if (kind === 'client') {
    const routes = [...astCtx.symbols.values()]
      .filter((s) => s.httpMethod && s.routePath)
      .sort((a, b) =>
        `${a.httpMethod || ''} ${a.routePath || ''} ${a.filePath}`.localeCompare(
          `${b.httpMethod || ''} ${b.routePath || ''} ${b.filePath}`,
        ),
      );
    if (routes.length > 0) {
      const r = stableChoice(routes, `${seed}:route`);
      return `${r.httpMethod} ${r.routePath}`;
    }
    return buildStructuralFallbackSpanName(
      astCtx,
      { edges: [], nodeFiles: {} },
      `${seed}:fallback`,
    );
  }

  const baseName = path.basename(toFile, path.extname(toFile));
  const operations = [
    'findMany',
    'create',
    'update',
    'delete',
    'validate',
    'process',
    'transform',
    'enqueue',
    'resolve',
    'execute',
    'save',
    'load',
    'send',
    'fetch',
    'compute',
  ];
  const framework = stableChoice(
    ['prisma', 'service', 'controller', 'util', 'helper'],
    `${seed}:fw`,
  );
  return `${framework}:${baseName}:${stableChoice(operations, `${seed}:op`)}`;
}

export function buildSiblingSpanName(astCtx: AstGraphContext, seed: string): string {
  const dbOps = ['findMany', 'create', 'update', 'delete', 'count', 'upsert'];
  const svcOps = ['validate', 'process', 'transform', 'send', 'notify', 'log'];
  const queueOps = ['add', 'process', 'complete', 'fail', 'retry'];

  if (astCtx.symbols.size > 0 && stableNumber(`${seed}:prefer-symbol`, 2) === 0) {
    const symbols = [...astCtx.symbols.values()].sort((a, b) =>
      `${a.kind}:${a.name}:${a.filePath}`.localeCompare(`${b.kind}:${b.name}:${b.filePath}`),
    );
    const sym = stableChoice(symbols, `${seed}:symbol`);
    const basename = path.basename(sym.filePath, path.extname(sym.filePath));
    if (sym.kind === 'queue_processor' || sym.kind === 'cron_job') {
      return `bull:${basename}:process`;
    }
    if (sym.kind === 'api_route') {
      return `nestjs:${sym.name}`;
    }
    return `${sym.kind}:${sym.name}`;
  }

  const category = stableChoice(
    ['prisma', 'service', 'queue', 'cache', 'http'],
    `${seed}:category`,
  );
  const ops =
    category === 'prisma'
      ? dbOps
      : category === 'queue'
        ? queueOps
        : category === 'cache'
          ? ['get', 'set', 'del', 'exists']
          : svcOps;

  return `${category}:${inferServiceFromAvailableSymbols(astCtx, seed)}:${stableChoice(
    ops,
    `${seed}:op`,
  )}`;
}

export function buildStructuralFallbackSpanName(
  astCtx: AstGraphContext,
  structCtx: StructuralGraphContext,
  seed: string,
): string {
  const symbols = [...astCtx.symbols.values()].sort((a, b) =>
    `${a.kind}:${a.name}:${a.filePath}`.localeCompare(`${b.kind}:${b.name}:${b.filePath}`),
  );
  if (symbols.length > 0) {
    const symbol = stableChoice(symbols, `${seed}:symbol`);
    return `${symbol.kind}:${symbol.name}`;
  }
  const nodeFiles = Object.values(structCtx.nodeFiles).filter(Boolean).sort();
  if (nodeFiles.length > 0) {
    const filePath = stableChoice(nodeFiles, `${seed}:file`);
    return `file:${path.basename(filePath, path.extname(filePath))}`;
  }
  return 'runtime:unresolved';
}

export function inferServiceFromAvailableSymbols(astCtx: AstGraphContext, seed: string): string {
  const serviceCandidates = [...astCtx.symbols.values()]
    .map((symbol) => path.basename(path.dirname(symbol.filePath)))
    .filter(Boolean)
    .sort();
  return serviceCandidates.length > 0
    ? stableChoice(serviceCandidates, `${seed}:service`)
    : 'unknown';
}

export function inferServiceFromSpanName(spanName: string): string {
  const [prefix] = spanName.split(':');
  return prefix || 'unknown';
}

export function createManualSpanForTrace(
  traceId: string,
  parentSpanId: string | null,
  spanIndex: number,
  name: string,
  kind: OtelSpan['kind'],
  serviceName: string,
  astCtx: AstGraphContext,
  structCtx: StructuralGraphContext,
  opts: SpanGenOptions,
  seed: string,
): OtelSpan {
  const edge = findRelevantEdge(name, astCtx, structCtx);
  const startOffset = spanIndex * 15 + stableNumber(`${seed}:start`, 10);
  const durationMs = clampDuration(5 + stableNumber(`${seed}:duration`, 200), 1, 5000);
  const isError = stableNumber(`${seed}:status`, 20) === 0;
  const startTimeMs = startOffset * 100;
  const startTime = stableIso(startTimeMs);
  const endTime = stableIso(startTimeMs + durationMs);

  const attributes: Record<string, string | number | boolean> = {
    'service.name': serviceName,
    'http.status_code': isError ? 500 : 200,
  };
  const nameTokens = name.split(/\s+/).filter(Boolean);
  const observedMethod = nameTokens.find((token) => /^[A-Z]+$/.test(token));
  const observedPath = nameTokens.find((token) => token.startsWith('/'));
  if (observedMethod) {
    attributes['http.method'] = observedMethod;
  }
  if (observedPath) {
    attributes['http.route'] = observedPath;
  }

  if (edge) {
    attributes['pulse.structural.from'] = edge.from;
    attributes['pulse.structural.to'] = edge.to;
  }

  return {
    spanId: stableHex(`${traceId}:${parentSpanId || 'root'}:${spanIndex}:${name}`, 16),
    parentSpanId,
    traceId,
    name,
    kind,
    serviceName,
    attributes,
    startTime,
    endTime,
    durationMs,
    status: isError ? 'error' : 'ok',
    statusMessage: isError ? `Internal server error in ${name}` : null,
    events: isError
      ? [
          {
            name: 'exception',
            timestamp: endTime,
            attributes: {
              'exception.type': 'Error',
              'exception.message': 'Simulated error',
            },
          },
        ]
      : [],
  };
}

function findRelevantEdge(
  spanName: string,
  astCtx: AstGraphContext,
  structCtx: StructuralGraphContext,
): { from: string; to: string } | null {
  const lower = spanName.toLowerCase();

  for (const edge of astCtx.edges) {
    const fromSym = astCtx.symbols.get(edge.from);
    const toSym = astCtx.symbols.get(edge.to);
    if (fromSym && toSym) {
      const combined = `${fromSym.name}→${toSym.name}`.toLowerCase();
      const fromBase = path
        .basename(fromSym.filePath, path.extname(fromSym.filePath))
        .toLowerCase();
      const toBase = path.basename(toSym.filePath, path.extname(toSym.filePath)).toLowerCase();
      if (
        lower.includes(fromBase) ||
        lower.includes(toBase) ||
        lower.includes(fromSym.name.toLowerCase()) ||
        lower.includes(toSym.name.toLowerCase())
      ) {
        return { from: edge.from, to: edge.to };
      }
    }
  }

  for (const edge of structCtx.edges) {
    const fromBase = path
      .basename(
        structCtx.nodeFiles[edge.from] || '',
        path.extname(structCtx.nodeFiles[edge.from] || ''),
      )
      .toLowerCase();
    const toBase = path
      .basename(
        structCtx.nodeFiles[edge.to] || '',
        path.extname(structCtx.nodeFiles[edge.to] || ''),
      )
      .toLowerCase();
    if (lower.includes(fromBase) || lower.includes(toBase)) {
      return { from: edge.from, to: edge.to };
    }
  }

  return null;
}
