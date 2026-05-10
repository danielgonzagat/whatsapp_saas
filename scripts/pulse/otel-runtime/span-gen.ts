// PULSE — Span Generation Helpers for Trace Generation

import * as path from 'path';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../dynamic-reality-kernel/catalog-arithmetic';
import type { OtelSpan } from '../types.otel-runtime';
import type { AstGraphContext, StructuralGraphContext } from './generation';
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
} from './constants';

export function buildChildSpanName(
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

export function buildSiblingSpanName(astCtx: AstGraphContext, seed: string): string {
  const dbOps = ['findMany', 'create', 'update', 'delete', 'count', 'upsert'];
  const svcOps = ['validate', 'process', 'transform', 'send', 'notify', 'log'];
  const queueOps = ['add', 'process', 'complete', 'fail', 'retry'];

  // Prefer a symbol name from the AST
  if (
    astCtx.symbols.size > 0 &&
    stableNumber(`${seed}:prefer-symbol`, deriveUnitValue() + deriveUnitValue()) ===
      deriveZeroValue()
  ) {
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

export interface SpanGenOptions {
  isRoot: boolean;
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
  _opts: SpanGenOptions,
  seed: string,
): OtelSpan {
  const edge = findRelevantEdge(name, astCtx, structCtx);
  const startOffset =
    spanIndex * HTTP_STATUS_TEXT_LEN_OK + stableNumber(`${seed}:start`, HTTP_STATUS_BAD_REQUEST);
  const durationMs = clampDuration(
    deriveUnitValue() + HTTP_STATUS_TEXT_LEN_OK + stableNumber(`${seed}:duration`, HTTP_STATUS_OK),
    deriveUnitValue(),
    HTTP_STATUS_INTERNAL_SERVER_ERROR,
  );
  const isError = stableNumber(`${seed}:status`, HTTP_STATUS_OK) === deriveZeroValue();
  const startTimeMs = startOffset * 100;
  const startTime = stableIso(startTimeMs);
  const endTime = stableIso(startTimeMs + durationMs);

  const internalErrorStatus = HTTP_STATUS_INTERNAL_SERVER_ERROR;
  const okStatus = HTTP_STATUS_OK;

  const attributes: Record<string, string | number | boolean> = {
    'service.name': serviceName,
    'http.status_code': isError ? internalErrorStatus : okStatus,
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
    status: isError ? OTEL_STATUS_ERROR : OTEL_STATUS_OK,
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

export function findRelevantEdge(
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
