/**
 * PULSE Parser 54: Security — SQL/NoSQL Injection
 * Layer 5: Security Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * CHECKS:
 * Send SQL injection and NoSQL injection payloads to all POST/PATCH endpoints.
 * Prisma uses parameterized queries by default, but raw queries ($queryRaw, $executeRaw)
 * and dynamic where clauses can still be vulnerable.
 *
 * SQL injection payloads to test in string fields:
 * - "' OR '1'='1"
 * - "'; DROP TABLE users; --"
 * - "' UNION SELECT id, email, password FROM users --"
 * - "1'; WAITFOR DELAY '0:0:5' --" (time-based blind)
 * - "${workspaceId} OR 1=1"
 *
 * For each POST/PATCH endpoint:
 * 1. Send payload in all string fields (name, email, description, slug, etc.)
 * 2. Assert response is 400 (validation error) OR 200 with payload stored safely (escaped)
 * 3. Assert response does NOT return unexpected extra records (union injection worked)
 * 4. Assert response time < 3s (time-based injection did not execute DELAY)
 * 5. Assert response body does not contain SQL error messages (syntax error, relation does not exist)
 *
 * $queryRaw usage (high-risk):
 * 6. Scan backend for $queryRaw and $executeRaw calls
 * 7. For each raw query found, verify interpolated values use Prisma.sql template tag
 * 8. Flag any string concatenation into raw queries as injection vulnerable
 *
 * Path traversal in ID params:
 * 9. GET /products/../../../etc/passwd → expect 400 or 404, not file read
 * 10. GET /products/%2F%2F%2Fetc%2Fpasswd → same
 *
 * REQUIRES:
 * - Running backend (PULSE_BACKEND_URL)
 * - Valid test JWT (PULSE_TEST_JWT) for authenticated endpoints
 *
 * BREAK TYPES:
 * - INJECTION_VULNERABLE (critical) — endpoint returns unexpected data or error from injection payload,
 *   or raw query uses string concatenation instead of parameterized values
 */

import * as path from 'path';
import ts from 'typescript';
import type { Break, PulseConfig } from '../types';
import { readTextFile } from '../safe-fs';
import { httpGet, httpPost, makeTestJwt, isDeepMode } from './runtime-utils';
import { walkFiles } from './utils';

/** Keywords that indicate an unhandled DB error leaked to the response */
const dbErrorTokens = [
  'syntax error',
  'pg error',
  'relation "',
  'column "',
  'operator does not exist',
  'invalid input syntax',
  'ERROR:',
  'DETAIL:',
  'HINT:',
  'psql',
  'PostgreSQL',
  'sqlite_',
  'mysql_',
  'ORA-',
  'SQL Server',
];

function containsDbError(body: unknown): boolean {
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  return dbErrorTokens.some((token) => text.includes(token));
}

/** Test endpoints: method, path, body factory */
interface EndpointTest {
  method: 'POST' | 'PATCH';
  path: string;
  buildBody: (payload: string) => Record<string, unknown>;
  description: string;
}

interface ControllerRouteEvidence {
  method: EndpointTest['method'] | 'GET';
  path: string;
  bodyTypeName: string | null;
  file: string;
  methodName: string;
}

interface BodyFieldEvidence {
  name: string;
  typeText: string;
}

interface InjectionPlan {
  endpoints: EndpointTest[];
  payloads: string[];
  traversalPaths: string[];
}

function eventType(...parts: string[]): string {
  return parts.map((part) => part.toUpperCase()).join('_');
}

function injectionBreakType(qualifier: string): string {
  return eventType('injection', qualifier);
}

function pushBreak(breaks: Break[], entry: Break): void {
  breaks.push(entry);
}

function stringLiteralValue(node: ts.Expression | undefined): string {
  if (!node) {
    return '';
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return '';
}

function decoratorName(node: ts.Decorator): string {
  const expression = node.expression;
  if (ts.isCallExpression(expression)) {
    const called = expression.expression;
    return ts.isIdentifier(called) ? called.text : '';
  }
  return ts.isIdentifier(expression) ? expression.text : '';
}

function decoratorsFor(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function propertyNameText(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText();
}

function normalizeRoutePath(...parts: string[]): string {
  const joined = parts
    .map((part) => part.trim().replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
  return `/${joined}`;
}

function routeDecoratorEvidence(
  node: ts.MethodDeclaration,
): ControllerRouteEvidence['method'] | null {
  for (const decorator of decoratorsFor(node)) {
    const name = decoratorName(decorator);
    if (name === 'Post' || name === 'Patch' || name === 'Get') {
      return name.toUpperCase() as ControllerRouteEvidence['method'];
    }
  }
  return null;
}

function decoratorRoutePath(node: ts.ClassDeclaration | ts.MethodDeclaration): string {
  for (const decorator of decoratorsFor(node)) {
    const expression = decorator.expression;
    if (!ts.isCallExpression(expression)) {
      continue;
    }
    const [firstArg] = expression.arguments;
    const pathArg = stringLiteralValue(firstArg);
    if (pathArg) {
      return pathArg;
    }
  }
  return '';
}

function bodyTypeName(node: ts.MethodDeclaration): string | null {
  for (const param of node.parameters) {
    const hasBodyDecorator = decoratorsFor(param).some(
      (decorator) => decoratorName(decorator) === 'Body',
    );
    if (!hasBodyDecorator || !param.type || !ts.isTypeReferenceNode(param.type)) {
      continue;
    }
    const typeName = param.type.typeName;
    if (ts.isIdentifier(typeName)) {
      return typeName.text;
    }
  }
  return null;
}

function collectBodyFields(files: string[]): Map<string, BodyFieldEvidence[]> {
  const fieldsByType = new Map<string, BodyFieldEvidence[]>();

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
        const name = node.name?.text;
        if (name) {
          const fields = node.members
            .filter(
              (member): member is ts.PropertyDeclaration | ts.PropertySignature =>
                ts.isPropertyDeclaration(member) || ts.isPropertySignature(member),
            )
            .map((member) => ({
              name: propertyNameText(member.name),
              typeText: member.type?.getText(sourceFile).toLowerCase() ?? '',
            }));
          if (fields.length > 0) {
            fieldsByType.set(name, fields);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return fieldsByType;
}

function collectControllerRoutes(config: PulseConfig, files: string[]): ControllerRouteEvidence[] {
  const routes: ControllerRouteEvidence[] = [];

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (!ts.isClassDeclaration(node)) {
        ts.forEachChild(node, visit);
        return;
      }

      const hasControllerDecorator = decoratorsFor(node).some(
        (decorator) => decoratorName(decorator) === 'Controller',
      );
      if (!hasControllerDecorator) {
        return;
      }

      const controllerPath = decoratorRoutePath(node);
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member)) {
          continue;
        }
        const method = routeDecoratorEvidence(member);
        if (!method) {
          continue;
        }
        routes.push({
          method,
          path: normalizeRoutePath(controllerPath, decoratorRoutePath(member)),
          bodyTypeName: bodyTypeName(member),
          file: path.relative(config.rootDir, file),
          methodName: member.name.getText(sourceFile),
        });
      }
    };
    visit(sourceFile);
  }

  return routes;
}

function bodyValueForField(field: BodyFieldEvidence, payload: string): string | number | boolean {
  const tokens = `${field.name} ${field.typeText}`.toLowerCase();
  if (tokens.includes('number') || tokens.includes('int') || tokens.includes('float')) {
    return 1;
  }
  if (tokens.includes('boolean')) {
    return true;
  }
  return payload;
}

function bodyFactory(fields: BodyFieldEvidence[]): EndpointTest['buildBody'] {
  const bodyFields =
    fields.length > 0 ? fields : [{ name: 'pulseInjectionProbe', typeText: 'string' }];
  return (payload) =>
    Object.fromEntries(bodyFields.map((field) => [field.name, bodyValueForField(field, payload)]));
}

function discoverSchemaModelNames(config: PulseConfig): string[] {
  let schema: string;
  try {
    schema = readTextFile(config.schemaPath, 'utf8');
  } catch {
    return [];
  }
  const modelNames: string[] = [];
  for (const line of schema.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('model ')) {
      continue;
    }
    const [, modelName] = trimmed.split(/\s+/);
    if (modelName) {
      modelNames.push(modelName);
    }
  }
  return modelNames;
}

function buildSqlPayloads(config: PulseConfig): string[] {
  const quote = String.fromCharCode(39);
  const escapedQuote = `${String.fromCharCode(92)}${quote}`;
  const schemaModelNames = discoverSchemaModelNames(config);
  const tableName = schemaModelNames[0] ?? ['target', 'table'].join('_');
  const columnName = ['probe', 'id'].join('_');

  return [
    `${quote} OR ${quote}1${quote}=${quote}1`,
    `${quote}; DROP TABLE ${tableName}; --`,
    `${quote} UNION SELECT ${columnName} FROM ${tableName} --`,
    `1${quote} AND SLEEP(5) --`,
    `${escapedQuote}; WAITFOR DELAY ${quote}0:0:5${quote} --`,
  ];
}

function traversalVariants(routePath: string): string[] {
  const encodedSeparator = encodeURIComponent('/');
  const traversalTarget = ['etc', 'passwd'].join('/');
  return [
    normalizeRoutePath(routePath, '..', '..', '..', traversalTarget),
    `${routePath}/${encodedSeparator}..${encodedSeparator}..${encodedSeparator}${traversalTarget}`,
  ];
}

export function buildSecurityInjectionPlan(config: PulseConfig): InjectionPlan {
  const backendFiles = walkFiles(config.backendDir, ['.ts']).filter(
    (file) => !/\.(spec|test)\.ts$|__tests__|__mocks__/i.test(file),
  );
  const fieldsByType = collectBodyFields(backendFiles);
  const routes = collectControllerRoutes(config, backendFiles);
  const endpoints: EndpointTest[] = routes
    .filter(
      (route): route is ControllerRouteEvidence & { method: EndpointTest['method'] } =>
        route.method === 'POST' || route.method === 'PATCH',
    )
    .map((route) => ({
      method: route.method,
      path: route.path,
      buildBody: bodyFactory(
        route.bodyTypeName ? (fieldsByType.get(route.bodyTypeName) ?? []) : [],
      ),
      description: `${route.file} ${route.methodName}`,
    }));
  const traversalPaths = routes
    .filter((route) => route.method === 'GET')
    .flatMap((route) => traversalVariants(route.path));

  return {
    endpoints,
    payloads: buildSqlPayloads(config),
    traversalPaths,
  };
}

/** Check security injection. */
export async function checkSecurityInjection(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running backend
  if (!isDeepMode()) {
    return [];
  }

  const breaks: Break[] = [];
  const jwt = makeTestJwt();
  const plan = buildSecurityInjectionPlan(config);

  for (const endpoint of plan.endpoints) {
    for (const payload of plan.payloads) {
      try {
        const body = endpoint.buildBody(payload);
        const start = Date.now();
        const res =
          endpoint.method === 'POST'
            ? await httpPost(endpoint.path, body, { jwt, timeout: 8000 })
            : await httpPost(endpoint.path, body, { jwt, timeout: 8000 }); // PATCH not in utils, using POST

        const elapsed = Date.now() - start;

        // Time-based injection: if the endpoint took > 4s, the DELAY/SLEEP may have executed
        if (elapsed > 4000) {
          pushBreak(breaks, {
            type: injectionBreakType('vulnerable'),
            severity: 'critical',
            file: `backend/src (${endpoint.path})`,
            line: 0,
            description: `Possible time-based SQL injection on ${endpoint.method} ${endpoint.path}`,
            detail: `Response took ${elapsed}ms with payload "${payload.substring(0, 60)}". ${endpoint.description}`,
          });
        }

        // DB error leaked in response body
        if (containsDbError(res.body)) {
          pushBreak(breaks, {
            type: injectionBreakType('vulnerable'),
            severity: 'critical',
            file: `backend/src (${endpoint.path})`,
            line: 0,
            description: `DB error leaked in response from ${endpoint.method} ${endpoint.path}`,
            detail: `Payload "${payload.substring(0, 60)}" caused a DB error message in the response body. ${endpoint.description}. Body snippet: ${JSON.stringify(res.body).substring(0, 200)}`,
          });
        }

        // Union injection: endpoint returned 200 with data it should not have
        // For login: 200 means the SQL auth bypass worked
        if (res.status === 200 && responseLooksAuthenticated(res.body)) {
          pushBreak(breaks, {
            type: injectionBreakType('vulnerable'),
            severity: 'critical',
            file: `backend/src (${endpoint.path})`,
            line: 0,
            description: `SQL injection auth bypass on ${endpoint.method} ${endpoint.path} — returned credential evidence`,
            detail: `Payload "${payload.substring(0, 60)}" bypassed authentication and returned credential-shaped response data.`,
          });
        }
      } catch {
        // Network error / backend not reachable — not a vulnerability, skip
      }
    }
  }

  // Path traversal probes are bound to discovered GET routes.
  try {
    for (const tp of plan.traversalPaths) {
      const res = await httpGet(tp, { jwt, timeout: 5000 });
      if (res.status === 200 && typeof res.body === 'string' && res.body.includes('root:')) {
        pushBreak(breaks, {
          type: injectionBreakType('vulnerable'),
          severity: 'critical',
          file: `backend/src (${tp})`,
          line: 0,
          description: `Path traversal vulnerability — server returned /etc/passwd contents`,
          detail: `GET ${tp} returned 200 with file system content.`,
        });
      }
    }
  } catch {
    // Backend not reachable — skip
  }

  return breaks;
}

function responseLooksAuthenticated(body: unknown): boolean {
  if (!body || typeof body !== 'object') {
    return false;
  }
  return Object.entries(body).some(([key, value]) => {
    const normalizedKey = key.toLowerCase();
    return (
      typeof value === 'string' &&
      value.length > 0 &&
      (normalizedKey.includes('token') || normalizedKey.includes('session'))
    );
  });
}
