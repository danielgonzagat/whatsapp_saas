/**
 * PULSE Parser 53: Security — Cross-Workspace Access
 * Layer 5: Security Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * The parser discovers probe surfaces from NestJS controller evidence. Runtime
 * observations become signal/predicate diagnostics; no product route catalog or
 * static break identity owns the final decision.
 */

import * as path from 'path';
import * as ts from 'typescript';
import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { readTextFile } from '../safe-fs';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';
import type { Break, PulseConfig } from '../types';
import { getBackendUrl, httpGet, httpPost, isDeepMode, makeTestJwt } from './runtime-utils';
import { walkFiles } from './utils';

interface WorkspacePair {
  owner: string;
  attacker: string;
}

interface CrossWorkspaceProbeSurface {
  collectionPath: string;
  createPath: string | null;
  sourceFile: string;
  line: number;
  controllerName: string;
  handlerName: string;
}

function stableWorkspaceId(config: PulseConfig, role: keyof WorkspacePair): string {
  const rootName = path.basename(config.rootDir).replace(/[^A-Za-z0-9_-]+/g, '-');
  return ['pulse', rootName || 'repo', role].join('-').toLowerCase();
}

function workspacePair(config: PulseConfig): WorkspacePair {
  return {
    owner: process.env.PULSE_TEST_WORKSPACE_A?.trim() || stableWorkspaceId(config, 'owner'),
    attacker: process.env.PULSE_TEST_WORKSPACE_B?.trim() || stableWorkspaceId(config, 'attacker'),
  };
}

function bodyRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function hasNonEmptyData(value: unknown): boolean {
  const body = bodyRecord(value);
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (!body) {
    return false;
  }
  if (Array.isArray(body.data) && body.data.length > 0) {
    return true;
  }
  if (Array.isArray(body.items) && body.items.length > 0) {
    return true;
  }
  return typeof body.id === 'string' && body.id.trim().length > 0;
}

function resourceIdFrom(value: unknown): string | null {
  const body = bodyRecord(value);
  if (!body) {
    return null;
  }
  if (typeof body.id === 'string' && body.id.trim().length > 0) {
    return body.id;
  }
  const data = bodyRecord(body.data);
  if (data && typeof data.id === 'string' && data.id.trim().length > 0) {
    return data.id;
  }
  return null;
}

function decoratorName(node: ts.Decorator): string | null {
  const expression = node.expression;
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (!ts.isCallExpression(expression)) {
    return null;
  }
  const called = expression.expression;
  if (ts.isIdentifier(called)) {
    return called.text;
  }
  return ts.isPropertyAccessExpression(called) ? called.name.text : null;
}

function decoratorArgument(node: ts.Decorator): string {
  const expression = node.expression;
  if (!ts.isCallExpression(expression)) {
    return '';
  }
  const [first] = expression.arguments;
  if (!first || !ts.isStringLiteralLike(first)) {
    return '';
  }
  return first.text;
}

function decoratorsFor(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function routeJoin(first: string, second: string): string {
  const parts = [first, second]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => part.replace(/^\/+|\/+$/g, ''));
  return `/${parts.join('/')}`.replace(/\/+/g, '/');
}

function methodDecorator(node: ts.ClassElement, names: readonly string[]): ts.Decorator | null {
  return (
    decoratorsFor(node).find((decorator) => {
      const name = decoratorName(decorator);
      return name ? names.includes(name) : false;
    }) ?? null
  );
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function classNameOf(node: ts.ClassDeclaration): string {
  return node.name?.text ?? 'anonymous-controller';
}

function memberNameOf(node: ts.ClassElement): string {
  const name = node.name;
  if (!name) {
    return 'anonymous-handler';
  }
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText();
}

function readSource(file: string): string {
  try {
    return readTextFile(file, 'utf8');
  } catch {
    return '';
  }
}

export function buildSecurityCrossWorkspacePlan(config: PulseConfig): CrossWorkspaceProbeSurface[] {
  const surfaces: CrossWorkspaceProbeSurface[] = [];
  const files = walkFiles(config.backendDir, ['.ts']).filter(
    (file) => !file.endsWith('.spec.ts') && !file.endsWith('.test.ts'),
  );

  for (const file of files) {
    const source = readSource(file);
    if (!source) {
      continue;
    }
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const relativeFile = path.relative(config.rootDir, file);

    const visit = (node: ts.Node): void => {
      if (!ts.isClassDeclaration(node)) {
        ts.forEachChild(node, visit);
        return;
      }

      const controller = decoratorsFor(node).find(
        (decorator) => decoratorName(decorator) === 'Controller',
      );
      if (!controller) {
        return;
      }

      const base = decoratorArgument(controller);
      const creates = new Set<string>();
      const reads: Array<{ value: string; node: ts.ClassElement }> = [];

      for (const member of node.members) {
        const post = methodDecorator(member, ['Post']);
        if (post) {
          creates.add(routeJoin(base, decoratorArgument(post)));
        }

        const get = methodDecorator(member, ['Get']);
        if (get) {
          const routeValue = decoratorArgument(get);
          if (!routeValue.includes(':')) {
            reads.push({ value: routeJoin(base, routeValue), node: member });
          }
        }
      }

      for (const read of reads) {
        surfaces.push({
          collectionPath: read.value,
          createPath: creates.has(read.value) ? read.value : null,
          sourceFile: relativeFile,
          line: lineOf(sourceFile, read.node),
          controllerName: classNameOf(node),
          handlerName: memberNameOf(read.node),
        });
      }
    };

    ts.forEachChild(sourceFile, visit);
  }

  return surfaces;
}

function synthesizedCrossWorkspaceBreak(
  signal: PulseSignalEvidence,
  severity: Break['severity'],
  surface: string,
): Break {
  const signalGraph = buildPulseSignalGraph([signal]);
  const predicateGraph = buildPredicateGraph(signalGraph);
  const diagnostic = synthesizeDiagnostic(
    signalGraph,
    predicateGraph,
    calculateDynamicRisk({ predicateGraph, runtimeImpact: 1 }),
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

function signalForSurface(
  surface: CrossWorkspaceProbeSurface,
  summary: string,
  detail: string,
): PulseSignalEvidence {
  return {
    source: 'runtime-cross-workspace-probe',
    detector: 'security-cross-workspace',
    truthMode: 'observed',
    summary,
    detail,
    location: {
      file: surface.sourceFile,
      line: surface.line,
    },
  };
}

function testBodyFor(surface: CrossWorkspaceProbeSurface): Record<string, unknown> {
  const label = ['pulse', surface.controllerName, surface.handlerName, Date.now()].join('-');
  return {
    name: label,
    title: label,
    description: label,
  };
}

async function deleteResource(pathname: string, jwt: string): Promise<void> {
  try {
    await fetch(`${getBackendUrl()}${pathname}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Cleanup failure is non-critical for the isolation diagnostic.
  }
}

function tamperedJwt(workspaceId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      sub: 'pulse-attacker-user',
      email: 'pulse-attacker@example.invalid',
      workspaceId,
      role: 'ADMIN',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url');
  const signature = Buffer.from(['wrong', 'signature'].join('-')).toString('base64url');
  return `${header}.${body}.${signature}`;
}

/** Check security cross workspace. */
export async function checkSecurityCrossWorkspace(config: PulseConfig): Promise<Break[]> {
  if (!isDeepMode()) {
    return [];
  }

  const breaks: Break[] = [];
  const pair = workspacePair(config);
  const surfaces = buildSecurityCrossWorkspacePlan(config);
  const jwtA = makeTestJwt({
    workspaceId: pair.owner,
    userId: ['user', pair.owner].join('-'),
    email: `${pair.owner}@example.invalid`,
  });
  const jwtB = makeTestJwt({
    workspaceId: pair.attacker,
    userId: ['user', pair.attacker].join('-'),
    email: `${pair.attacker}@example.invalid`,
  });

  for (const surface of surfaces) {
    try {
      const res = await fetch(`${getBackendUrl()}${surface.collectionPath}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${jwtB}`,
          'Content-Type': 'application/json',
          'x-workspace-id': pair.owner,
        },
        signal: AbortSignal.timeout(8000),
      });

      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      if (res.status === 200 && hasNonEmptyData(body)) {
        appendBreak(
          breaks,
          synthesizedCrossWorkspaceBreak(
            signalForSurface(
              surface,
              'Cross-workspace header override returned data',
              `GET ${surface.collectionPath} returned data for attacker token when x-workspace-id targeted the owner workspace.`,
            ),
            'critical',
            surface.collectionPath,
          ),
        );
      }
    } catch {
      // Backend not reachable for this probe.
    }

    if (!surface.createPath) {
      continue;
    }

    try {
      const createRes = await httpPost(surface.createPath, testBodyFor(surface), {
        jwt: jwtA,
        timeout: 8000,
      });
      const resourceId = resourceIdFrom(createRes.body);

      if (!resourceId || (createRes.status !== 200 && createRes.status !== 201)) {
        continue;
      }

      const itemPath = routeJoin(surface.collectionPath, resourceId);
      const getRes = await httpGet(itemPath, { jwt: jwtB, timeout: 8000 });

      if (getRes.status === 200 && hasNonEmptyData(getRes.body)) {
        appendBreak(
          breaks,
          synthesizedCrossWorkspaceBreak(
            signalForSurface(
              surface,
              'Cross-workspace resource read returned data',
              `Resource created by owner workspace was returned to attacker workspace at ${itemPath}.`,
            ),
            'critical',
            itemPath,
          ),
        );
      }

      await deleteResource(itemPath, jwtA);
    } catch {
      // Network/runtime probe failed; no diagnostic without observation.
    }
  }

  const [firstSurface] = surfaces;
  if (firstSurface) {
    try {
      const res = await httpGet(firstSurface.collectionPath, {
        jwt: tamperedJwt(pair.owner),
        timeout: 5000,
      });

      if (res.status === 200) {
        appendBreak(
          breaks,
          synthesizedCrossWorkspaceBreak(
            signalForSurface(
              firstSurface,
              'Tampered JWT was accepted',
              `Invalid signature token claiming owner workspace reached ${firstSurface.collectionPath} with HTTP 200.`,
            ),
            'critical',
            firstSurface.collectionPath,
          ),
        );
      }
    } catch {
      // Runtime unavailable for signature probe.
    }
  }

  return breaks;
}
