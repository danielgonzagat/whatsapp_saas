import * as ts from 'typescript';

import type { ProviderContract } from '../../types.contract-tester';
import { readTextFile } from '../../safe-fs';
import { walkFiles } from '../../parsers/utils';
import {
  parseSourceFile,
  describeHttpClientCall,
  providerFromUrl,
  normalizeEndpoint,
  findBackendDir,
  readStaticStringExpression,
  normalizeRoute,
} from './helpers';
import { HTTP_METHOD_PATTERN } from './constants';
import { inferExpectedHeaders, inferAuthType } from './contract-building';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface EndpointDescriptor {
  method: string;
  endpoint: string;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function defineProviderContracts(rootDir: string): ProviderContract[] {
  const contracts: ProviderContract[] = [];
  const backendDir = findBackendDir(rootDir);

  if (backendDir) {
    const files = walkFiles(backendDir, ['.ts', '.tsx']);
    for (const filePath of files) {
      let content: string;
      try {
        content = readTextFile(filePath, 'utf8');
      } catch {
        continue;
      }
      extractEndpointCalls(content, filePath).forEach((contract) => contracts.push(contract));
    }

    extractInternalAPIContracts(backendDir).forEach((c) => contracts.push(c));
  }

  return contracts;
}

// ---------------------------------------------------------------------------
// Endpoint call extraction
// ---------------------------------------------------------------------------

function extractEndpointCalls(content: string, filePath: string): ProviderContract[] {
  const results: ProviderContract[] = [];
  const seen = new Set<string>();
  const source = parseSourceFile(filePath, content);

  const visit = (node: ts.Node): void => {
    if (!ts.isCallExpression(node)) {
      ts.forEachChild(node, visit);
      return;
    }

    const call = describeHttpClientCall(node, source);
    if (!call) {
      ts.forEachChild(node, visit);
      return;
    }

    const provider = providerFromUrl(call.endpoint);
    if (!provider) {
      ts.forEachChild(node, visit);
      return;
    }

    const normalized = normalizeEndpoint(call.endpoint, provider);
    const key = `${call.method} ${normalized}`;
    if (seen.has(key)) {
      ts.forEachChild(node, visit);
      return;
    }
    seen.add(key);

    results.push({
      provider,
      endpoint: normalized,
      method: call.method,
      expectedRequestSchema: {},
      expectedResponseSchema: {},
      expectedHeaders: inferExpectedHeaders(content, call.endpoint),
      authType: inferAuthType(content, call.endpoint),
      status: 'unknown',
      lastValidated: null,
      issues: ['No executed contract evidence found for discovered endpoint'],
    });

    ts.forEachChild(node, visit);
  };

  visit(source);

  return results;
}

// ---------------------------------------------------------------------------
// Internal API contract extraction
// ---------------------------------------------------------------------------

function extractInternalAPIContracts(rootDir: string): ProviderContract[] {
  const contracts: ProviderContract[] = [];
  const files = walkFiles(rootDir, ['.ts']);
  const seen = new Set<string>();

  for (const filePath of files) {
    let content: string;
    try {
      content = readTextFile(filePath, 'utf8');
    } catch {
      continue;
    }

    const source = parseSourceFile(filePath, content);
    const prefix = findControllerPrefix(source);

    for (const routeDefinition of collectRouteDecorators(source)) {
      const route = normalizeRoute(routeDefinition.route);
      const fullRoute = prefix + (route.startsWith('/') || prefix.endsWith('/') ? '' : '/') + route;
      const normalized = normalizeRoute(fullRoute);

      const key = `${routeDefinition.method} ${normalized}`;
      if (seen.has(key)) continue;
      seen.add(key);

      contracts.push({
        provider: 'internal_api',
        endpoint: normalized,
        method: routeDefinition.method,
        expectedRequestSchema: {},
        expectedResponseSchema: {},
        expectedHeaders: [],
        authType: 'bearer',
        status: 'untested',
        lastValidated: null,
        issues: [],
      });
    }
  }

  return contracts;
}

export function findControllerPrefix(source: ts.SourceFile): string {
  const classes = source.statements.filter(ts.isClassDeclaration);
  for (const classDeclaration of classes) {
    for (const decorator of ts.getDecorators(classDeclaration) ?? []) {
      const call = readDecoratorCall(decorator);
      if (!call || !ts.isIdentifier(call.expression) || call.expression.text !== 'Controller') {
        continue;
      }

      return normalizeRoute(readStaticStringExpression(call.arguments[0], source) ?? '');
    }
  }

  return '';
}

export function collectRouteDecorators(
  source: ts.SourceFile,
): Array<{ method: string; route: string }> {
  const routes: Array<{ method: string; route: string }> = [];

  const visit = (node: ts.Node): void => {
    if (ts.isMethodDeclaration(node)) {
      for (const decorator of ts.getDecorators(node) ?? []) {
        const call = readDecoratorCall(decorator);
        if (!call || !ts.isIdentifier(call.expression)) {
          continue;
        }

        const method = normalizeHttpMethod(call.expression.text);
        if (!method) {
          continue;
        }

        routes.push({
          method,
          route: readStaticStringExpression(call.arguments[0], source) ?? '',
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return routes;
}

function readDecoratorCall(decorator: ts.Decorator): ts.CallExpression | null {
  return ts.isCallExpression(decorator.expression) ? decorator.expression : null;
}

function normalizeHttpMethod(value: string): string | null {
  const upper = value.toUpperCase();
  return HTTP_METHOD_PATTERN.test(upper) ? upper : null;
}
