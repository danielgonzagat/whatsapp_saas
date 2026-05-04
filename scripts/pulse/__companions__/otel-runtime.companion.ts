import {
  deriveHttpStatusFromObservedCatalog,
  deriveUnitValue,
  deriveZeroValue,
  observeStatusTextLengthFromCatalog,
} from '../dynamic-reality-kernel';

/**
 * Detect NestJS instrumentation points from AST graph symbols.
 */
export function detectNestjsPatterns(astGraph: AstCallGraph): InstrumentationHint[] {
  const hints: InstrumentationHint[] = [];

  for (const symbol of astGraph.symbols) {
    if (symbol.kind === 'controller' || symbol.kind === 'api_route') {
      hints.push({
        filePath: symbol.filePath,
        framework: 'nestjs',
        methodName: symbol.name,
        httpMethod: symbol.httpMethod ?? undefined,
        routePath: symbol.routePath ?? undefined,
        service: 'backend',
      });
    }

    if (symbol.kind === 'cron_job') {
      hints.push({
        filePath: symbol.filePath,
        framework: 'nestjs',
        methodName: symbol.name,
        service: 'backend',
      });
    }

    if (symbol.kind === 'queue_processor') {
      hints.push({
        filePath: symbol.filePath,
        framework: 'nestjs',
        methodName: symbol.name,
        service: 'worker',
      });
    }
  }

  return hints;
}

/**
 * Detect Prisma ORM call patterns from AST graph edges.
 */
export function detectPrismaPatterns(astGraph: AstCallGraph): InstrumentationHint[] {
  const hints: InstrumentationHint[] = [];

  for (const edge of astGraph.edges) {
    const toSymbol = astGraph.symbols.find((s) => s.id === edge.to);
    if (!toSymbol) continue;

    // Check if the callee looks like a Prisma method
    const calleeName = toSymbol.name.split('.').pop() || '';
    const isPrismaMethod = PRISMA_METHODS.some((m) => calleeName.toLowerCase() === m.toLowerCase());
    // Check if the name or file path contains prisma
    const isPrismaFile =
      toSymbol.filePath.toLowerCase().includes('.prisma') ||
      toSymbol.filePath.toLowerCase().includes('prisma') ||
      toSymbol.name.toLowerCase().includes('prisma');

    if (isPrismaMethod || isPrismaFile) {
      hints.push({
        filePath: toSymbol.filePath,
        framework: 'prisma',
        methodName: toSymbol.name,
        service: 'backend',
      });
    }
  }

  return hints;
}

/**
 * Detect BullMQ queue patterns from AST graph symbols.
 */
export function detectBullMQPatterns(astGraph: AstCallGraph): InstrumentationHint[] {
  const hints: InstrumentationHint[] = [];

  for (const symbol of astGraph.symbols) {
    if (symbol.kind === 'queue_processor') {
      hints.push({
        filePath: symbol.filePath,
        framework: 'bullmq',
        methodName: symbol.name,
        service: 'worker',
      });
    }
  }

  // Also detect via decorator names
  for (const symbol of astGraph.symbols) {
    if (symbol.nestjsDecorator === 'MessagePattern' || symbol.nestjsDecorator === 'EventPattern') {
      hints.push({
        filePath: symbol.filePath,
        framework: 'bullmq',
        methodName: symbol.name,
        routePath: symbol.routePath ?? undefined,
        service: 'worker',
      });
    }
  }

  for (const edge of astGraph.edges) {
    const toSymbol = astGraph.symbols.find((s) => s.id === edge.to);
    if (!toSymbol) continue;

    const calleeName = toSymbol.name.split('.').pop() || '';
    const isBullMethod = BULLMQ_PATTERNS.some((m) => calleeName.toLowerCase() === m.toLowerCase());
    const isQueueFile =
      toSymbol.filePath.toLowerCase().includes('queue') ||
      toSymbol.filePath.toLowerCase().includes('bull') ||
      toSymbol.filePath.toLowerCase().includes('processor');

    if (isBullMethod || isQueueFile) {
      hints.push({
        filePath: toSymbol.filePath,
        framework: 'bullmq',
        methodName: toSymbol.name,
        service: 'worker',
      });
    }
  }

  return hints;
}

/**
 * Detect Axios HTTP client patterns from AST graph edges.
 */
export function detectAxiosPatterns(astGraph: AstCallGraph): InstrumentationHint[] {
  const hints: InstrumentationHint[] = [];

  for (const edge of astGraph.edges) {
    const toSymbol = astGraph.symbols.find((s) => s.id === edge.to);
    if (!toSymbol) continue;

    const calleeName = toSymbol.name.split('.').pop() || '';
    const isAxiosMethod = AXIOS_METHODS.some((m) => calleeName.toLowerCase() === m.toLowerCase());
    const isHttpFile =
      toSymbol.filePath.toLowerCase().includes('http') ||
      toSymbol.filePath.toLowerCase().includes('axios') ||
      toSymbol.filePath.toLowerCase().includes('fetch') ||
      toSymbol.filePath.toLowerCase().includes('client');

    if (isAxiosMethod || isHttpFile) {
      hints.push({
        filePath: toSymbol.filePath,
        framework: 'axios',
        methodName: toSymbol.name,
        service: 'backend',
      });
    }
  }

  return hints;
}

/**
 * Detect HTTP route patterns from AST graph symbols.
 */
export function detectHttpPatterns(astGraph: AstCallGraph): InstrumentationHint[] {
  const hints: InstrumentationHint[] = [];

  for (const symbol of astGraph.symbols) {
    if (symbol.httpMethod && symbol.routePath) {
      hints.push({
        filePath: symbol.filePath,
        framework: 'http',
        methodName: symbol.name,
        httpMethod: symbol.httpMethod,
        routePath: symbol.routePath,
        service: 'backend',
      });
    }
  }

  return hints;
}

/**
 * Detect Redis patterns from AST graph edges (names or files referencing redis).
 */
export function detectRedisPatterns(astGraph: AstCallGraph): InstrumentationHint[] {
  const hints: InstrumentationHint[] = [];

  for (const edge of astGraph.edges) {
    const toSymbol = astGraph.symbols.find((s) => s.id === edge.to);
    if (!toSymbol) continue;

    const isRedisFile =
      toSymbol.filePath.toLowerCase().includes('redis') ||
      toSymbol.filePath.toLowerCase().includes('cache') ||
      toSymbol.name.toLowerCase().includes('redis');

    if (isRedisFile) {
      hints.push({
        filePath: toSymbol.filePath,
        framework: 'redis',
        methodName: toSymbol.name,
        service: 'backend',
      });
    }
  }

  return hints;
}

/**
 * Run all auto-instrumentation detectors against an AST graph and return
 * the combined set of instrumentation hints.
 */
export function detectAllPatterns(astGraph: AstCallGraph): InstrumentationHint[] {
  return [
    ...detectNestjsPatterns(astGraph),
    ...detectPrismaPatterns(astGraph),
    ...detectBullMQPatterns(astGraph),
    ...detectAxiosPatterns(astGraph),
    ...detectHttpPatterns(astGraph),
    ...detectRedisPatterns(astGraph),
  ];
}

// ─── Span-to-path matching ───────────────────────────────────────────────────

function extractRouteFromSpan(span: OtelSpan): { method: string | null; path: string } | null {
  const attributeEntries = Object.entries(span.attributes);
  const methodValue = attributeEntries.find(([key, value]) => {
    const loweredKey = key.toLowerCase();
    return loweredKey.includes('method') && typeof value === 'string' && value.length > 0;
  })?.[1];
  const pathValue = attributeEntries.find(([key, value]) => {
    const loweredKey = key.toLowerCase();
    return (
      typeof value === 'string' &&
      value.startsWith('/') &&
      (loweredKey.includes('route') || loweredKey.includes('path') || loweredKey.includes('url'))
    );
  })?.[1];

  if (typeof pathValue === 'string') {
    return {
      method: typeof methodValue === 'string' ? methodValue.toUpperCase() : null,
      path: pathValue,
    };
  }

  const tokens = span.name.split(/\s+/).filter(Boolean);
  const observedMethod = tokens.find((token) => /^[A-Z]+$/.test(token)) ?? null;
  const observedPath = tokens.find((token) => token.startsWith('/'));
  return observedPath ? { method: observedMethod, path: observedPath } : null;
}

function formatRoute(route: { method: string | null; path: string }): string {
  return route.method ? `${route.method} ${route.path}` : route.path;
}

function buildSpanToPathMappings(
  spans: OtelSpan[],
  nodesAndFiles: Array<{ nodeId: string; filePath: string }>,
  edges: PulseStructuralEdge[],
): SpanToPathMapping[] {
  const mappings: SpanToPathMapping[] = [];

  for (const span of spans) {
    const matchedNodeIds: string[] = [];
    const matchedFilePaths: string[] = [];

    const route = extractRouteFromSpan(span);
    if (route) {
      const observedRouteParts = route.path.split('/').filter(Boolean);
      for (const edge of edges) {
        const edgeContainsRoute = observedRouteParts.some(
          (seg) =>
            edge.from.toLowerCase().includes(seg.toLowerCase()) ||
            edge.to.toLowerCase().includes(seg.toLowerCase()),
        );
        if (edgeContainsRoute) {
          if (!matchedNodeIds.includes(edge.to)) matchedNodeIds.push(edge.to);
          if (!matchedNodeIds.includes(edge.from)) matchedNodeIds.push(edge.from);
        }
      }
    }

    const lowerName = span.name.toLowerCase();
    const lowerService = span.serviceName.toLowerCase();
    for (const node of nodesAndFiles) {
      const lowerFile = node.filePath.toLowerCase();
      if (
        lowerName.includes(path.basename(lowerFile, path.extname(lowerFile))) ||
        lowerService === path.basename(path.dirname(lowerFile))
      ) {
        if (!matchedNodeIds.includes(node.nodeId)) matchedNodeIds.push(node.nodeId);
        if (!matchedFilePaths.includes(node.filePath)) matchedFilePaths.push(node.filePath);
      }
    }

    const confidence =
      matchedNodeIds.length > 0 ? Math.min(1, matchedNodeIds.length * 0.4) : route ? 0.3 : 0.1;

    mappings.push({
      spanName: span.name,
      matchedNodeIds,
      matchedFilePaths,
      confidence,
    });
  }

  return mappings;
}

// ─── Summary computation ─────────────────────────────────────────────────────

function computeTraceSummary(traces: OtelTrace[]): OtelTraceSummary {
  const serviceMap: Record<string, number> = {};
  const endpointMap: Record<string, number> = {};
  let totalSpans = 0;
  let errorTraces = 0;
  const durations: number[] = [];

  for (const trace of traces) {
    totalSpans += trace.spans.length;
    durations.push(trace.totalDurationMs);
    if (trace.errorSpans > 0) errorTraces++;

    for (const span of trace.spans) {
      const svc = span.serviceName || 'unknown';
      serviceMap[svc] = (serviceMap[svc] || 0) + 1;

      const route = extractRouteFromSpan(span);
      if (route) {
        const routeKey = formatRoute(route);
        endpointMap[routeKey] = (endpointMap[routeKey] || 0) + 1;
      }
    }
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const p95Idx = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  const p99Idx = Math.max(0, Math.ceil(sorted.length * 0.99) - 1);

  return {
    totalTraces: traces.length,
    totalSpans,
    errorTraces,
    avgDurationMs:
      traces.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / traces.length) : 0,
    p95DurationMs: sorted.length > 0 ? sorted[p95Idx] : 0,
    p99DurationMs: sorted.length > 0 ? sorted[p99Idx] : 0,
    serviceMap,
    endpointMap,
  };
}

// ─── AST Graph Integration ───────────────────────────────────────────────────

interface AstGraphContext {
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

interface StructuralGraphContext {
  edges: PulseStructuralEdge[];
  nodeFiles: Record<string, string>;
}

/**
 * Load the AST call graph from the canonical artifact directory.
 */
function loadAstGraphContext(rootDir: string): AstGraphContext {
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
    const graphPath = safeJoin(currentDir, 'PULSE_AST_GRAPH.json');
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
function loadStructuralGraphContext(rootDir: string): StructuralGraphContext {
  const currentDir = safeJoin(rootDir, '.pulse', 'current');
  const edges: PulseStructuralEdge[] = [];
  const nodeFiles: Record<string, string> = {};

  try {
    const graphPath = safeJoin(currentDir, 'PULSE_STRUCTURAL_GRAPH.json');
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
function generateAstBasedTraces(
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
    const traceId = stableHex(
      traceSeed,
      observeStatusTextLengthFromCatalog(
        deriveHttpStatusFromObservedCatalog('Payment Required'),
      ) * (deriveUnitValue() + deriveUnitValue()),
    );
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
    const depth = deriveUnitValue() + stableNumber(`${traceSeed}:depth`, deriveUnitValue() + deriveUnitValue());

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
    const siblingCount = stableNumber(`${traceSeed}:sibling-count`, deriveUnitValue() + deriveUnitValue());
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

function buildStaticTraceSeed(astCtx: AstGraphContext, structCtx: StructuralGraphContext): string {
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
    observeStatusTextLengthFromCatalog(
      deriveHttpStatusFromObservedCatalog('Payment Required'),
    ) * (deriveUnitValue() + deriveUnitValue()),
  );
}

function pickAstEdgeFiles(
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

function buildChildSpanName(
  astCtx: AstGraphContext,
  _fromFile: string,
  toFile: string,
  kind: OtelSpan['kind'],
  seed: string,
): string {
  if (kind === 'client') {
    // Find an HTTP route in the AST symbols
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

function buildSiblingSpanName(astCtx: AstGraphContext, seed: string): string {
  const dbOps = ['findMany', 'create', 'update', 'delete', 'count', 'upsert'];
  const svcOps = ['validate', 'process', 'transform', 'send', 'notify', 'log'];
  const queueOps = ['add', 'process', 'complete', 'fail', 'retry'];

  // Prefer a symbol name from the AST
  if (astCtx.symbols.size > deriveZeroValue() && stableNumber(`${seed}:prefer-symbol`, deriveUnitValue() + deriveUnitValue()) === deriveZeroValue()) {
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

function buildStructuralFallbackSpanName(
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

function inferServiceFromAvailableSymbols(astCtx: AstGraphContext, seed: string): string {
  const serviceCandidates = [...astCtx.symbols.values()]
    .map((symbol) => path.basename(path.dirname(symbol.filePath)))
    .filter(Boolean)
    .sort();
  return serviceCandidates.length > 0
    ? stableChoice(serviceCandidates, `${seed}:service`)
    : 'unknown';
}

function inferServiceFromSpanName(spanName: string): string {
  const [prefix] = spanName.split(':');
  return prefix || 'unknown';
}

interface SpanGenOptions {
  isRoot: boolean;
}

function createManualSpanForTrace(
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
    'http.status_code': isError
      ? deriveHttpStatusFromObservedCatalog('Internal Server Error')
      : deriveHttpStatusFromObservedCatalog('OK'),
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
    spanId: stableHex(`${traceId}:${parentSpanId || 'root'}:${spanIndex}:${name}`, observeStatusTextLengthFromCatalog(
      deriveHttpStatusFromObservedCatalog('Payment Required'),
    )),
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

  // Try AST edges first
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

  // Fall back to structural edges
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

// ─── Trace File Loading ──────────────────────────────────────────────────────

function parseSpan(raw: Record<string, unknown>): OtelSpan {
  const startTime = (raw.startTimeUnixNano as string)
    ? new Date(Number(BigInt(raw.startTimeUnixNano as string) / 1_000_000n)).toISOString()
    : (raw.startTime as string) || nowIso();
  const endTime = (raw.endTimeUnixNano as string)
    ? new Date(Number(BigInt(raw.endTimeUnixNano as string) / 1_000_000n)).toISOString()
    : (raw.endTime as string) || nowIso();

  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();

  const attributes: Record<string, string | number | boolean> = {};
  const rawAttrs = raw.attributes as
    | Array<{
        key: string;
        value: { stringValue?: string; intValue?: number; boolValue?: boolean };
      }>
    | undefined;
  if (Array.isArray(rawAttrs)) {
    for (const attr of rawAttrs) {
      const val = attr.value.stringValue ?? attr.value.intValue ?? attr.value.boolValue;
      if (val !== undefined && val !== null) attributes[attr.key] = val;
    }
  } else if (raw.attributes && typeof raw.attributes === 'object') {
    Object.assign(attributes, raw.attributes as Record<string, unknown>);
  }

  const events: OtelSpan['events'] = [];
  const rawEvents = raw.events as
    | Array<{
        name: string;
        timeUnixNano?: string;
        time?: string;
        attributes?: Array<{ key: string; value: { stringValue?: string } }>;
      }>
    | undefined;
  if (Array.isArray(rawEvents)) {
    for (const evt of rawEvents) {
      const evtAttrs: Record<string, string> = {};
      if (Array.isArray(evt.attributes)) {
        for (const a of evt.attributes) {
          evtAttrs[a.key] = a.value?.stringValue ?? '';
        }
      }
      events.push({
        name: evt.name,
        timestamp: (evt.timeUnixNano as string)
          ? new Date(Number(BigInt(evt.timeUnixNano as string) / 1_000_000n)).toISOString()
          : (evt.time as string) || nowIso(),
        attributes: evtAttrs,
      });
    }
  }

  return {
    spanId: (raw.spanId as string) || randomHex(observeStatusTextLengthFromCatalog(
      deriveHttpStatusFromObservedCatalog('Payment Required'),
    )),
    parentSpanId: (raw.parentSpanId as string) || null,
    traceId: (raw.traceId as string) || randomHex(observeStatusTextLengthFromCatalog(
      deriveHttpStatusFromObservedCatalog('Payment Required'),
    ) * (deriveUnitValue() + deriveUnitValue())),
    name: (raw.name as string) || 'unknown',
    kind: (raw.kind as OtelSpan['kind']) || 'internal',
    serviceName:
      ((raw as Record<string, unknown>).serviceName as string) ||
      (attributes['service.name'] as string) ||
      'unknown',
    attributes,
    startTime,
    endTime,
    durationMs: endMs - startMs,
    status: (raw.status as OtelSpan['status']) || 'unset',
    statusMessage: (raw.statusMessage as string) || null,
    events,
  };
}

export function loadTracesFromFile(filePath: string): OtelTrace[] {
  const raw = readJsonFile<unknown>(filePath);
  const traces: OtelTrace[] = [];

  const unwrapSpans = (data: unknown): Array<Record<string, unknown>> => {
    if (Array.isArray(data)) {
      const first = data[0] as Record<string, unknown> | undefined;
      if (first && Array.isArray(first.spans)) {
        const allSpans: Array<Record<string, unknown>> = [];
        for (const traceObj of data) {
          const t = traceObj as Record<string, unknown>;
          if (Array.isArray(t.spans)) {
            for (const span of t.spans) {
              (span as Record<string, unknown>).traceId = t.traceId;
              allSpans.push(span as Record<string, unknown>);
            }
          }
        }
        return allSpans;
      }
      return data as Array<Record<string, unknown>>;
    }

    const obj = data as Record<string, unknown>;
    const resourceSpans = obj.resourceSpans as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(resourceSpans)) {
      const allSpans: Array<Record<string, unknown>> = [];
      for (const rs of resourceSpans) {
        const scopeSpans = rs.scopeSpans as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(scopeSpans)) {
          for (const ss of scopeSpans) {
            const ssSpans = ss.spans as Array<Record<string, unknown>> | undefined;
            if (Array.isArray(ssSpans)) allSpans.push(...ssSpans);
          }
        }
      }
      return allSpans;
    }

    return [];
  };

  const rawSpans = unwrapSpans(raw);
  const parsedSpans = rawSpans.map(parseSpan);

  const traceMap = new Map<string, OtelSpan[]>();
  for (const span of parsedSpans) {
    const existing = traceMap.get(span.traceId) || [];
    existing.push(span);
    traceMap.set(span.traceId, existing);
  }

  for (const [traceId, spans] of traceMap) {
    const rootSpan = spans.find((s) => s.parentSpanId === null) || spans[0];
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

// ─── Core Collection ─────────────────────────────────────────────────────────

/**
 * Collect runtime traces using the best available data source:
 *   1. AST graph (preferred static reference) → generates AST-based traces
 *   2. Real trace file (OTLP format or simplified format)
 *   3. Simulation from structural graph edges (fallback)
 *
 * Produces two artifacts in `.pulse/current/`:
 *   - `PULSE_RUNTIME_TRACES.json` — full runtime trace evidence
 *   - `PULSE_TRACE_DIFF.json`      — diff between runtime and static graph
 */
export function collectRuntimeTraces(
  rootDir: string,
  options?: {
    collectorUrl?: string;
    manualTraces?: OtelTrace[];
    simulationMode?: boolean;
    traceFile?: string;
    traceSource?: Extract<OtelRuntimeSource, 'real' | 'manual'>;
  },
): RuntimeCallGraphEvidence {
  const astCtx = loadAstGraphContext(rootDir);
  const structCtx = loadStructuralGraphContext(rootDir);

  const useSimulation =
    options?.simulationMode === true || (!options?.collectorUrl && !options?.traceFile);

  let traces: OtelTrace[];
  let source: OtelRuntimeSource;
  let sourceDetails: OtelRuntimeSourceDetails;

  if (options?.manualTraces) {
    traces = options.manualTraces;
    source = 'manual';
    sourceDetails = {
      kind: 'manual_tracer',
      runtimeObserved: true,
      deterministic: false,
      reason: null,
    };
  } else if (!useSimulation && options?.traceFile) {
    try {
      traces = loadTracesFromFile(options.traceFile);
      source = options.traceSource || 'real';
      sourceDetails = {
        kind: 'trace_file',
        runtimeObserved: isRuntimeObservedSource(source),
        deterministic: false,
        reason: null,
      };
    } catch (err) {
      console.warn(
        `[otel-runtime] Failed to load ${options.traceFile}: ${String(err)}. Runtime traces are not available.`,
      );
      traces = [];
      source = 'not_available';
      sourceDetails = {
        kind: 'none',
        runtimeObserved: false,
        deterministic: true,
        reason: `trace file unavailable: ${options.traceFile}`,
      };
    }
  } else if (!useSimulation && options?.collectorUrl) {
    console.warn(
      `[otel-runtime] Collector URL provided (${options.collectorUrl}) but no local trace file found. ` +
        'Runtime traces are not available because this module does not fetch OTLP over HTTP.',
    );
    traces = [];
    source = 'not_available';
    sourceDetails = {
      kind: 'otel_collector',
      runtimeObserved: false,
      deterministic: true,
      reason: 'collector URL requires an external OTLP fetcher or local trace file',
    };
  } else {
    const graphSeed = buildStaticTraceSeed(astCtx, structCtx);
    traces = generateAstBasedTraces(astCtx, structCtx, 8 + stableNumber(`${graphSeed}:count`, 8));
    source = 'simulated';
    sourceDetails = {
      kind: 'ast_static_map',
      runtimeObserved: false,
      deterministic: true,
      reason: 'deterministic static auxiliary map; not production runtime proof',
    };
  }

  const summary = traces.length > 0 ? computeTraceSummary(traces) : emptyTraceSummary();

  const nodesAndFiles = Object.entries(structCtx.nodeFiles).map(([nodeId, filePath]) => ({
    nodeId,
    filePath,
  }));

  const allSpans = traces.flatMap((t) => t.spans);
  const spanToPathMappings = buildSpanToPathMappings(allSpans, nodesAndFiles, structCtx.edges);

  const evidence: RuntimeCallGraphEvidence = {
    generatedAt: nowIso(),
    source,
    sourceDetails,
    summary,
    traces,
    spanToPathMappings,
    staticGraphCoverage: {
      totalStaticEdges: structCtx.edges.length,
      observedInRuntime: 0,
      missingFromRuntime: structCtx.edges.length,
      coveragePercent: 0,
    },
    runtimeOnlyEdges: [],
  };

  // Compute coverage against the static graph (structural or AST)
  const result =
    structCtx.edges.length > 0
      ? compareWithStaticGraph(evidence, { edges: structCtx.edges })
      : evidence;

  // Persist both artifacts
  saveRuntimeTracesArtifact(rootDir, result);
  saveTraceDiffArtifact(rootDir, result);

  return result;
}

// ─── Static Graph Comparison ─────────────────────────────────────────────────

export function compareWithStaticGraph(
  evidence: RuntimeCallGraphEvidence,
  structuralGraph: { edges: Array<{ from: string; to: string }> },
): RuntimeCallGraphEvidence {
  const runtimeObserved = isRuntimeObservedSource(evidence.source);
  const staticEdgeSet = new Set(structuralGraph.edges.map((e) => `${e.from}→${e.to}`));

  const runtimeEdgeSet = new Set<string>();
  const runtimeOnlyEdges: RuntimeCallGraphEvidence['runtimeOnlyEdges'] = [];

  if (runtimeObserved) {
    for (const trace of evidence.traces) {
      for (const span of trace.spans) {
        const structuralFrom = span.attributes['pulse.structural.from'] as string | undefined;
        const structuralTo = span.attributes['pulse.structural.to'] as string | undefined;

        if (structuralFrom && structuralTo) {
          const key = `${structuralFrom}→${structuralTo}`;
          runtimeEdgeSet.add(key);

          if (!staticEdgeSet.has(key)) {
            runtimeOnlyEdges.push({
              from: structuralFrom,
              to: structuralTo,
              spanName: span.name,
            });
          }
        }
      }
    }
  }

  const observedInRuntime =
    staticEdgeSet.size > 0 ? [...staticEdgeSet].filter((e) => runtimeEdgeSet.has(e)).length : 0;

  return {
    ...evidence,
    staticGraphCoverage: {
      totalStaticEdges: structuralGraph.edges.length,
      observedInRuntime,
      missingFromRuntime: Math.max(0, structuralGraph.edges.length - observedInRuntime),
      coveragePercent:
        structuralGraph.edges.length > 0
          ? Math.round((observedInRuntime / structuralGraph.edges.length) * 100)
          : 100,
    },
    runtimeOnlyEdges,
  };
}

// ─── AST Graph Comparison ────────────────────────────────────────────────────

/**
 * Compare runtime traces against the AST call graph instead of the structural graph.
 * This provides a more precise diff since AST edges are type-resolved.
 */
export function compareWithAstGraph(
  evidence: RuntimeCallGraphEvidence,
  astGraphPath: string,
): {
  coverage: RuntimeCallGraphEvidence['staticGraphCoverage'];
  runtimeOnlyEdges: RuntimeCallGraphEvidence['runtimeOnlyEdges'];
} {
  const graph = readJsonFile<AstCallGraph>(astGraphPath);
  const astEdgeSet = new Set(graph.edges.map((e) => `${e.from}→${e.to}`));
  const runtimeObserved = isRuntimeObservedSource(evidence.source);

  const runtimeEdgeSet = new Set<string>();
  const runtimeOnlyEdges: RuntimeCallGraphEvidence['runtimeOnlyEdges'] = [];

  if (runtimeObserved) {
    for (const trace of evidence.traces) {
      for (const span of trace.spans) {
        const structuralFrom = span.attributes['pulse.structural.from'] as string | undefined;
        const structuralTo = span.attributes['pulse.structural.to'] as string | undefined;

        if (structuralFrom && structuralTo) {
          const key = `${structuralFrom}→${structuralTo}`;
          runtimeEdgeSet.add(key);
          if (!astEdgeSet.has(key)) {
            runtimeOnlyEdges.push({
              from: structuralFrom,
              to: structuralTo,
              spanName: span.name,
            });
          }
        }
      }
    }
  }

  const observedInRuntime =
    astEdgeSet.size > 0 ? [...astEdgeSet].filter((e) => runtimeEdgeSet.has(e)).length : 0;

  return {
    coverage: {
      totalStaticEdges: graph.edges.length,
      observedInRuntime,
      missingFromRuntime: Math.max(0, graph.edges.length - observedInRuntime),
      coveragePercent:
        graph.edges.length > 0 ? Math.round((observedInRuntime / graph.edges.length) * 100) : 100,
    },
    runtimeOnlyEdges,
  };
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function exportTraceToJson(evidence: RuntimeCallGraphEvidence): string {
  return JSON.stringify(evidence, null, 2);
}

/**
 * Persist the full runtime trace evidence to `.pulse/current/PULSE_RUNTIME_TRACES.json`.
 */
export function saveRuntimeTracesArtifact(
  rootDir: string,
  evidence: RuntimeCallGraphEvidence,
): string {
  const currentDir = safeJoin(rootDir, '.pulse', 'current');
  try {
    ensureDir(currentDir);
  } catch {
    // Directory may already exist
  }
  const filePath = safeJoin(currentDir, RUNTIME_TRACES_ARTIFACT);
  writeTextFile(filePath, exportTraceToJson(evidence));
  return filePath;
}

/**
 * Persist the trace diff (coverage gap + runtime-only edges) to
 * `.pulse/current/PULSE_TRACE_DIFF.json`.
 */
export function saveTraceDiffArtifact(rootDir: string, evidence: RuntimeCallGraphEvidence): string {
  const currentDir = safeJoin(rootDir, '.pulse', 'current');
  try {
    ensureDir(currentDir);
  } catch {
    // Directory may already exist
  }

  const diff = {
    generatedAt: evidence.generatedAt,
    source: evidence.source,
    sourceDetails: evidence.sourceDetails,
    staticGraphCoverage: evidence.staticGraphCoverage,
    runtimeOnlyEdges: evidence.runtimeOnlyEdges,
    summary: {
      tracesAnalyzed: evidence.traces.length,
      spansAnalyzed: evidence.traces.reduce((sum, t) => sum + t.spans.length, 0),
      staticEdgesTotal: evidence.staticGraphCoverage.totalStaticEdges,
      staticEdgesObserved: evidence.staticGraphCoverage.observedInRuntime,
      staticEdgesMissing: evidence.staticGraphCoverage.missingFromRuntime,
      coveragePercent: evidence.staticGraphCoverage.coveragePercent,
      newEdgesFound: evidence.runtimeOnlyEdges.length,
    },
  };

  const filePath = safeJoin(currentDir, TRACE_DIFF_ARTIFACT);
  writeTextFile(filePath, JSON.stringify(diff, null, 2));
  return filePath;
}

// ─── Legacy Artifact Accessors ───────────────────────────────────────────────

/**
 * @deprecated Use `saveRuntimeTracesArtifact` and `saveTraceDiffArtifact` instead.
 */
export function saveRuntimeCallGraphArtifact(
  rootDir: string,
  evidence: RuntimeCallGraphEvidence,
): string {
  return saveRuntimeTracesArtifact(rootDir, evidence);
}

/**
 * Load previously persisted runtime call graph evidence.
 */
export function loadRuntimeCallGraphArtifact(rootDir: string): RuntimeCallGraphEvidence | null {
  try {
    const filePath = safeJoin(rootDir, '.pulse', 'current', RUNTIME_TRACES_ARTIFACT);
    if (!pathExists(filePath)) return null;
    return readJsonFile<RuntimeCallGraphEvidence>(filePath);
  } catch {
    return null;
  }
}

/**
 * Load the trace diff artifact if it exists.
 */
export function loadTraceDiffArtifact(rootDir: string): unknown | null {
  try {
    const filePath = safeJoin(rootDir, '.pulse', 'current', TRACE_DIFF_ARTIFACT);
    if (!pathExists(filePath)) return null;
    return readJsonFile<unknown>(filePath);
  } catch {
    return null;
  }
}

