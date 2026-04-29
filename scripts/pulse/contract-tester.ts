/**
 * PULSE Contract Testing & Schema Diff Engine
 *
 * Validates external provider API contracts against expected schemas, detects
 * breaking changes in the internal API surface by comparing against a previous
 * structural snapshot, and assesses Prisma migration safety for destructive
 * database operations.
 *
 * Artifact stored at: .pulse/current/PULSE_CONTRACT_EVIDENCE.json
 */

import * as path from 'path';
import * as fs from 'node:fs';
import type { Dirent } from 'fs';
import type {
  ContractProvider,
  ContractStatus,
  ContractTestEvidence,
  MigrationSafetyCheck,
  ProviderContract,
  SchemaDiff,
  SchemaDiffSeverity,
} from './types.contract-tester';
import type { PulseStructuralGraph } from './types';
import { ensureDir, pathExists, readDir, readTextFile } from './safe-fs';
import { safeJoin } from './lib/safe-path';
import { walkFiles } from './parsers/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANONICAL_ARTIFACT_FILENAME = 'PULSE_CONTRACT_EVIDENCE.json';

const MIGRATIONS_DIRS = ['backend/prisma/migrations', 'prisma/migrations'];

const HTTP_METHOD_PATTERN = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/;

const IGNORE_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  '.git',
  'coverage',
  '__tests__',
  '__mocks__',
  '.turbo',
  '.vercel',
]);

// ---------------------------------------------------------------------------
// SQL parsing matchers for destructive migration operations
// ---------------------------------------------------------------------------

const DROP_TABLE_RE = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?[`"]?(\w+)[`"]?/gi;
const DROP_COLUMN_RE = /DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?[`"]?(\w+)[`"]?/gi;
const ALTER_COLUMN_TYPE_RE =
  /ALTER\s+COLUMN\s+[`"]?(\w+)[`"]?\s+(?:SET\s+DATA\s+)?TYPE\s+(\w+(?:\s*\(\s*\d+\s*(?:,\s*\d+\s*)?\))?)/gi;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Builds the complete contract testing evidence payload: identifies provider
 * contracts from codebase usage, diffs the internal API surface against the
 * last structural snapshot, and checks all pending Prisma migrations for
 * destructive operations.
 *
 * @param rootDir  Absolute path to the repository root.
 * @returns        Structured contract testing evidence.
 */
export function buildContractTestEvidence(rootDir: string): ContractTestEvidence {
  const contracts = defineProviderContracts(rootDir);
  const schemaDiffs = checkAPISchemaDiff(rootDir);
  const migrationChecks = checkMigrationSafety(rootDir);

  const totalContracts = contracts.length;
  const validContracts = contracts.filter((c) => c.status === 'valid').length;
  const brokenContracts = contracts.filter((c) => c.status === 'broken').length;
  const untestedContracts = contracts.filter((c) => c.status === 'untested').length;
  const breakingChanges = schemaDiffs.filter((d) => d.severity === 'breaking').length;
  const destructiveMigrations = migrationChecks.filter((m) => m.destructive).length;

  const evidence: ContractTestEvidence = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalContracts,
      validContracts,
      brokenContracts,
      untestedContracts,
      breakingChanges,
      destructiveMigrations,
    },
    contracts,
    schemaDiffs,
    migrationChecks,
  };

  const evidenceDir = safeJoin(rootDir, '.pulse', 'current');
  const artifactPath = safeJoin(evidenceDir, CANONICAL_ARTIFACT_FILENAME);
  ensureDir(evidenceDir, { recursive: true });
  fs.writeFileSync(artifactPath, JSON.stringify(evidence, null, 2));

  return evidence;
}

// ---------------------------------------------------------------------------
// Provider contract discovery
// ---------------------------------------------------------------------------

/**
 * Scans the backend source tree for `fetch(` and `axios.post(` calls targeting
 * known external provider URLs. Builds a contract entry for each discovered
 * endpoint, enriching it with the baseline expected schema when available.
 *
 * Contracts for which no codebase usage is found are still emitted with an
 * "untested" status so operators can see the full expected surface area.
 *
 * @param rootDir  Absolute path to the repository root.
 * @returns        List of provider contracts with validation status.
 */
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

function findBackendDir(rootDir: string): string | null {
  const candidates = ['backend/src', 'server/src', 'api/src', 'src'];
  for (const candidate of candidates) {
    const full = safeJoin(rootDir, candidate);
    if (pathExists(full)) {
      return full;
    }
  }
  return null;
}

interface RawEndpointCall {
  endpoint: string;
  method: string;
  filePath: string;
}

function extractEndpointCalls(content: string, filePath: string): ProviderContract[] {
  const results: ProviderContract[] = [];
  const callPatterns = [
    /fetch\s*\(\s*`([^`]+)`/g,
    /fetch\s*\(\s*['"]([^'"]+)['"]/g,
    /axios\.post\s*\(\s*`([^`]+)`/g,
    /axios\.post\s*\(\s*['"]([^'"]+)['"]/g,
    /axios\.(get|put|delete|patch)\s*\(\s*`([^`]+)`/g,
    /axios\.(get|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g,
  ];

  const seen = new Set<string>();

  for (const pattern of callPatterns) {
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(content)) !== null) {
      const url =
        match[2] && match[1]
          ? match[2] // axios.method(url)
          : match[1]; // fetch(url) or axios.post(url)

      if (!url) continue;

      const provider = providerFromUrl(url);
      if (!provider) continue;

      const method = extractMethod(content, match);
      const normalized = normalizeEndpoint(url, provider);

      const key = `${method} ${normalized}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        provider,
        endpoint: normalized,
        method,
        expectedRequestSchema: {},
        expectedResponseSchema: {},
        expectedHeaders: inferExpectedHeaders(content, url),
        authType: inferAuthType(content, url),
        status: 'unknown',
        lastValidated: null,
        issues: ['No executed contract evidence found for discovered endpoint'],
      });
    }
  }

  return results;
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

function extractMethod(content: string, match: RegExpExecArray): string {
  // axios.method(url) pattern
  if (match[2] && match[1] && /^(get|put|delete|patch)$/i.test(match[1])) {
    return match[1].toUpperCase();
  }
  if (/post/i.test(match[0])) return 'POST';

  // Try to find method declaration near the call
  const pos = match.index;
  const before = content.slice(Math.max(0, pos - 80), pos);
  const methodMatch = before.match(HTTP_METHOD_PATTERN);
  if (methodMatch) return methodMatch[1].toUpperCase();

  return 'POST';
}

function normalizeEndpoint(raw: string, _provider: ContractProvider): string {
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

function inferExpectedHeaders(content: string, url: string): string[] {
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

function inferAuthType(content: string, url: string): ProviderContract['authType'] {
  const context = surroundingText(content, url, 500);
  if (/signature|x-hub|x-signature/i.test(context)) return 'webhook_signature';
  if (/Bearer\s+|Authorization/i.test(context)) return 'bearer';
  if (/api[-_]?key|access[-_]?token|secret/i.test(context)) return 'api_key';
  if (/oauth/i.test(context)) return 'oauth2';
  return 'none';
}

function surroundingText(content: string, needle: string, radius: number): string {
  const index = content.indexOf(needle);
  if (index < 0) return '';
  return content.slice(
    Math.max(0, index - radius),
    Math.min(content.length, index + needle.length + radius),
  );
}

function extractInternalAPIContracts(rootDir: string): ProviderContract[] {
  const contracts: ProviderContract[] = [];
  const files = walkFiles(rootDir, ['.ts']);

  const routePattern =
    /@(?:Get|Post|Put|Patch|Delete)\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*(?:\)\s*)?/g;

  const seen = new Set<string>();

  for (const filePath of files) {
    let content: string;
    try {
      content = readTextFile(filePath, 'utf8');
    } catch {
      continue;
    }

    let match: RegExpExecArray | null;
    routePattern.lastIndex = 0;
    while ((match = routePattern.exec(content)) !== null) {
      const route = normalizeRoute(String(match[1] || ''));
      const method = match[0].match(/@(\w+)/)?.[1]?.toUpperCase() ?? 'GET';

      // Derive the controller prefix from the @Controller decorator in the same file
      const controllerMatch = content.match(/@Controller\s*\(\s*['"`]([^'"`]*)['"`]\s*\)/);
      const prefix = controllerMatch ? normalizeRoute(controllerMatch[1]) : '';

      const fullRoute = prefix + (route.startsWith('/') || prefix.endsWith('/') ? '' : '/') + route;
      const normalized = normalizeRoute(fullRoute);

      const key = `${method} ${normalized}`;
      if (seen.has(key)) continue;
      seen.add(key);

      contracts.push({
        provider: 'internal_api',
        endpoint: normalized,
        method,
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

function normalizeRoute(route: string): string {
  return (
    String(route || '')
      .trim()
      .replace(/\/+/g, '/')
      .replace(/\/$/, '') || '/'
  );
}

// ---------------------------------------------------------------------------
// API schema diff detection
// ---------------------------------------------------------------------------

/**
 * Compares the current backend API surface (extracted from the structural
 * graph artifact) against the previous contract evidence snapshot loaded from
 * disk. Detects removed, added, or changed endpoints.
 *
 * @param rootDir  Absolute path to the repository root.
 * @returns        List of schema diffs between current and previous snapshots.
 */
export function checkAPISchemaDiff(rootDir: string): SchemaDiff[] {
  const diffs: SchemaDiff[] = [];
  const currentEndpoints = loadCurrentEndpoints(rootDir);
  const previousEvidence = loadPreviousContractEvidence(rootDir);

  if (!previousEvidence || previousEvidence.contracts.length === 0) {
    // No previous snapshot — all current endpoints are additions
    const internal = currentEndpoints.filter((e) => isInternalEndpoint(e.endpoint));
    for (const endpoint of internal) {
      const key = `${endpoint.method} ${endpoint.endpoint}`;
      diffs.push({
        endpoint: key,
        severity: 'addition',
        field: 'endpoint',
        before: null,
        after: endpoint.method,
        description: `New endpoint discovered: ${key}`,
      });
    }
    return diffs;
  }

  const previousInternal = previousEvidence.contracts.filter((c) => c.provider === 'internal_api');

  const prevKeys = new Set(previousInternal.map((c) => `${c.method} ${c.endpoint}`));
  const currKeys = new Set(currentEndpoints.map((e) => `${e.method} ${e.endpoint}`));

  // Detect removed endpoints
  for (const key of prevKeys) {
    if (!currKeys.has(key)) {
      diffs.push({
        endpoint: key,
        severity: 'breaking',
        field: 'endpoint',
        before: key,
        after: null,
        description: `Endpoint removed: ${key} was present in the previous snapshot`,
      });
    }
  }

  // Detect added endpoints
  for (const key of currKeys) {
    if (!prevKeys.has(key)) {
      diffs.push({
        endpoint: key,
        severity: 'addition',
        field: 'endpoint',
        before: null,
        after: key,
        description: `New endpoint added: ${key}`,
      });
    }
  }

  return diffs;
}

interface EndpointDescriptor {
  method: string;
  endpoint: string;
}

function loadCurrentEndpoints(rootDir: string): EndpointDescriptor[] {
  const structuralPath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_STRUCTURAL_GRAPH.json');

  if (pathExists(structuralPath)) {
    try {
      const raw = readTextFile(structuralPath, 'utf-8');
      const graph: PulseStructuralGraph = JSON.parse(raw);
      const endpoints: EndpointDescriptor[] = [];

      for (const node of graph.nodes) {
        if (node.kind === 'backend_route' || node.kind === 'proxy_route') {
          const method = extractNodeHttpMethod(node);
          const route = extractNodeRoute(node);
          if (method && route) {
            endpoints.push({ method, endpoint: normalizeRoute(route) });
          }
        }
      }

      return endpoints;
    } catch {
      // Fall through to source scanning
    }
  }

  return scanEndpointsFromSource(rootDir);
}

function extractNodeHttpMethod(node: {
  metadata: Record<string, unknown>;
  label?: string;
}): string | null {
  const metaMethod = node.metadata['method'];
  if (typeof metaMethod === 'string') return metaMethod.toUpperCase();

  const metaHttp = node.metadata['httpMethod'];
  if (typeof metaHttp === 'string') return metaHttp.toUpperCase();

  const metaVerb = node.metadata['httpVerb'];
  if (typeof metaVerb === 'string') return metaVerb.toUpperCase();

  const label = node.label ?? '';
  const match = label.match(/^(?:GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD|ALL)\b/i);
  if (match) return match[0].toUpperCase();

  return null;
}

function extractNodeRoute(node: {
  metadata: Record<string, unknown>;
  label?: string;
}): string | null {
  const metaRoute = node.metadata['route'];
  if (typeof metaRoute === 'string') return metaRoute;

  const metaPath = node.metadata['path'];
  if (typeof metaPath === 'string') return metaPath;

  const metaFullPath = node.metadata['fullPath'];
  if (typeof metaFullPath === 'string') return metaFullPath;

  const label = node.label ?? '';
  const match = label.match(/^(?:GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD|ALL)\s+(\S+)/i);
  if (match) return match[1];

  return null;
}

function scanEndpointsFromSource(rootDir: string): EndpointDescriptor[] {
  const backendDir = findBackendDir(rootDir);
  if (!backendDir) return [];

  const endpoints: EndpointDescriptor[] = [];
  const files = walkFiles(backendDir, ['.ts']);
  const seen = new Set<string>();

  const routePattern = /@(?:Get|Post|Put|Patch|Delete)\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;

  for (const filePath of files) {
    let content: string;
    try {
      content = readTextFile(filePath, 'utf8');
    } catch {
      continue;
    }

    const controllerMatch = content.match(/@Controller\s*\(\s*['"`]([^'"`]*)['"`]\s*\)/);
    const prefix = controllerMatch ? normalizeRoute(controllerMatch[1]) : '';

    let match: RegExpExecArray | null;
    routePattern.lastIndex = 0;
    while ((match = routePattern.exec(content)) !== null) {
      const methodDec = match[0].match(/@(\w+)/);
      const method = methodDec ? methodDec[1].toUpperCase() : 'GET';
      const routePart = normalizeRoute(String(match[1] || ''));

      const fullRoute =
        prefix + (routePart.startsWith('/') || prefix.endsWith('/') ? '' : '/') + routePart;
      const normalized = normalizeRoute(fullRoute);

      const key = `${method} ${normalized}`;
      if (seen.has(key)) continue;
      seen.add(key);

      endpoints.push({ method, endpoint: normalized });
    }
  }

  return endpoints;
}

function loadPreviousContractEvidence(rootDir: string): ContractTestEvidence | null {
  const evidencePath = safeJoin(rootDir, '.pulse', 'current', CANONICAL_ARTIFACT_FILENAME);
  if (!pathExists(evidencePath)) return null;

  try {
    const raw = readTextFile(evidencePath, 'utf-8');
    return JSON.parse(raw) as ContractTestEvidence;
  } catch {
    return null;
  }
}

export function isInternalEndpoint(endpoint: string): boolean {
  const normalized = normalizeRoute(endpoint);
  if (normalized === '/') return true;
  if (/^https?:\/\//i.test(normalized) || normalized.startsWith('//')) return false;
  return normalized.startsWith('/');
}

// ---------------------------------------------------------------------------
// Migration safety checking
// ---------------------------------------------------------------------------

/**
 * Reads all Prisma migration SQL files and flags destructive operations
 * such as DROP TABLE, DROP COLUMN, and ALTER COLUMN ... TYPE changes.
 *
 * @param rootDir  Absolute path to the repository root.
 * @returns        Safety assessments for each migration found.
 */
export function checkMigrationSafety(rootDir: string): MigrationSafetyCheck[] {
  const results: MigrationSafetyCheck[] = [];
  const migrationsDir = findMigrationsDir(rootDir);

  if (!migrationsDir) return results;

  let entries: (string | Dirent)[];
  try {
    entries = readDir(migrationsDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (typeof entry === 'string') continue;
    if (!entry.isDirectory() || IGNORE_DIRS.has(entry.name)) continue;

    const sqlPath = safeJoin(migrationsDir, entry.name, 'migration.sql');
    if (!pathExists(sqlPath)) continue;

    let sqlContent: string;
    try {
      sqlContent = readTextFile(sqlPath, 'utf-8');
    } catch {
      continue;
    }

    const check = parseMigrationSql(entry.name, sqlContent);
    results.push(check);
  }

  return results;
}

function findMigrationsDir(rootDir: string): string | null {
  for (const candidate of MIGRATIONS_DIRS) {
    const full = safeJoin(rootDir, candidate);
    if (pathExists(full)) return full;
  }
  return null;
}

function parseMigrationSql(migrationName: string, sql: string): MigrationSafetyCheck {
  const operations: Array<{ type: string; table: string; column?: string }> = [];
  const warnings: string[] = [];
  let destructive = false;

  // Detect DROP TABLE
  for (const match of sql.matchAll(DROP_TABLE_RE)) {
    const table = match[1];
    operations.push({ type: 'DROP TABLE', table });
    warnings.push(`DROP TABLE "${table}" detected — this is destructive and will cause data loss`);
    destructive = true;
  }

  // Detect DROP COLUMN
  for (const match of sql.matchAll(DROP_COLUMN_RE)) {
    const column = match[1];
    operations.push({ type: 'DROP COLUMN', table: 'unknown', column });
    warnings.push(`DROP COLUMN "${column}" detected — this is destructive and may cause data loss`);
    destructive = true;
  }

  // Detect ALTER COLUMN ... TYPE
  for (const match of sql.matchAll(ALTER_COLUMN_TYPE_RE)) {
    const column = match[1];
    const newType = match[2]?.trim();
    operations.push({ type: 'ALTER COLUMN TYPE', table: 'unknown', column });
    warnings.push(
      `ALTER COLUMN "${column}" TYPE ${newType ?? ''} detected — type changes can be destructive and may cause data corruption`,
    );
    destructive = true;
  }

  // Detect ALTER COLUMN ... SET NOT NULL (may fail on existing nulls)
  const setNotNullRe =
    /ALTER\s+TABLE\s+[`"]?(\w+)[`"]?[\s\S]*?ALTER\s+COLUMN\s+[`"]?(\w+)[`"]?\s+SET\s+NOT\s+NULL/gi;
  for (const match of sql.matchAll(setNotNullRe)) {
    const table = match[1];
    const column = match[2];
    operations.push({ type: 'SET NOT NULL', table, column });
    warnings.push(
      `ALTER COLUMN "${column}" SET NOT NULL on table "${table}" — will fail if any row has null values`,
    );
    destructive = true;
  }

  return {
    migrationName,
    destructive,
    operations,
    warnings,
    safe: !destructive,
  };
}

// ---------------------------------------------------------------------------
// Breaking change classification
// ---------------------------------------------------------------------------

/**
 * Classifies the severity of a detected schema change based on its type and
 * the before/after values.
 *
 * @param change  An object describing the change with `type`, and optional
 *                `before` and `after` values.
 * @returns       The classified severity level.
 */
export function classifyBreakingChange(change: {
  type: string;
  before?: unknown;
  after?: unknown;
}): SchemaDiffSeverity {
  const type = change.type.toLowerCase();

  if (type === 'endpoint_removed' || type === 'removed') {
    return 'breaking';
  }

  if (type === 'type_change' || type === 'type_changed') {
    return 'breaking';
  }

  if (type === 'field_removed') {
    return 'breaking';
  }

  if (type === 'field_required_added' || type === 'required_added') {
    return 'breaking';
  }

  if (type === 'endpoint_added' || type === 'added' || type === 'field_added') {
    if (change.after !== undefined && change.before === null) {
      return 'addition';
    }
  }

  if (type === 'field_optional_added' || type === 'optional_added') {
    return 'non_breaking';
  }

  if (
    type === 'deprecated' ||
    type === 'deprecation' ||
    type === 'marked_deprecated' ||
    (change.before !== undefined && change.after === null)
  ) {
    return 'deprecation';
  }

  return 'non_breaking';
}
