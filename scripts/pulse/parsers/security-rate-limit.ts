/**
 * PULSE Parser 57: Security — Rate Limiting
 * Layer 5: Security Testing
 * Mode: static evidence + optional DEEP runtime probes.
 *
 * The parser derives route candidates, throttle limits, and diagnostics from
 * observed NestJS source evidence. Static syntax is only a sensor; final break
 * identity is synthesized from evidence predicates.
 */

import * as path from 'path';
import * as ts from 'typescript';
import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';
import type { Break, PulseConfig } from '../types';
import { getBackendUrl, isDeepMode, makeTestJwt } from './runtime-utils';
import { readFileSafe, walkFiles } from './utils';

interface RouteThrottleEvidence {
  method: string;
  path: string;
  sourceFile: string;
  line: number;
  className: string;
  handlerName: string;
  hasThrottleEvidence: boolean;
  hasGuardEvidence: boolean;
  hasBodyEvidence: boolean;
  hasPublicEvidence: boolean;
  observedLimit: number | null;
  riskWeight: number;
}

interface RateLimitProbePlan {
  routes: RouteThrottleEvidence[];
  globalLimit: number | null;
  hasGlobalThrottleEvidence: boolean;
}

interface DecoratorEvidence {
  name: string;
  argumentText: string;
}

function synthesizedSecurityRateLimitBreak(
  signal: PulseSignalEvidence,
  severity: Break['severity'],
  surface: string,
  runtimeImpact?: number,
): Break {
  const signalGraph = buildPulseSignalGraph([signal]);
  const predicateGraph = buildPredicateGraph(signalGraph);
  const diagnostic = synthesizeDiagnostic(
    signalGraph,
    predicateGraph,
    calculateDynamicRisk({ predicateGraph, runtimeImpact }),
  );

  return {
    type: diagnostic.id,
    severity,
    file: signal.location.file,
    line: signal.location.line,
    description: diagnostic.title,
    detail: `${diagnostic.summary}; evidence=${diagnostic.evidenceIds.join(',')}; predicates=${diagnostic.predicateKinds.join(',')}; ${signal.detail ?? ''}`,
    source: `${signal.source};detector=${signal.detector};truthMode=${signal.truthMode}`,
    surface,
  };
}

function appendBreak(breaks: Break[], entry: Break): void {
  breaks.push(entry);
}

function decoratorName(decorator: ts.Decorator): string | null {
  const expression = decorator.expression;
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isCallExpression(expression)) {
    if (ts.isIdentifier(expression.expression)) {
      return expression.expression.text;
    }
    if (ts.isPropertyAccessExpression(expression.expression)) {
      return expression.expression.name.text;
    }
  }
  return null;
}

function decoratorArgumentText(decorator: ts.Decorator): string {
  const expression = decorator.expression;
  if (!ts.isCallExpression(expression)) {
    return '';
  }
  const [first] = expression.arguments;
  return first ? first.getText() : '';
}

function decoratorsFor(node: ts.Node): DecoratorEvidence[] {
  return (ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : []).flatMap((decorator) => {
    const name = decoratorName(decorator);
    return name ? [{ name, argumentText: decoratorArgumentText(decorator) }] : [];
  });
}

function literalText(expression: ts.Expression | undefined): string | null {
  if (!expression) {
    return '';
  }
  if (ts.isStringLiteralLike(expression)) {
    return expression.text;
  }
  return null;
}

function firstCallArgumentText(decorator: DecoratorEvidence): string | null {
  const source = ts.createSourceFile(
    'decorator-argument.ts',
    `const value = ${decorator.argumentText || 'undefined'};`,
    ts.ScriptTarget.Latest,
    true,
  );
  let result: string | null = null;

  const visit = (node: ts.Node): void => {
    if (result !== null) {
      return;
    }
    if (ts.isVariableDeclaration(node)) {
      const initializer = node.initializer;
      result = literalText(initializer);
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return result;
}

function joinRouteSegments(first: string, second: string): string {
  const segments = [...first.split('/'), ...second.split('/')]
    .map((segment) => segment.trim())
    .filter(Boolean);
  return `/${segments.join('/')}`;
}

function methodFromDecorator(name: string): string | null {
  const normalized = name.toUpperCase();
  if (normalized === 'GET') return normalized;
  if (normalized === 'POST') return normalized;
  if (normalized === 'PUT') return normalized;
  if (normalized === 'PATCH') return normalized;
  if (normalized === 'DELETE') return normalized;
  if (normalized === 'HEAD') return normalized;
  if (normalized === 'OPTIONS') return normalized;
  if (normalized === 'ALL') return normalized;
  return null;
}

function numericInitializerValue(node: ts.Expression): number | null {
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }
  if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) {
    const value = Number(node.operand.text);
    return node.operator === ts.SyntaxKind.MinusToken ? -value : value;
  }
  return null;
}

function throttleLimitFromObject(node: ts.Node): number | null {
  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) {
      const nested = throttleLimitFromObject(element);
      if (nested !== null) {
        return nested;
      }
    }
    return null;
  }

  if (!ts.isObjectLiteralExpression(node)) {
    return null;
  }

  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const key = property.name.getText();
    if (key === 'limit') {
      return numericInitializerValue(property.initializer);
    }
    const nested = throttleLimitFromObject(property.initializer);
    if (nested !== null) {
      return nested;
    }
  }

  return null;
}

function throttleLimitFromDecorator(decorator: DecoratorEvidence): number | null {
  const source = ts.createSourceFile(
    'throttle-argument.ts',
    `const value = ${decorator.argumentText || 'undefined'};`,
    ts.ScriptTarget.Latest,
    true,
  );
  let result: number | null = null;

  const visit = (node: ts.Node): void => {
    if (result !== null) {
      return;
    }
    const limit = throttleLimitFromObject(node);
    if (limit !== null) {
      result = limit;
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return result;
}

function throttleLimitFromDecorators(decorators: DecoratorEvidence[]): number | null {
  for (const decorator of decorators) {
    if (decorator.name !== 'Throttle') {
      continue;
    }
    const limit = throttleLimitFromDecorator(decorator);
    if (limit !== null) {
      return limit;
    }
  }
  return null;
}

function hasDecorator(decorators: readonly DecoratorEvidence[], name: string): boolean {
  return decorators.some((decorator) => decorator.name === name);
}

function hasGuardEvidence(decorators: readonly DecoratorEvidence[]): boolean {
  return decorators.some((decorator) => decorator.name === 'UseGuards');
}

function hasBodyParameterEvidence(method: ts.MethodDeclaration): boolean {
  return method.parameters.some((parameter) => hasDecorator(decoratorsFor(parameter), 'Body'));
}

function riskWeightFor(
  method: string,
  routeText: string,
  methodNode: ts.MethodDeclaration,
): number {
  let weight = method === 'GET' || method === 'HEAD' ? 1 : 2;
  if (hasBodyParameterEvidence(methodNode)) {
    weight += 1;
  }
  if (routeText.includes(':')) {
    weight += 1;
  }
  return weight;
}

function routeLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function collectRoutesFromSource(
  config: PulseConfig,
  filePath: string,
  content: string,
): RouteThrottleEvidence[] {
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const routes: RouteThrottleEvidence[] = [];

  const visit = (node: ts.Node): void => {
    if (!ts.isClassDeclaration(node) || !node.name) {
      ts.forEachChild(node, visit);
      return;
    }

    const classDecorators = decoratorsFor(node);
    const controller = classDecorators.find((decorator) => decorator.name === 'Controller');
    if (!controller) {
      ts.forEachChild(node, visit);
      return;
    }

    const controllerPath = firstCallArgumentText(controller) ?? '';
    const classThrottleLimit = throttleLimitFromDecorators(classDecorators);
    const classHasThrottle = classThrottleLimit !== null;
    const classHasGuard = hasGuardEvidence(classDecorators);
    const classHasPublic = hasDecorator(classDecorators, 'Public');

    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member) || !member.name) {
        continue;
      }
      const methodDecorators = decoratorsFor(member);
      const routeDecorator = methodDecorators
        .map((decorator) => ({ decorator, method: methodFromDecorator(decorator.name) }))
        .find((entry) => entry.method !== null);
      if (!routeDecorator || !routeDecorator.method) {
        continue;
      }

      const methodPath = firstCallArgumentText(routeDecorator.decorator) ?? '';
      const methodThrottleLimit = throttleLimitFromDecorators(methodDecorators);
      const observedLimit = methodThrottleLimit ?? classThrottleLimit;
      const routePath = joinRouteSegments(controllerPath, methodPath);
      const hasPublicEvidence = classHasPublic || hasDecorator(methodDecorators, 'Public');

      routes.push({
        method: routeDecorator.method,
        path: routePath,
        sourceFile: path.relative(config.rootDir, filePath),
        line: routeLine(sourceFile, member),
        className: node.name.text,
        handlerName: member.name.getText(sourceFile),
        hasThrottleEvidence: classHasThrottle || methodThrottleLimit !== null,
        hasGuardEvidence: classHasGuard || hasGuardEvidence(methodDecorators),
        hasBodyEvidence: hasBodyParameterEvidence(member),
        hasPublicEvidence,
        observedLimit,
        riskWeight: riskWeightFor(routeDecorator.method, routePath, member),
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return routes;
}

function collectGlobalThrottleEvidence(config: PulseConfig): {
  hasGlobalThrottleEvidence: boolean;
  globalLimit: number | null;
} {
  const backendFiles = walkFiles(config.backendDir, ['.ts']);
  for (const file of backendFiles) {
    const content = readFileSafe(file);
    if (!content.includes('ThrottlerModule.forRoot')) {
      continue;
    }
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    let globalLimit: number | null = null;

    const visit = (node: ts.Node): void => {
      if (globalLimit !== null) {
        return;
      }
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'forRoot' &&
        node.expression.expression.getText(sourceFile) === 'ThrottlerModule'
      ) {
        for (const argument of node.arguments) {
          const limit = throttleLimitFromObject(argument);
          if (limit !== null) {
            globalLimit = limit;
            return;
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return { hasGlobalThrottleEvidence: true, globalLimit };
  }

  return { hasGlobalThrottleEvidence: false, globalLimit: null };
}

function compareRoutesByRisk(left: RouteThrottleEvidence, right: RouteThrottleEvidence): number {
  const riskDelta = right.riskWeight - left.riskWeight;
  if (riskDelta !== 0) {
    return riskDelta;
  }
  const pathDelta = left.path.localeCompare(right.path);
  if (pathDelta !== 0) {
    return pathDelta;
  }
  return left.method.localeCompare(right.method);
}

export function buildSecurityRateLimitProbePlan(config: PulseConfig): RateLimitProbePlan {
  const routes = walkFiles(config.backendDir, ['.ts'])
    .flatMap((file) => collectRoutesFromSource(config, file, readFileSafe(file)))
    .sort(compareRoutesByRisk);
  const globalThrottle = collectGlobalThrottleEvidence(config);

  return {
    routes,
    ...globalThrottle,
  };
}

function runtimePathFor(routePath: string): string {
  return joinRouteSegments(
    '',
    routePath
      .split('/')
      .map((segment) => (segment.startsWith(':') ? `pulse-${segment.slice(1)}` : segment))
      .join('/'),
  );
}

async function fireRouteRequests(
  route: RouteThrottleEvidence,
  requestCount: number,
  jwt: string,
): Promise<number[]> {
  const backendUrl = getBackendUrl();
  const runtimePath = runtimePathFor(route.path);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!route.hasPublicEvidence) {
    headers.Authorization = `Bearer ${jwt}`;
  }

  const body = route.hasBodyEvidence ? JSON.stringify({}) : undefined;
  const requests = Array.from({ length: requestCount }, () =>
    fetch(`${backendUrl}${runtimePath}`, {
      method: route.method === 'ALL' ? 'GET' : route.method,
      headers,
      body: route.method === 'GET' || route.method === 'HEAD' ? undefined : body,
      signal: AbortSignal.timeout(10000),
    })
      .then((response) => response.status)
      .catch(() => 0),
  );
  return Promise.all(requests);
}

function routeSurface(route: RouteThrottleEvidence): string {
  return `security-rate-limit:${route.method.toLowerCase()}:${route.path}`;
}

function routeEvidenceDetail(route: RouteThrottleEvidence): string {
  return [
    `${route.method} ${route.path}`,
    `source=${route.sourceFile}:${route.line}`,
    `class=${route.className}`,
    `handler=${route.handlerName}`,
    `throttle=${route.hasThrottleEvidence ? 'observed' : 'not_observed'}`,
    `guard=${route.hasGuardEvidence ? 'observed' : 'not_observed'}`,
    `public=${route.hasPublicEvidence ? 'observed' : 'not_observed'}`,
    `limit=${route.observedLimit ?? 'not_observed'}`,
  ].join('; ');
}

function buildMissingStaticThrottleBreak(route: RouteThrottleEvidence): Break {
  return synthesizedSecurityRateLimitBreak(
    {
      source: 'static:nest-controller-evidence',
      detector: 'route-throttle-evidence',
      truthMode: 'confirmed_static',
      summary: 'Route handling external input has no route-level throttle evidence',
      detail: routeEvidenceDetail(route),
      location: {
        file: route.sourceFile,
        line: route.line,
      },
    },
    route.riskWeight > 2 ? 'high' : 'medium',
    routeSurface(route),
    Math.min(1, route.riskWeight / Math.max(1, route.riskWeight + 1)),
  );
}

function buildRuntimeThrottleBreak(
  route: RouteThrottleEvidence,
  statuses: readonly number[],
  requestCount: number,
): Break {
  return synthesizedSecurityRateLimitBreak(
    {
      source: 'runtime:http-probe',
      detector: 'route-rate-limit-response-evidence',
      truthMode: 'observed',
      summary: 'Observed repeated route hits without throttled response evidence',
      detail: `${routeEvidenceDetail(route)}; requests=${requestCount}; statuses=${statuses.join(',')}`,
      location: {
        file: route.sourceFile,
        line: route.line,
      },
    },
    route.riskWeight > 2 ? 'critical' : 'high',
    routeSurface(route),
    1,
  );
}

function buildGlobalThrottleBreak(): Break {
  return synthesizedSecurityRateLimitBreak(
    {
      source: 'static:nest-module-evidence',
      detector: 'global-throttle-evidence',
      truthMode: 'confirmed_static',
      summary: 'Global NestJS throttler evidence was not observed',
      detail:
        'Controller route evidence exists, but PULSE did not observe ThrottlerModule.forRoot evidence in backend sources.',
      location: {
        file: 'backend/src',
        line: 0,
      },
    },
    'high',
    'security-rate-limit:global',
    1,
  );
}

function shouldRequireRouteThrottle(
  route: RouteThrottleEvidence,
  hasGlobalThrottleEvidence: boolean,
): boolean {
  return !hasGlobalThrottleEvidence && !route.hasThrottleEvidence && route.riskWeight > 1;
}

function requestCountFor(route: RouteThrottleEvidence, globalLimit: number | null): number | null {
  const observedLimit = route.observedLimit ?? globalLimit;
  if (observedLimit === null || observedLimit < 0) {
    return null;
  }
  return observedLimit + 1;
}

/** Check security rate limit. */
export async function checkSecurityRateLimit(config: PulseConfig): Promise<Break[]> {
  const plan = buildSecurityRateLimitProbePlan(config);
  const breaks: Break[] = [];

  if (!plan.hasGlobalThrottleEvidence && plan.routes.length > 0) {
    appendBreak(breaks, buildGlobalThrottleBreak());
  }

  for (const route of plan.routes) {
    if (shouldRequireRouteThrottle(route, plan.hasGlobalThrottleEvidence)) {
      appendBreak(breaks, buildMissingStaticThrottleBreak(route));
    }
  }

  if (!isDeepMode()) {
    return breaks;
  }

  const jwt = makeTestJwt();
  for (const route of plan.routes) {
    const requestCount = requestCountFor(route, plan.globalLimit);
    if (requestCount === null) {
      continue;
    }

    try {
      const statuses = await fireRouteRequests(route, requestCount, jwt);
      const throttledResponses = statuses.filter((status) => status === 429).length;
      const observedResponses = statuses.filter((status) => status !== 0).length;
      if (observedResponses === requestCount && throttledResponses === 0) {
        appendBreak(breaks, buildRuntimeThrottleBreak(route, statuses, requestCount));
      }
    } catch {
      // Backend not reachable or probe rejected before HTTP evidence was observed.
    }
  }

  return breaks;
}
