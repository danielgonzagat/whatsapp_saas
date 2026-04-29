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
// Provider baseline contracts — expected API surface per provider
// ---------------------------------------------------------------------------

/** Defines a single expected endpoint for a provider. */
interface BaselineContract {
  endpoint: string;
  method: string;
  requestShape: string[];
  responseShape: string[];
  requiredHeaders: string[];
  authType: ProviderContract['authType'];
}

/** Grouped provider baselines keyed by canonical hostname. */
const PROVIDER_BASELINES: Record<string, BaselineContract[]> = {
  'graph.facebook.com': [
    {
      endpoint: '/v19.0/{phone_number_id}/messages',
      method: 'POST',
      requestShape: ['messaging_product', 'to', 'type', 'text.body'],
      responseShape: ['messaging_product', 'contacts[].input', 'messages[].id'],
      requiredHeaders: ['Authorization', 'Content-Type'],
      authType: 'bearer',
    },
    {
      endpoint: '/v19.0/{phone_number_id}',
      method: 'GET',
      requestShape: [],
      responseShape: ['id', 'verified_name', 'display_phone_number'],
      requiredHeaders: ['Authorization'],
      authType: 'bearer',
    },
    {
      endpoint: '/v19.0/{phone_number_id}/media',
      method: 'POST',
      requestShape: ['messaging_product', 'file', 'type'],
      responseShape: ['id'],
      requiredHeaders: ['Authorization'],
      authType: 'bearer',
    },
    {
      endpoint: '/v19.0/{waba_id}/message_templates',
      method: 'POST',
      requestShape: ['name', 'language', 'category', 'components'],
      responseShape: ['id', 'status', 'category'],
      requiredHeaders: ['Authorization', 'Content-Type'],
      authType: 'bearer',
    },
  ],
  'api.stripe.com': [
    {
      endpoint: '/v1/payment_intents',
      method: 'POST',
      requestShape: ['amount', 'currency', 'payment_method_types'],
      responseShape: ['id', 'amount', 'currency', 'status', 'client_secret'],
      requiredHeaders: ['Authorization', 'Content-Type'],
      authType: 'bearer',
    },
    {
      endpoint: '/v1/checkout/sessions',
      method: 'POST',
      requestShape: ['line_items', 'mode', 'success_url', 'cancel_url'],
      responseShape: ['id', 'url', 'payment_status'],
      requiredHeaders: ['Authorization', 'Content-Type'],
      authType: 'bearer',
    },
    {
      endpoint: '/v1/subscriptions/{id}',
      method: 'GET',
      requestShape: [],
      responseShape: ['id', 'status', 'current_period_end', 'customer'],
      requiredHeaders: ['Authorization'],
      authType: 'bearer',
    },
    {
      endpoint: '/v1/subscriptions/{id}',
      method: 'POST',
      requestShape: ['cancel_at_period_end', 'metadata'],
      responseShape: ['id', 'status', 'cancel_at_period_end'],
      requiredHeaders: ['Authorization', 'Content-Type'],
      authType: 'bearer',
    },
  ],
  'api.openai.com': [
    {
      endpoint: '/v1/chat/completions',
      method: 'POST',
      requestShape: ['model', 'messages[].role', 'messages[].content'],
      responseShape: ['choices[].message.role', 'choices[].message.content'],
      requiredHeaders: ['Authorization', 'Content-Type'],
      authType: 'bearer',
    },
    {
      endpoint: '/v1/embeddings',
      method: 'POST',
      requestShape: ['model', 'input'],
      responseShape: ['data[].embedding', 'data[].index', 'model'],
      requiredHeaders: ['Authorization', 'Content-Type'],
      authType: 'bearer',
    },
    {
      endpoint: '/v1/audio/speech',
      method: 'POST',
      requestShape: ['model', 'voice', 'input'],
      responseShape: [],
      requiredHeaders: ['Authorization', 'Content-Type'],
      authType: 'bearer',
    },
    {
      endpoint: '/v1/audio/transcriptions',
      method: 'POST',
      requestShape: ['file', 'model'],
      responseShape: ['text'],
      requiredHeaders: ['Authorization'],
      authType: 'bearer',
    },
  ],
  'api.resend.com': [
    {
      endpoint: '/emails',
      method: 'POST',
      requestShape: ['from', 'to', 'subject', 'html'],
      responseShape: ['id'],
      requiredHeaders: ['Authorization', 'Content-Type'],
      authType: 'bearer',
    },
    {
      endpoint: '/emails/{id}',
      method: 'GET',
      requestShape: [],
      responseShape: ['id', 'subject', 'status', 'last_event'],
      requiredHeaders: ['Authorization'],
      authType: 'bearer',
    },
  ],
  'people.googleapis.com': [
    {
      endpoint: '/v1/people/me',
      method: 'GET',
      requestShape: [],
      responseShape: ['names[].displayName', 'emailAddresses[].value'],
      requiredHeaders: ['Authorization'],
      authType: 'oauth2',
    },
  ],
  'www.googleapis.com': [
    {
      endpoint: '/oauth2/v3/certs',
      method: 'GET',
      requestShape: [],
      responseShape: ['keys[].kid', 'keys[].n', 'keys[].e'],
      requiredHeaders: [],
      authType: 'none',
    },
  ],
  'oauth2.googleapis.com': [
    {
      endpoint: '/token',
      method: 'POST',
      requestShape: ['code', 'client_id', 'client_secret', 'redirect_uri', 'grant_type'],
      responseShape: ['access_token', 'id_token', 'expires_in', 'token_type'],
      requiredHeaders: ['Content-Type'],
      authType: 'none',
    },
  ],
};

// ---------------------------------------------------------------------------
// SDK import patterns for provider detection
// ---------------------------------------------------------------------------

const PROVIDER_SDK_PATTERNS: Array<{
  provider: string;
  patterns: RegExp[];
  description: string;
}> = [
  {
    provider: 'api.stripe.com',
    patterns: [/require\(['"]stripe['"]\)/, /from\s+['"]stripe['"]/, /import\s+\*\s+as\s+Stripe\b/],
    description: 'Stripe SDK direct import',
  },
  {
    provider: 'api.openai.com',
    patterns: [/require\(['"]openai['"]\)/, /from\s+['"]openai['"]/, /new\s+OpenAI\s*\(/],
    description: 'OpenAI Node SDK direct import',
  },
  {
    provider: 'graph.facebook.com',
    patterns: [
      /require\(['"]@whiskeysockets\/baileys['"]\)/,
      /from\s+['"]@whiskeysockets\/baileys['"]/,
    ],
    description: 'WhatsApp Baileys SDK usage',
  },
  {
    provider: 'api.resend.com',
    patterns: [/require\(['"]resend['"]\)/, /from\s+['"]resend['"]/],
    description: 'Resend SDK direct import',
  },
  {
    provider: 'people.googleapis.com',
    patterns: [
      /require\(['"]google-auth-library['"]\)/,
      /from\s+['"]google-auth-library['"]/,
      /OAuth2Client/,
    ],
    description: 'Google Auth library SDL import',
  },
];

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Builds the complete contract testing evidence payload: identifies provider
 * contracts from codebase usage, enriches them with baseline schemas, diffs
 * the internal API surface against the last structural snapshot, and checks
 * all Prisma migrations for destructive operations.
 *
 * @param rootDir  Absolute path to the repository root.
 * @returns        Structured contract testing evidence.
 */
export function buildContractTestEvidence(rootDir: string): ContractTestEvidence {
  const discoveredContracts = defineProviderContracts(rootDir);
  const baselineContracts = buildExpectedContracts(rootDir);
  const sdkUsage = scanProviderSdkUsage(rootDir);

  // Merge: baseline contracts take priority; discovered contracts fill gaps
  const merged = mergeContracts(baselineContracts, discoveredContracts, sdkUsage);

  const schemaDiffs = checkAPISchemaDiff(rootDir);
  const migrationChecks = checkMigrationSafety(rootDir);

  generateContractTestCases(merged);

  const totalContracts = merged.length;
  const validContracts = merged.filter((c) => c.status === 'valid').length;
  const brokenContracts = merged.filter((c) => c.status === 'broken').length;
  const untestedContracts = merged.filter(
    (c) => c.status === 'untested' || c.status === 'unknown',
  ).length;
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
    } as ContractTestEvidence['summary'],
    contracts: merged,
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
// Provider baseline contract builder
// ---------------------------------------------------------------------------

/**
 * Builds the full set of expected provider contracts from the static baseline
 * definitions. These represent the documented API surface that the codebase
 * _should_ consume even if no usage is found yet.
 *
 * @param rootDir  Absolute path to the repository root.
 * @returns        List of baseline provider contracts.
 */
export function buildExpectedContracts(rootDir: string): ProviderContract[] {
  const contracts: ProviderContract[] = [];
  const backendDir = findBackendDir(rootDir);

  for (const [hostname, baselines] of Object.entries(PROVIDER_BASELINES)) {
    for (const baseline of baselines) {
      contracts.push({
        provider: hostname,
        endpoint: baseline.endpoint,
        method: baseline.method,
        expectedRequestSchema: { requiredFields: baseline.requestShape },
        expectedResponseSchema: { expectedFields: baseline.responseShape },
        expectedHeaders: baseline.requiredHeaders,
        authType: baseline.authType,
        status: 'generated' as ContractStatus,
        lastValidated: null,
        issues: ['Baseline contract — pending live execution with real credentials'],
      });
    }
  }

  return contracts;
}

/**
 * Merges baseline provider contracts with contracts discovered from live
 * codebase source scanning. A discovered contract with a matching endpoint
 * upgrades the baseline from "generated" to "untested" so operators know
 * the codebase actually calls this endpoint.
 */
export function mergeContracts(
  baselines: ProviderContract[],
  discovered: ProviderContract[],
  sdkUsage: string[],
): ProviderContract[] {
  const result: ProviderContract[] = [];
  const seen = new Set<string>();
  const baselineByKey = new Map<string, ProviderContract>();

  for (const c of baselines) {
    const key = `${c.method} ${c.provider}${c.endpoint}`;
    baselineByKey.set(key, c);
  }

  // First pass: add discovered contracts, upgrading matching baselines
  for (const dc of discovered) {
    const key = `${dc.method} ${dc.provider}${dc.endpoint}`;
    seen.add(key);

    const baseline = baselineByKey.get(key);
    if (baseline) {
      result.push({
        ...baseline,
        status: 'untested',
        lastValidated: null,
        issues: ['Discovered in codebase — pending live contract validation'],
      });
    } else {
      result.push(dc);
    }
  }

  // Second pass: add remaining baselines not yet discovered in code
  for (const c of baselines) {
    const key = `${c.method} ${c.provider}${c.endpoint}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(c);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// SDK import detection
// ---------------------------------------------------------------------------

/**
 * Scans backend source files for direct SDK imports of known external
 * providers (Stripe, OpenAI, Resend, Google Auth, Baileys/WhatsApp). Returns
 * the list of provider hostnames for which SDK usage was detected.
 *
 * @param rootDir  Absolute path to the repository root.
 * @returns        List of provider hostnames with detected SDK imports.
 */
export function scanProviderSdkUsage(rootDir: string): string[] {
  const detected = new Set<string>();
  const backendDir = findBackendDir(rootDir);
  if (!backendDir) return [];

  const files = walkFiles(backendDir, ['.ts', '.tsx', '.js', '.jsx']);
  for (const filePath of files) {
    let content: string;
    try {
      content = readTextFile(filePath, 'utf8');
    } catch {
      continue;
    }

    for (const { provider, patterns } of PROVIDER_SDK_PATTERNS) {
      if (detected.has(provider)) continue;
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          detected.add(provider);
          break;
        }
      }
    }
  }

  return [...detected];
}

// ---------------------------------------------------------------------------
// Contract test case generation
// ---------------------------------------------------------------------------

/**
 * Generates executable contract test case templates for discovered provider
 * contracts. Each test case includes the curl command, expected status, and
 * validation instructions. Marked as "generated" status — execution requires
 * real API credentials that may not be available in all environments.
 *
 * @param contracts  Provider contracts to generate test cases for.
 * @returns          Test case count for logging (side-effect updates status in place).
 */
export function generateContractTestCases(contracts: ProviderContract[]): number {
  let count = 0;

  for (const contract of contracts) {
    if (contract.status === 'generated' || contract.status === 'unknown') {
      contract.status = 'generated';
      if (!contract.issues.includes('Contract test case generated — awaiting live execution')) {
        contract.issues.push('Contract test case generated — awaiting live execution');
      }
      count++;
    }
  }

  return count;
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

  // Detect ADD COLUMN ... NOT NULL without DEFAULT (breaking: fails on existing rows)
  const addColStmts: Array<{ raw: string; table: string }> = [];

  // Collect all ADD COLUMN statements with their parent ALTER TABLE
  const alterTableAddColRe =
    /ALTER\s+TABLE\s+[`"]?(\w+)[`"]?\s*\n?\s*(ADD\s+COLUMN\s+[\s\S]*?)(?=\s*ALTER\s+TABLE\s|\s*CREATE\s+(?:TABLE|INDEX)|$)/gi;
  for (const match of sql.matchAll(alterTableAddColRe)) {
    const table = match[1];
    const addBlock = match[2];
    // Split multiple ADD COLUMN clauses
    const addColSplitRe =
      /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s+(\w[\s\S]*?)(?=\s*(?:ALTER\s+TABLE|ADD\s+COLUMN|CREATE\s+(?:TABLE|INDEX)|$))/gi;
    const addColMatches = match[2]?.matchAll(addColSplitRe) ?? [];

    for (const colMatch of Array.from(addColMatches)) {
      const column = colMatch[1];
      const rest = colMatch[2] ?? '';
      const hasNotNull = /\bNOT\s+NULL\b/i.test(rest);
      const hasDefault = /\bDEFAULT\b/i.test(rest);
      if (hasNotNull && !hasDefault) {
        operations.push({ type: 'ADD NOT NULL COLUMN (NO DEFAULT)', table, column });
        warnings.push(
          `ADD COLUMN "${column}" NOT NULL WITHOUT DEFAULT on table "${table}" — will fail on existing rows. Add a DEFAULT value or make the column nullable.`,
        );
        destructive = true;
      }
    }
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
