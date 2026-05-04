import * as path from 'path';
import * as ts from 'typescript';

import type { ContractProvider, ProviderContract } from '../../types.contract-tester';
import { safeJoin } from '../../lib/safe-path';
import { pathExists, readTextFile } from '../../safe-fs';
import { walkFiles } from '../../parsers/utils';
import { HTTP_METHOD_PATTERN } from './constants';

// ---------------------------------------------------------------------------
// Source parsing
// ---------------------------------------------------------------------------

export function parseSourceFile(filePath: string, content: string): ts.SourceFile {
  const scriptKind =
    filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKind);
}

export function readPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

// ---------------------------------------------------------------------------
// String expression reading
// ---------------------------------------------------------------------------

export function readStaticStringExpression(
  node: ts.Node | undefined,
  source: ts.SourceFile,
): string | null {
  if (!node) {
    return null;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    return node.getText(source).slice(1, -1);
  }
  return null;
}

// ---------------------------------------------------------------------------
// HTTP client call detection
// ---------------------------------------------------------------------------

export interface RawEndpointCall {
  endpoint: string;
  method: string;
  filePath: string;
}

export function readFetchMethod(node: ts.CallExpression, source: ts.SourceFile): string | null {
  const options = node.arguments[1];
  if (!options || !ts.isObjectLiteralExpression(options)) {
    return null;
  }

  for (const property of options.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const name = readPropertyName(property.name);
    if (name !== 'method') {
      continue;
    }
    const method = readStaticStringExpression(property.initializer, source);
    return method ? method.toUpperCase() : null;
  }

  return null;
}

export function describeHttpClientCall(
  node: ts.CallExpression,
  source: ts.SourceFile,
): RawEndpointCall | null {
  if (ts.isIdentifier(node.expression) && node.expression.text === 'fetch') {
    const endpoint = readStaticStringExpression(node.arguments[0], source);
    if (!endpoint) {
      return null;
    }

    return {
      endpoint,
      method: readFetchMethod(node, source) ?? 'GET',
      filePath: source.fileName,
    };
  }

  if (!ts.isPropertyAccessExpression(node.expression)) {
    return null;
  }

  const receiver = node.expression.expression;
  if (!ts.isIdentifier(receiver) || receiver.text !== 'axios') {
    return null;
  }

  const endpoint = readStaticStringExpression(node.arguments[0], source);
  if (!endpoint) {
    return null;
  }

  return {
    endpoint,
    method: node.expression.name.text.toUpperCase(),
    filePath: source.fileName,
  };
}

// ---------------------------------------------------------------------------
// URL, route, and string helpers
// ---------------------------------------------------------------------------

export function normalizeRoute(route: string): string {
  return (
    String(route || '')
      .trim()
      .replace(/\/+/g, '/')
      .replace(/\/$/, '') || '/'
  );
}

export function normalizePackageName(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('.') || trimmed.startsWith('/')) {
    return null;
  }
  if (trimmed.startsWith('@')) {
    const parts = trimmed.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : trimmed;
  }
  return trimmed.split('/')[0] || null;
}

export function providerFromUrl(raw: string): ContractProvider | null {
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const parsed = new URL(raw);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Context readers for artifact observations
// ---------------------------------------------------------------------------

export function readMethodFromContext(context: Record<string, unknown>): string | null {
  for (const key of ['method', 'httpMethod', 'httpVerb', 'verb']) {
    const value = context[key];
    if (typeof value === 'string' && HTTP_METHOD_PATTERN.test(value.toUpperCase())) {
      return value.toUpperCase();
    }
  }
  return null;
}

export function readHeadersFromContext(context: Record<string, unknown>): string[] {
  const headers = context.headers;
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    return [];
  }
  return Object.keys(headers).filter((header) => /^[A-Za-z0-9-]+$/.test(header));
}

export function readSchemaFromContext(
  context: Record<string, unknown>,
  direction: 'request' | 'response',
): Record<string, unknown> | null {
  const keys =
    direction === 'request'
      ? ['requestSchema', 'bodySchema', 'requestBody', 'payloadSchema']
      : ['responseSchema', 'responseBody', 'resultSchema'];

  for (const key of keys) {
    const value = context[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------

export function findBackendDir(rootDir: string): string | null {
  const candidates = ['backend/src', 'server/src', 'api/src', 'src'];
  for (const candidate of candidates) {
    const full = safeJoin(rootDir, candidate);
    if (pathExists(full)) {
      return full;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// OpenAPI discovery helpers
// ---------------------------------------------------------------------------

export function isOpenApiSpecFile(rootDir: string, filePath: string): boolean {
  const relative = path.relative(rootDir, filePath);
  if (relative.startsWith('..')) return false;

  const parsed = path.parse(filePath);
  if (parsed.ext.toLowerCase() !== '.json') return false;

  const firstNameSegment = parsed.name.toLowerCase().split('.')[0];
  return firstNameSegment === 'openapi' || firstNameSegment === 'swagger';
}

export function providerFromOpenApiSpec(spec: Record<string, unknown>): string | null {
  const servers = Array.isArray(spec.servers) ? spec.servers : [];
  for (const server of servers) {
    if (!server || typeof server !== 'object') continue;
    const url = (server as Record<string, unknown>).url;
    if (typeof url === 'string') {
      const provider = providerFromUrl(url);
      if (provider) return provider;
    }
  }
  return null;
}

export function extractOpenApiRequestSchema(
  operation: Record<string, unknown>,
): Record<string, unknown> {
  const requestBody = operation.requestBody;
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    return {};
  }
  return { requestBody };
}

export function extractOpenApiResponseSchema(
  operation: Record<string, unknown>,
): Record<string, unknown> {
  const responses = operation.responses;
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) {
    return {};
  }
  return { responses };
}

export function inferOpenApiAuthType(
  spec: Record<string, unknown>,
  operation: Record<string, unknown>,
): ProviderContract['authType'] {
  const security =
    operation.security ??
    spec.security ??
    (spec.components as Record<string, unknown> | undefined)?.securitySchemes;
  if (!security) return 'none';

  const serialized = JSON.stringify(security).toLowerCase();
  if (serialized.includes('oauth')) return 'oauth2';
  if (serialized.includes('bearer')) return 'bearer';
  if (serialized.includes('signature')) return 'webhook_signature';
  if (serialized.includes('apikey') || serialized.includes('api_key')) return 'api_key';
  return 'api_key';
}

export function discoverContractsFromOpenApi(rootDir: string): ProviderContract[] {
  const contracts: ProviderContract[] = [];
  const files = walkFiles(rootDir, ['.json']).filter((filePath) =>
    isOpenApiSpecFile(rootDir, filePath),
  );

  for (const filePath of files) {
    let spec: unknown;
    try {
      spec = JSON.parse(readTextFile(filePath, 'utf8'));
    } catch {
      continue;
    }

    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) continue;

    const root = spec as Record<string, unknown>;
    const paths = root.paths;
    if (!paths || typeof paths !== 'object' || Array.isArray(paths)) continue;

    const provider = providerFromOpenApiSpec(root) ?? 'openapi_schema';
    for (const [endpoint, methods] of Object.entries(paths as Record<string, unknown>)) {
      if (!methods || typeof methods !== 'object' || Array.isArray(methods)) continue;

      for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
        const normalizedMethod = method.toUpperCase();
        if (!HTTP_METHOD_PATTERN.test(normalizedMethod)) continue;

        const operationObject =
          operation && typeof operation === 'object' && !Array.isArray(operation)
            ? (operation as Record<string, unknown>)
            : {};

        contracts.push({
          provider,
          endpoint: normalizeRoute(endpoint),
          method: normalizedMethod,
          expectedRequestSchema: extractOpenApiRequestSchema(operationObject),
          expectedResponseSchema: extractOpenApiResponseSchema(operationObject),
          expectedHeaders: [],
          authType: inferOpenApiAuthType(root, operationObject),
          status: 'generated',
          lastValidated: null,
          issues: [`Discovered from OpenAPI schema ${filePath.replace(rootDir + path.sep, '')}`],
        });
      }
    }
  }

  return contracts;
}

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function normalizeEndpoint(raw: string, _provider: ContractProvider): string {
  let result = raw.replace(/https?:\/\/[^/]+/, '');
  if (result.startsWith('/')) result = result.slice(1);

  const paths = result.split('/');
  const normalized = paths
    .filter((p) => p.length > 0)
    .map((p) => {
      if (/^[a-f0-9]{32}$/i.test(p)) return '{id}';
      if (/^\d{10,20}$/.test(p)) return '{phone_number_id}';
      if (/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(p)) return '{uuid}';
      return p;
    });

  return '/' + normalized.join('/');
}

export function surroundingText(content: string, needle: string, radius: number): string {
  const index = content.indexOf(needle);
  if (index < 0) return '';
  return content.slice(
    Math.max(0, index - radius),
    Math.min(content.length, index + needle.length + radius),
  );
}
