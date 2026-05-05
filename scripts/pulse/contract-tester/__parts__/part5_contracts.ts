/**
 * Part 5: Provider contract discovery from source code.
 */

import * as ts from 'typescript';
import type { ProviderContract } from '../../types.contract-tester';
import { discoverSourceExtensionsFromObservedTypescript } from '../../dynamic-reality-kernel/__parts__/token-evidence';
import {
  findBackendDir,
  inferAuthType,
  inferExpectedHeaders,
  normalizeEndpoint,
  normalizeRoute,
  parseSourceFile,
  providerFromUrl,
  readPropertyName,
  readStaticStringExpression,
  readDecoratorCall,
} from './part1_helpers';
import { normalizeHttpMethod } from './part1_helpers';
import {
  HTTP_METHOD_PATTERN,
  NESTJS_DECORATOR_NAMES,
  resolveAuthLabel,
  resolveStatusLabel,
} from './part0_constants';
import { findControllerPrefix, collectRouteDecorators } from './part1_helpers';
import { readTextFile } from '../../safe-fs';
import { walkFiles } from '../../parsers/utils';

interface RawEndpointCall {
  endpoint: string;
  method: string;
  filePath: string;
}

function describeHttpClientCall(
  node: ts.CallExpression,
  source: ts.SourceFile,
): RawEndpointCall | null {
  if (ts.isIdentifier(node.expression) && node.expression.text === 'fetch') {
    const endpoint = readStaticStringExpression(node.arguments[0], source);
    if (!endpoint) return null;
    return { endpoint, method: readFetchMethod(node, source) ?? 'GET', filePath: source.fileName };
  }
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  const receiver = node.expression.expression;
  if (!ts.isIdentifier(receiver) || receiver.text !== 'axios') return null;
  const endpoint = readStaticStringExpression(node.arguments[0], source);
  if (!endpoint) return null;
  return { endpoint, method: node.expression.name.text.toUpperCase(), filePath: source.fileName };
}

function readFetchMethod(node: ts.CallExpression, source: ts.SourceFile): string | null {
  const options = node.arguments[1];
  if (!options || !ts.isObjectLiteralExpression(options)) return null;
  for (const property of options.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = readPropertyName(property.name);
    if (name !== 'method') continue;
    const method = readStaticStringExpression(property.initializer, source);
    return method ? method.toUpperCase() : null;
  }
  return null;
}

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
      status: resolveStatusLabel((l) => l === 'unknown'),
      lastValidated: null,
      issues: ['No executed contract evidence found for discovered endpoint'],
    });
    ts.forEachChild(node, visit);
  };
  visit(source);
  return results;
}

function extractInternalAPIContracts(rootDir: string): ProviderContract[] {
  const contracts: ProviderContract[] = [];
  const files = walkFiles(rootDir, [...discoverSourceExtensionsFromObservedTypescript()]);
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
        authType: resolveAuthLabel((l) => l.startsWith('bear')),
        status: resolveStatusLabel((l) => l === 'untested'),
        lastValidated: null,
        issues: [],
      });
    }
  }
  return contracts;
}

export function defineProviderContracts(rootDir: string): ProviderContract[] {
  const contracts: ProviderContract[] = [];
  const backendDir = findBackendDir(rootDir);
  if (backendDir) {
    const files = walkFiles(backendDir, [...discoverSourceExtensionsFromObservedTypescript()]);
    for (const filePath of files) {
      let content: string;
      try {
        content = readTextFile(filePath, 'utf8');
      } catch {
        continue;
      }
      extractEndpointCalls(content, filePath).forEach((c) => contracts.push(c));
    }
    extractInternalAPIContracts(backendDir).forEach((c) => contracts.push(c));
  }
  return contracts;
}
