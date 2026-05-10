/**
 * Part 1: Shared utility/helper functions.
 * Depends only on part0_constants and external modules.
 */

import * as path from 'path';
import * as ts from 'typescript';
import type { ContractProvider, ProviderContract } from '../types.contract-tester';
import {
  deriveUnitValue,
  deriveZeroValue,
  discoverRouteSeparatorFromRuntime,
} from '../dynamic-reality-kernel/catalog-arithmetic';
import { safeJoin } from '../lib/safe-path';
import { pathExists } from '../safe-fs';
import {
  AUTH_TYPE_LABELS,
  CONTRACT_EVIDENCE_FILENAME,
  HTTP_METHOD_PATTERN,
  isAuthType,
  MIGRATIONS_DIRS,
  NESTJS_DECORATOR_NAMES,
  resolveAuthLabel,
} from './part0_constants';

// ── Path/filesystem helpers ─────────────────────────────────────────────────

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > deriveZeroValue()))];
}

export function dedupeContracts(contracts: ProviderContract[]): ProviderContract[] {
  const byKey = new Map<string, ProviderContract>();
  for (const contract of contracts) {
    const key = `${contract.method} ${contract.provider}${contract.endpoint}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, contract);
      continue;
    }
    byKey.set(key, {
      ...existing,
      expectedRequestSchema:
        Object.keys(existing.expectedRequestSchema).length > deriveZeroValue()
          ? existing.expectedRequestSchema
          : contract.expectedRequestSchema,
      expectedResponseSchema:
        Object.keys(existing.expectedResponseSchema).length > deriveZeroValue()
          ? existing.expectedResponseSchema
          : contract.expectedResponseSchema,
      expectedHeaders: uniqueStrings([...existing.expectedHeaders, ...contract.expectedHeaders]),
      authType: isAuthType(
        existing.authType,
        resolveAuthLabel((l) => l === 'none'),
      )
        ? contract.authType
        : existing.authType,
      issues: uniqueStrings([...existing.issues, ...contract.issues]),
    });
  }
  return [...byKey.values()];
}

export function findBackendDir(rootDir: string): string | null {
  const candidates = ['backend/src', 'server/src', 'api/src', 'src'];
  for (const candidate of candidates) {
    const full = safeJoin(rootDir, candidate);
    if (pathExists(full)) return full;
  }
  return null;
}

export function findMigrationsDir(rootDir: string): string | null {
  for (const candidate of MIGRATIONS_DIRS) {
    const full = safeJoin(rootDir, candidate);
    if (pathExists(full)) return full;
  }
  return null;
}

// ── TypeScript AST helpers ──────────────────────────────────────────────────

export function parseSourceFile(filePath: string, content: string): ts.SourceFile {
  const sk =
    filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, sk);
}

export function readPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    return name.text;
  return null;
}

export function readStaticStringExpression(
  node: ts.Node | undefined,
  source: ts.SourceFile,
): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.getText(source).slice(1, -1);
  return null;
}

export function readDecoratorCall(decorator: ts.Decorator): ts.CallExpression | null {
  return ts.isCallExpression(decorator.expression) ? decorator.expression : null;
}

// ── Route helpers ───────────────────────────────────────────────────────────

export function normalizeRoute(route: string): string {
  const sep = discoverRouteSeparatorFromRuntime();
  return (
    String(route || '')
      .trim()
      .replace(/\/+/g, sep)
      .replace(/\/$/, '') || sep
  );
}

export function normalizeHttpMethod(value: string): string | null {
  const upper = value.toUpperCase();
  return HTTP_METHOD_PATTERN.test(upper) ? upper : null;
}

// ── Decorator scanners ──────────────────────────────────────────────────────

export function findControllerPrefix(source: ts.SourceFile): string {
  const classes = source.statements.filter(ts.isClassDeclaration);
  for (const classDeclaration of classes) {
    for (const decorator of ts.getDecorators(classDeclaration) ?? []) {
      const call = readDecoratorCall(decorator);
      if (!call || !ts.isIdentifier(call.expression)) continue;
      if (!NESTJS_DECORATOR_NAMES.has(call.expression.text)) continue;
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
        if (!call || !ts.isIdentifier(call.expression)) continue;
        const method = normalizeHttpMethod(call.expression.text);
        if (!method) continue;
        routes.push({ method, route: readStaticStringExpression(call.arguments[0], source) ?? '' });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return routes;
}

// ── URL provider helpers ────────────────────────────────────────────────────

export function providerFromUrl(raw: string): ContractProvider | null {
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const parsed = new URL(raw);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeEndpoint(raw: string, _provider: ContractProvider): string {
  let result = raw.replace(/https?:\/\/[^/]+/, '');
  if (result.startsWith('/')) result = result.slice(1);
  const paths = result.split('/');
  const normalized = paths
    .filter((p) => p.length > deriveZeroValue())
    .map((p) => {
      if (/^[a-f0-9]{32}$/i.test(p)) return '{id}';
      if (/^\d{10,20}$/.test(p)) return '{phone_number_id}';
      if (/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(p)) return '{uuid}';
      return p;
    });
  return '/' + normalized.join('/');
}

export function inferExpectedHeaders(content: string, url: string): string[] {
  const context = surroundingText(content, url, 500);
  const headers = new Set<string>();
  for (const match of context.matchAll(/['"`]([A-Za-z0-9-]+)['"`]\s*:/g)) {
    const header = match[1];
    if (/^(authorization|content-type|x-[a-z0-9-]+|accept)$/i.test(header)) {
      headers.add(header);
    }
  }
  return [...headers];
}

export function inferAuthType(content: string, url: string): ProviderContract['authType'] {
  const context = surroundingText(content, url, 500);
  if (/signature|x-hub|x-signature/i.test(context))
    return resolveAuthLabel((l) => l.includes('signature'));
  if (/Bearer\s+|Authorization/i.test(context))
    return resolveAuthLabel((l) => l.startsWith('bear'));
  if (/api[-_]?key|access[-_]?token|secret/i.test(context))
    return resolveAuthLabel((l) => l.includes('api'));
  if (/oauth/i.test(context)) return resolveAuthLabel((l) => l.startsWith('oauth'));
  return resolveAuthLabel((l) => l === 'none');
}

export function surroundingText(content: string, needle: string, radius: number): string {
  const index = content.indexOf(needle);
  if (index < deriveZeroValue()) return '';
  return content.slice(
    Math.max(deriveZeroValue(), index - radius),
    Math.min(content.length, index + needle.length + radius),
  );
}

export function extractMethod(content: string, match: RegExpExecArray): string {
  if (match[2] && match[1] && /^(get|put|delete|patch)$/i.test(match[1])) {
    return match[1].toUpperCase();
  }
  if (/post/i.test(match[0])) return 'POST';
  const pos = match.index;
  const before = content.slice(Math.max(0, pos - 80), pos);
  const methodMatch = before.match(HTTP_METHOD_PATTERN);
  if (methodMatch) return methodMatch[1].toUpperCase();
  return 'POST';
}

// ── OpenAPI helpers ─────────────────────────────────────────────────────────

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
      const p = providerFromUrl(url);
      if (p) return p;
    }
  }
  return null;
}

export function extractOpenApiRequestSchema(
  operation: Record<string, unknown>,
): Record<string, unknown> {
  const requestBody = operation.requestBody;
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) return {};
  return { requestBody };
}

export function extractOpenApiResponseSchema(
  operation: Record<string, unknown>,
): Record<string, unknown> {
  const responses = operation.responses;
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) return {};
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
  if (!security) return resolveAuthLabel((l) => l === 'none');
  const serialized = JSON.stringify(security).toLowerCase();
  if (serialized.includes('oauth')) return resolveAuthLabel((l) => l.startsWith('oauth'));
  if (serialized.includes('bearer')) return resolveAuthLabel((l) => l.startsWith('bear'));
  if (serialized.includes('signature')) return resolveAuthLabel((l) => l.includes('signature'));
  if (serialized.includes('apikey') || serialized.includes('api_key'))
    return resolveAuthLabel((l) => l.includes('api'));
  return resolveAuthLabel((l) => l.includes('api'));
}

export function isPulseRuntimeArtifactFile(fileName: string): boolean {
  return (
    fileName.startsWith('PULSE_') &&
    fileName.endsWith('.json') &&
    fileName !== CONTRACT_EVIDENCE_FILENAME
  );
}

// ── URL observation ─────────────────────────────────────────────────────────

export interface UrlObservation {
  url: string;
  method: string | null;
  headers: string[];
  requestSchema: Record<string, unknown> | null;
  responseSchema: Record<string, unknown> | null;
  context: string;
}

export function collectUrlObservations(value: unknown): UrlObservation[] {
  const observations: UrlObservation[] = [];
  const seen = new Set<string>();

  const visit = (current: unknown, context: Record<string, unknown>, keyPath: string): void => {
    if (typeof current === 'string') {
      for (const url of extractExternalUrls(current)) {
        const method = readMethodFromContext(context);
        const normalizedKey = `${method ?? 'GET'} ${url}`;
        if (seen.has(normalizedKey)) continue;
        seen.add(normalizedKey);
        observations.push({
          url,
          method,
          headers: readHeadersFromContext(context),
          requestSchema: readSchemaFromContext(context, 'request'),
          responseSchema: readSchemaFromContext(context, 'response'),
          context: keyPath,
        });
      }
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, context, `${keyPath}[${index}]`));
      return;
    }
    if (current && typeof current === 'object') {
      const obj = current as Record<string, unknown>;
      for (const [key, child] of Object.entries(obj)) {
        visit(child, obj, keyPath ? `${keyPath}.${key}` : key);
      }
    }
  };

  visit(value, {}, '');
  return observations;
}

export function extractExternalUrls(value: string): string[] {
  const urls: string[] = [];
  const schemes = ['http://', 'https://'];
  let cursor = deriveZeroValue();

  while (cursor < value.length) {
    const nextStarts = schemes
      .map((scheme) => ({ scheme, index: value.indexOf(scheme, cursor) }))
      .filter((entry) => entry.index >= deriveZeroValue())
      .sort((a, b) => a.index - b.index);

    const next = nextStarts[deriveZeroValue()];
    if (!next) break;

    let end = next.index + next.scheme.length;
    while (end < value.length && isUrlTokenCharacter(value[end])) end++;

    const candidate = value.slice(next.index, end);
    if (providerFromUrl(candidate)) urls.push(candidate);
    cursor = end;
  }
  return urls;
}

export function isUrlTokenCharacter(char: string): boolean {
  if (!char) return false;
  return !["'", '"', '`', '<', '>', ')', '\\'].includes(char) && !/\s/.test(char);
}

export function readMethodFromContext(context: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(context)) {
    const normalizedKey = key.toLowerCase();
    if (!normalizedKey.includes('method') && !normalizedKey.includes('verb')) {
      continue;
    }
    if (typeof value === 'string' && HTTP_METHOD_PATTERN.test(value.toUpperCase())) {
      return value.toUpperCase();
    }
  }
  return null;
}

export function readHeadersFromContext(context: Record<string, unknown>): string[] {
  const headers = context.headers;
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return [];
  return Object.keys(headers).filter((header) => /^[A-Za-z0-9-]+$/.test(header));
}

export function readSchemaFromContext(
  context: Record<string, unknown>,
  direction: 'request' | 'response',
): Record<string, unknown> | null {
  for (const [key, value] of Object.entries(context)) {
    const normalizedKey = key.toLowerCase();
    if (!normalizedKey.includes(direction) && !normalizedKey.includes('schema')) {
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

export function inferAuthTypeFromObservation(
  observation: UrlObservation,
): ProviderContract['authType'] {
  const serialized = JSON.stringify({
    headers: observation.headers,
    requestSchema: observation.requestSchema,
    responseSchema: observation.responseSchema,
    context: observation.context,
  }).toLowerCase();
  if (serialized.includes('signature')) return resolveAuthLabel((l) => l.includes('signature'));
  if (serialized.includes('bearer') || serialized.includes('authorization'))
    return resolveAuthLabel((l) => l.startsWith('bear'));
  if (serialized.includes('oauth')) return resolveAuthLabel((l) => l.startsWith('oauth'));
  if (serialized.includes('api_key') || serialized.includes('apikey'))
    return resolveAuthLabel((l) => l.includes('api'));
  return resolveAuthLabel((l) => l === 'none');
}
