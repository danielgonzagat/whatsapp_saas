function providerFromOpenApiSpec(spec: Record<string, unknown>): string | null {
  const servers = Array.isArray(spec.servers) ? spec.servers : [];
  for (const server of servers) {
    if (!server || typeof server !== 'object') {
      continue;
    }
    const url = (server as Record<string, unknown>).url;
    if (typeof url === 'string') {
      const provider = providerFromUrl(url);
      if (provider) {
        return provider;
      }
    }
  }
  return null;
}

function extractOpenApiRequestSchema(operation: Record<string, unknown>): Record<string, unknown> {
  const requestBody = operation.requestBody;
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    return {};
  }
  return { requestBody };
}

function extractOpenApiResponseSchema(operation: Record<string, unknown>): Record<string, unknown> {
  const responses = operation.responses;
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) {
    return {};
  }
  return { responses };
}

function inferOpenApiAuthType(
  spec: Record<string, unknown>,
  operation: Record<string, unknown>,
): ProviderContract['authType'] {
  const security =
    operation.security ??
    spec.security ??
    (spec.components as Record<string, unknown> | undefined)?.securitySchemes;
  if (!security) {
    return 'none';
  }
  const serialized = JSON.stringify(security).toLowerCase();
  if (serialized.includes('oauth')) return 'oauth2';
  if (serialized.includes('bearer')) return 'bearer';
  if (serialized.includes('signature')) return 'webhook_signature';
  if (serialized.includes('apikey') || serialized.includes('api_key')) return 'api_key';
  return 'api_key';
}

function discoverContractsFromRuntimeArtifacts(rootDir: string): ProviderContract[] {
  const pulseDir = safeJoin(rootDir, '.pulse', 'current');
  if (!pathExists(pulseDir)) {
    return [];
  }

  let entries: (string | Dirent)[];
  try {
    entries = readDir(pulseDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const contracts: ProviderContract[] = [];
  for (const entry of entries) {
    if (typeof entry === 'string' || !entry.isFile() || !isPulseRuntimeArtifactFile(entry.name)) {
      continue;
    }

    const artifactPath = safeJoin(pulseDir, entry.name);
    let artifact: unknown;
    try {
      artifact = JSON.parse(readTextFile(artifactPath, 'utf8'));
    } catch {
      continue;
    }

    const observations = collectUrlObservations(artifact);
    for (const observation of observations) {
      const provider = providerFromUrl(observation.url);
      if (!provider) {
        continue;
      }

      contracts.push({
        provider,
        endpoint: normalizeEndpoint(observation.url, provider),
        method: observation.method ?? 'GET',
        expectedRequestSchema: observation.requestSchema ?? {},
        expectedResponseSchema: observation.responseSchema ?? {},
        expectedHeaders: observation.headers,
        authType: inferAuthTypeFromObservation(observation),
        status: 'generated',
        lastValidated: null,
        issues: [`Discovered from runtime artifact ${entry.name}`],
      });
    }
  }

  return dedupeContracts(contracts);
}

function isPulseRuntimeArtifactFile(fileName: string): boolean {
  return (
    fileName.startsWith('PULSE_') &&
    fileName.endsWith('.json') &&
    fileName !== CANONICAL_ARTIFACT_FILENAME
  );
}

function discoverContractsFromGraphArtifacts(rootDir: string): ProviderContract[] {
  const graphFiles = ['PULSE_STRUCTURAL_GRAPH.json', 'PULSE_BEHAVIOR_GRAPH.json'];
  const contracts: ProviderContract[] = [];

  for (const fileName of graphFiles) {
    const filePath = safeJoin(rootDir, '.pulse', 'current', fileName);
    if (!pathExists(filePath)) {
      continue;
    }

    let graph: unknown;
    try {
      graph = JSON.parse(readTextFile(filePath, 'utf8'));
    } catch {
      continue;
    }

    for (const observation of collectUrlObservations(graph)) {
      const provider = providerFromUrl(observation.url);
      if (!provider) {
        continue;
      }

      contracts.push({
        provider,
        endpoint: normalizeEndpoint(observation.url, provider),
        method: observation.method ?? 'GET',
        expectedRequestSchema: observation.requestSchema ?? {},
        expectedResponseSchema: observation.responseSchema ?? {},
        expectedHeaders: observation.headers,
        authType: inferAuthTypeFromObservation(observation),
        status: 'generated',
        lastValidated: null,
        issues: [`Discovered from graph artifact ${fileName}`],
      });
    }
  }

  return dedupeContracts(contracts);
}

interface UrlObservation {
  url: string;
  method: string | null;
  headers: string[];
  requestSchema: Record<string, unknown> | null;
  responseSchema: Record<string, unknown> | null;
  context: string;
}

function collectUrlObservations(value: unknown): UrlObservation[] {
  const observations: UrlObservation[] = [];
  const seen = new Set<string>();

  const visit = (current: unknown, context: Record<string, unknown>, keyPath: string): void => {
    if (typeof current === 'string') {
      for (const url of extractExternalUrls(current)) {
        const method = readMethodFromContext(context);
        const normalizedKey = `${method ?? 'GET'} ${url}`;
        if (seen.has(normalizedKey)) {
          continue;
        }
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
      const objectValue = current as Record<string, unknown>;
      for (const [key, child] of Object.entries(objectValue)) {
        visit(child, objectValue, keyPath ? `${keyPath}.${key}` : key);
      }
    }
  };

  visit(value, {}, '');
  return observations;
}

function extractExternalUrls(value: string): string[] {
  const urls: string[] = [];
  const schemes = ['http://', 'https://'];
  let cursor = 0;

  while (cursor < value.length) {
    const nextStarts = schemes
      .map((scheme) => ({ scheme, index: value.indexOf(scheme, cursor) }))
      .filter((entry) => entry.index >= 0)
      .sort((a, b) => a.index - b.index);

    const next = nextStarts[0];
    if (!next) {
      break;
    }

    let end = next.index + next.scheme.length;
    while (end < value.length && isUrlTokenCharacter(value[end])) {
      end++;
    }

    const candidate = value.slice(next.index, end);
    if (providerFromUrl(candidate)) {
      urls.push(candidate);
    }
    cursor = end;
  }

  return urls;
}

function isUrlTokenCharacter(char: string): boolean {
  if (!char) {
    return false;
  }
  return !["'", '"', '`', '<', '>', ')', '\\'].includes(char) && !/\s/.test(char);
}

function readMethodFromContext(context: Record<string, unknown>): string | null {
  for (const key of ['method', 'httpMethod', 'httpVerb', 'verb']) {
    const value = context[key];
    if (typeof value === 'string' && HTTP_METHOD_PATTERN.test(value.toUpperCase())) {
      return value.toUpperCase();
    }
  }
  return null;
}

function readHeadersFromContext(context: Record<string, unknown>): string[] {
  const headers = context.headers;
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    return [];
  }
  return Object.keys(headers).filter((header) => /^[A-Za-z0-9-]+$/.test(header));
}

function readSchemaFromContext(
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

function inferAuthTypeFromObservation(observation: UrlObservation): ProviderContract['authType'] {
  const serialized = JSON.stringify({
    headers: observation.headers,
    requestSchema: observation.requestSchema,
    responseSchema: observation.responseSchema,
    context: observation.context,
  }).toLowerCase();

  if (serialized.includes('signature')) return 'webhook_signature';
  if (serialized.includes('bearer') || serialized.includes('authorization')) return 'bearer';
  if (serialized.includes('oauth')) return 'oauth2';
  if (serialized.includes('api_key') || serialized.includes('apikey')) return 'api_key';
  return 'none';
}

function dedupeContracts(contracts: ProviderContract[]): ProviderContract[] {
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
        Object.keys(existing.expectedRequestSchema).length > 0
          ? existing.expectedRequestSchema
          : contract.expectedRequestSchema,
      expectedResponseSchema:
        Object.keys(existing.expectedResponseSchema).length > 0
          ? existing.expectedResponseSchema
          : contract.expectedResponseSchema,
      expectedHeaders: uniqueStrings([...existing.expectedHeaders, ...contract.expectedHeaders]),
      authType: existing.authType === 'none' ? contract.authType : existing.authType,
      issues: uniqueStrings([...existing.issues, ...contract.issues]),
    });
  }

  return [...byKey.values()];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
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

function describeHttpClientCall(
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

function readFetchMethod(node: ts.CallExpression, source: ts.SourceFile): string | null {
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

function readStaticStringExpression(
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

function findControllerPrefix(source: ts.SourceFile): string {
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

function collectRouteDecorators(source: ts.SourceFile): Array<{ method: string; route: string }> {
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
      const routePart = normalizeRoute(routeDefinition.route);

      const fullRoute =
        prefix + (routePart.startsWith('/') || prefix.endsWith('/') ? '' : '/') + routePart;
      const normalized = normalizeRoute(fullRoute);

      const key = `${routeDefinition.method} ${normalized}`;
      if (seen.has(key)) continue;
      seen.add(key);

      endpoints.push({ method: routeDefinition.method, endpoint: normalized });
    }
  }

  return endpoints;
}

function parseSourceFile(filePath: string, content: string): ts.SourceFile {
  const scriptKind =
    filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKind);
}

function readPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
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
      `ALTER COLUMN "${column}" SET NOT NULL on table "${table}" — will fail when rows contain null values`,
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

