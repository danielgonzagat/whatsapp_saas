import type { AstCallGraph } from '../../types.ast-graph';
import { AXIOS_METHODS, BULLMQ_PATTERNS, PRISMA_METHODS } from './constants';

/** Hint about an instrumentation point discovered in the codebase. */
export interface InstrumentationHint {
  /** File path where the pattern was found. */
  filePath: string;
  /** Framework or library name. */
  framework: 'nestjs' | 'prisma' | 'bullmq' | 'axios' | 'http' | 'redis';
  /** Method or function name. */
  methodName: string;
  /** HTTP method if applicable. */
  httpMethod?: string;
  /** Route path if applicable. */
  routePath?: string;
  /** Service name. */
  service: string;
}

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

    const calleeName = toSymbol.name.split('.').pop() || '';
    const isPrismaMethod = PRISMA_METHODS.some((m) => calleeName.toLowerCase() === m.toLowerCase());
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
