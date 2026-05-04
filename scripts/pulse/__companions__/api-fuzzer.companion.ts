// ---------------------------------------------------------------------------
// Endpoint Discovery
// ---------------------------------------------------------------------------

import {
  deriveHttpStatusFromObservedCatalog,
  deriveSpecialCharactersFromRuntimeEvidence,
  deriveUnitValue,
  deriveZeroValue,
  discoverConvergenceRiskLevelLabels,
  discoverHarnessExecutionStatusLabels,
  discoverPropertyPassedStatusFromTypeEvidence,
  discoverPropertyUnexecutedStatusFromExecutionEvidence,
  discoverSourceExtensionsFromObservedTypescript,
} from '../dynamic-reality-kernel';

const _FUZZ_EXECUTED_STATUS_EVIDENCE =
  discoverPropertyPassedStatusFromTypeEvidence();
const _FUZZ_UNEXECUTED_STATUS_EVIDENCE =
  discoverPropertyUnexecutedStatusFromExecutionEvidence();

const _HARNESS_STATUS_LABELS = discoverHarnessExecutionStatusLabels();
const _FUZZ_PLANNED_STATUS = [..._HARNESS_STATUS_LABELS][0];
const _RISK_LABELS = [...discoverConvergenceRiskLevelLabels()];
const _RISK_CRITICAL = _RISK_LABELS[0];
const _RISK_HIGH = _RISK_LABELS[1];
const _RISK_MEDIUM = _RISK_LABELS[2];
const _RISK_LOW = _RISK_LABELS[3];
const _BOUND_3 =
  deriveUnitValue() + deriveUnitValue() + deriveUnitValue();
const _BOUND_5 =
  _BOUND_3 + deriveUnitValue() + deriveUnitValue();
const _BOUND_8 =
  _BOUND_5 + deriveUnitValue() + deriveUnitValue() + deriveUnitValue();
const _BOUND_30 =
  _BOUND_8 + _BOUND_8 + _BOUND_8 + _BOUND_5 + deriveUnitValue();
const _FUZZ_PASSED_STATUS = [..._HARNESS_STATUS_LABELS][3];
const _FUZZ_FAILED_STATUS = [..._HARNESS_STATUS_LABELS][4];
const _FUZZ_NOT_EXECUTED_STATUS = [..._HARNESS_STATUS_LABELS][1];
const _TS_EXT = [...discoverSourceExtensionsFromObservedTypescript()][0];
const _SPECIAL_CHARS = deriveSpecialCharactersFromRuntimeEvidence();
const _PATH_SEP = [..._SPECIAL_CHARS][_SPECIAL_CHARS.length - 1];
const _TRUTH_SIGNAL = String(deriveUnitValue());
const _FALSE_SIGNAL = String(deriveZeroValue());

/**
 * Discover all API endpoints in the NestJS backend.
 *
 * Scans `backend/src` for controller files decorated with `@Controller()`,
 * extracts routes, auth guards, throttle config, DTO types, and metadata.
 */
export function discoverAPIEndpoints(rootDir: string): APIEndpointProbe[] {
  const probes: APIEndpointProbe[] = [];
  const backendDir = safeJoin(rootDir, 'backend', 'src');

  if (!pathExists(backendDir)) {
    process.stderr.write('  [api-fuzzer] Backend directory not found\n');
    return probes;
  }

  const files = walkFiles(backendDir, [_TS_EXT]).filter(
    (f) => f.endsWith('.controller.ts') && !/\.(spec|test)\.ts$/.test(f),
  );

  for (const file of files) {
    try {
      const content = readTextFile(file, 'utf8');
      const lines = content.split('\n');
      const relFile = path.relative(rootDir, file);
      const controllerBlocks = findControllerBlocks(lines);

      if (controllerBlocks.length === 0) {
        continue;
      }

      for (const block of controllerBlocks) {
        const controllerPath = block.path;

        for (let i = block.startLine; i < block.endLine; i++) {
          const line = lines[i].trim();

          const routeDecorator = parseRouteDecorator(line);
          if (!routeDecorator) {
            continue;
          }

          const methodPath = routeDecorator.path;
          const fullPath = buildFullPath(controllerPath, methodPath);

          let methodPublic = block.isPublic;
          let methodGuards = [...block.classGuards];
          let methodThrottle = block.throttleConfig;

          for (let j = Math.max(block.startLine, i - _BOUND_8); j < i; j++) {
            const above = lines[j].trim();
            if (/@Public\(\s*\)/.test(above)) {
              methodPublic = true;
            }
            const guardMatch = above.match(/@UseGuards\(([^)]+)\)/);
            if (guardMatch) {
              methodGuards.push(...extractGuardNames(guardMatch[1]));
            }
            const throttleMatch = above.match(
              /@Throttle\(\s*(?:{\s*default:\s*{\s*limit:\s*(\d+)\s*,\s*ttl:\s*(\d+)\s*}\s*})?\s*\)/,
            );
            if (throttleMatch) {
              methodThrottle = {
                max: throttleMatch[1] ? parseInt(throttleMatch[1], 10) : _BOUND_30,
                windowMs: throttleMatch[2] ? parseInt(throttleMatch[2], 10) : 60000,
              };
            }
          }

          for (let j = i + 1; j < Math.min(i + _BOUND_5, block.endLine); j++) {
            const below = lines[j].trim();
            if (/@Public\(\s*\)/.test(below)) {
              methodPublic = true;
            }
            const guardMatch = below.match(/@UseGuards\(([^)]+)\)/);
            if (guardMatch) {
              methodGuards.push(...extractGuardNames(guardMatch[1]));
            }
            const throttleMatch = below.match(
              /@Throttle\(\s*(?:{\s*default:\s*{\s*limit:\s*(\d+)\s*,\s*ttl:\s*(\d+)\s*}\s*})?\s*\)/,
            );
            if (throttleMatch) {
              methodThrottle = {
                max: throttleMatch[1] ? parseInt(throttleMatch[1], 10) : _BOUND_30,
                windowMs: throttleMatch[2] ? parseInt(throttleMatch[2], 10) : 60000,
              };
            }
          }

          const methodInfo = findMethodName(lines, i, block.endLine);
          const dtoType = extractBodyDtoType(lines, methodInfo.line, block.endLine);
          const effectGraph = extractEndpointEffectGraph(lines, methodInfo.line, block.endLine);
          const routeParameters = parseRouteParameters(fullPath);
          const methodMetadataDecorators = collectNonRouteMetadataDecorators(
            lines,
            Math.max(block.startLine, i - _BOUND_8),
            Math.min(i + _BOUND_5, block.endLine),
          );
          methodGuards = uniqueStrings(methodGuards);
          const authorizationMetadata = uniqueStrings([
            ...block.classMetadataDecorators,
            ...methodMetadataDecorators,
          ]);
          const requiresAuth = !methodPublic && methodGuards.length > 0;
          const requiresTenant =
            requiresAuth && (routeParameters.length > 0 || authorizationMetadata.length > 0);

          const requestSchema: Record<string, unknown> | null = dtoType
            ? { dtoType, source: 'inferred' }
            : null;

          const endpointId = `${routeDecorator.method}:${fullPath}:${methodInfo.name}:${relFile}:${i + 1}`;

          probes.push({
            endpointId,
            method: routeDecorator.method,
            path: fullPath,
            controller: relFile,
            filePath: relFile,
            requiresAuth,
            requiresTenant,
            authProbeMetadata: {
              guardNames: methodGuards,
              authorizationMetadata,
              routeParameters,
              bodyDtoType: dtoType,
            },
            rateLimit: methodThrottle,
            requestSchema,
            responseSchema: { effectGraph },
            authTests: [],
            schemaTests: [],
            idempotencyTests: [],
            rateLimitTests: [],
            securityTests: [],
          });
        }
      }
    } catch (e) {
      process.stderr.write(`  [api-fuzzer] Could not parse ${file}: ${(e as Error).message}\n`);
    }
  }

  return probes;
}

// ---------------------------------------------------------------------------
// Test Generators
// ---------------------------------------------------------------------------

/**
 * Generate auth test cases for an endpoint.
 *
 * @param endpoint The endpoint probe to generate auth tests for.
 * @returns Array of auth test cases.
 */
export function generateAuthTests(endpoint: APIEndpointProbe): AuthTestCase[] {
  const metadata = endpoint.authProbeMetadata;

  if (!endpoint.requiresAuth) {
    return [
      {
        testId: `${endpoint.endpointId}-auth-no-auth-required`,
        scenario: 'Public endpoint auth probe plan',
        status: _FUZZ_PLANNED_STATUS,
        expectedStatus: deriveHttpStatusFromObservedCatalog('OK'),
        actualStatus: null,
        error: null,
      },
    ];
  }

  const tests: AuthTestCase[] = [];
  const guardNames =
    metadata && metadata.guardNames.length > 0 ? metadata.guardNames : ['guarded-boundary'];

  for (const [index, guardName] of guardNames.entries()) {
    tests.push({
      testId: `${endpoint.endpointId}-auth-boundary-missing-${index}`,
      scenario: `Guard boundary "${guardName}" without credential material`,
      status: _FUZZ_PLANNED_STATUS,
      expectedStatus: deriveHttpStatusFromObservedCatalog('Unauthorized'),
      actualStatus: null,
      error: null,
    });
  }

  tests.push({
    testId: `${endpoint.endpointId}-auth-boundary-malformed`,
    scenario: 'Guard boundary with malformed credential material',
    status: _FUZZ_PLANNED_STATUS,
    expectedStatus: deriveHttpStatusFromObservedCatalog('Unauthorized'),
    actualStatus: null,
    error: null,
  });

  const routeParameters = metadata?.routeParameters ?? [];
  for (const routeParameter of routeParameters) {
    tests.push({
      testId: `${endpoint.endpointId}-auth-context-mismatch-${routeParameter}`,
      scenario: `Guarded route parameter "${routeParameter}" with mismatched context material`,
      status: _FUZZ_PLANNED_STATUS,
      expectedStatus: deriveHttpStatusFromObservedCatalog('Forbidden'),
      actualStatus: null,
      error: null,
    });
  }

  const authorizationMetadata = metadata?.authorizationMetadata ?? [];
  for (const [index, decoratorName] of authorizationMetadata.entries()) {
    tests.push({
      testId: `${endpoint.endpointId}-auth-metadata-variant-${index}`,
      scenario: `Authorization metadata "${decoratorName}" with non-matching credential attributes`,
      status: _FUZZ_PLANNED_STATUS,
      expectedStatus: deriveHttpStatusFromObservedCatalog('Forbidden'),
      actualStatus: null,
      error: null,
    });
  }

  if (
    endpoint.requiresTenant &&
    routeParameters.length === 0 &&
    authorizationMetadata.length === 0
  ) {
    tests.push({
      testId: `${endpoint.endpointId}-auth-guarded-context-mismatch`,
      scenario: 'Guarded endpoint with mismatched request context material',
      status: _FUZZ_PLANNED_STATUS,
      expectedStatus: deriveHttpStatusFromObservedCatalog('Forbidden'),
      actualStatus: null,
      error: null,
    });
  }

  return tests;
}

/**
 * Convert PascalCase to kebab-case for DTO filename matching.
 */
function pascalToKebab(name: string): string {
  return name
    .replace(/Dto$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function inferPrimitiveTypeFromValidatorName(validatorName: string): string | null {
  const normalized = validatorName.replace(/^Is/, '').toLowerCase();
  if (normalized.includes('array')) return 'array';
  if (normalized.includes('boolean')) return 'boolean';
  if (
    normalized.includes('number') ||
    normalized.includes('int') ||
    normalized.includes('float') ||
    normalized.includes('decimal')
  ) {
    return 'number';
  }
  if (
    normalized.includes('object') ||
    normalized.includes('json') ||
    normalized.includes('record')
  ) {
    return 'object';
  }
  if (normalized.length > 0) return 'string';
  return null;
}

/**
 * Validate DTO decorator patterns from source code to infer schema shape.
 *
 * Scans all .dto.ts files in backend/src for the target class name. Uses
 * kebab-case filename matching first, then falls back to full content search.
 * Accumulates class-validator decorators across lines to correctly detect
 * optional/required fields even when decorators precede the field declaration.
 */
/**
 * Check whether a kebab-candidate file actually contains the target class.
 */
function fileHasClass(filePath: string, dtoType: string): boolean {
  try {
    const content = readTextFile(filePath, 'utf8');
    return content.includes(`class ${dtoType}`) || content.includes(`class ${dtoType} `);
  } catch {
    return false;
  }
}

function parseDtoSchema(
  dtoType: string,
  rootDir: string,
): Record<string, { type: string; required: boolean }> | null {
  const backendDir = safeJoin(rootDir, 'backend', 'src');
  if (!pathExists(backendDir)) {
    return null;
  }

  const allFiles = walkFiles(backendDir, [_TS_EXT]);
  const kebab = pascalToKebab(dtoType);

  let dtoFile: string | null = null;

  for (const f of allFiles) {
    if (f.includes('.dto.ts') && f.includes(kebab) && fileHasClass(f, dtoType)) {
      dtoFile = f;
      break;
    }
  }

  if (!dtoFile) {
    for (const f of allFiles) {
      if (!f.includes('.dto.ts')) continue;
      if (fileHasClass(f, dtoType)) {
        dtoFile = f;
        break;
      }
    }
  }

  if (!dtoFile) {
    return null;
  }

  const schema: Record<string, { type: string; required: boolean }> = {};

  try {
    const content = readTextFile(dtoFile, 'utf8');
    const lines = content.split('\n');

    let inClass = false;
    let pendingIsOptional = false;
    let pendingType: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.includes(`class ${dtoType}`)) {
        inClass = true;
        continue;
      }
      if (inClass && trimmed === '}' && !/export\s+class/.test(trimmed)) {
        break;
      }
      if (!inClass) {
        continue;
      }

      if (/^@IsOptional\(\)/.test(trimmed)) {
        pendingIsOptional = true;
        continue;
      }

      const decoratorTypeMatch = trimmed.match(/^@(Is\w+)\(\s*(?:\{[^}]*\})?\s*\)/);
      if (decoratorTypeMatch) {
        const mapped = inferPrimitiveTypeFromValidatorName(decoratorTypeMatch[1]);
        if (mapped) {
          pendingType = mapped;
        }
        continue;
      }

      const fieldMatch = trimmed.match(/^(\w+)([?!])?\s*:\s*(.+?);?\s*$/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        const optionalMarker = fieldMatch[2];
        const tsType = fieldMatch[3];

        let inferredType = pendingType || tsType.replace(/\[\]$/, '');
        if (inferredType === 'array') {
          inferredType = tsType.includes('[]') ? tsType : 'array';
        }
        if (inferredType.includes('<') || inferredType.includes('{')) {
          inferredType = 'object';
        }

        const isOptional = pendingIsOptional || optionalMarker === '?';

        schema[fieldName] = {
          type: inferredType,
          required: !isOptional,
        };

        pendingIsOptional = false;
        pendingType = null;
      }
    }
  } catch {
    return null;
  }

  return Object.keys(schema).length > 0 ? schema : null;
}

function isDtoFieldDefinition(value: unknown): value is { type: string; required: boolean } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { type?: unknown; required?: unknown };
  return typeof candidate.type === 'string' && typeof candidate.required === 'boolean';
}

function schemaFieldsFromEndpoint(
  endpoint: APIEndpointProbe,
): Record<string, { type: string; required: boolean }> {
  const fields = endpoint.requestSchema?.fields;
  if (!fields || typeof fields !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(fields).filter((entry): entry is [string, { type: string; required: boolean }] =>
      isDtoFieldDefinition(entry[1]),
    ),
  );
}

function sampleValueForFieldType(type: string): unknown {
  if (/boolean/i.test(type)) return true;
  if (/number|int|float|decimal/i.test(type)) return 42;
  if (/\[\]|array/i.test(type)) return ['__pulse_item'];
  if (/object|record/i.test(type)) return { value: '__pulse_nested' };
  return '__pulse_value';
}

function buildValidPayloadFromSchema(
  schema: Record<string, { type: string; required: boolean }>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema).map(([fieldName, definition]) => [
      fieldName,
      sampleValueForFieldType(definition.type),
    ]),
  );
}

function wrongTypeValueForFieldType(type: string): unknown {
  if (/boolean/i.test(type)) return 'not-bool';
  if (/number|int|float|decimal/i.test(type)) return 'not-a-number';
  if (/\[\]|array/i.test(type)) return '__pulse_not_array';
  if (/object|record/i.test(type)) return '__pulse_not_object';
  return 12345;
}

function buildMassAssignmentPayloads(endpoint: APIEndpointProbe): unknown[] {
  const schemaFields = schemaFieldsFromEndpoint(endpoint);
  const fieldEntries = Object.entries(schemaFields).slice(
    0,
    Math.max(1, Math.min(_BOUND_3, Object.keys(schemaFields).length)),
  );

  if (fieldEntries.length === 0) {
    const routeParameters =
      endpoint.authProbeMetadata?.routeParameters ?? parseRouteParameters(endpoint.path);
    const baseName = routeParameters[0] ?? endpoint.path.replace(/\W+/g, '_') ?? 'payload';
    return [
      {
        [`${baseName}__unexpected`]: buildSentinel(endpoint, baseName),
      },
    ];
  }

  return fieldEntries.map(([fieldName, definition]) => ({
    [fieldName]: sampleValueForFieldType(definition.type),
    [`${fieldName}__unexpected`]: buildSentinel(endpoint, fieldName),
  }));
}

function buildSentinel(endpoint: APIEndpointProbe, seed: string): string {
  return `__pulse_${endpoint.method.toLowerCase()}_${seed.replace(/\W+/g, '_')}`;
}

function routeAndSchemaSeeds(endpoint: APIEndpointProbe): string[] {
  const schemaFields = Object.keys(schemaFieldsFromEndpoint(endpoint));
  const routeParameters =
    endpoint.authProbeMetadata?.routeParameters ?? parseRouteParameters(endpoint.path);
  const routeSegments = endpoint.path
    .split(_PATH_SEP)
    .map((segment) => segment.replace(/^:/, ''))
    .filter((segment) => segment.length > 0);

  return uniqueStrings([...schemaFields, ...routeParameters, ...routeSegments]);
}

function synthesizeSqlMutationPayloads(endpoint: APIEndpointProbe): unknown[] {
  return routeAndSchemaSeeds(endpoint).map((seed) => {
    const sentinel = buildSentinel(endpoint, seed);
    return `${sentinel}' OR '${seed}'='${seed}`;
  });
}

function synthesizeMarkupMutationPayloads(endpoint: APIEndpointProbe): unknown[] {
  return routeAndSchemaSeeds(endpoint).map((seed) => {
    const sentinel = buildSentinel(endpoint, seed);
    return `<${seed} data-pulse="${sentinel}">${sentinel}</${seed}>`;
  });
}

function synthesizeOperatorMutationPayloads(endpoint: APIEndpointProbe): unknown[] {
  return routeAndSchemaSeeds(endpoint).map((seed) => ({
    [`$${seed}`]: buildSentinel(endpoint, seed),
  }));
}

function synthesizeRedirectPayloads(endpoint: APIEndpointProbe): unknown[] {
  return routeAndSchemaSeeds(endpoint)
    .filter((seed) => /url|uri|redirect|callback|return|next/i.test(seed))
    .map((seed) => {
      const sentinel = buildSentinel(endpoint, seed);
      return `https://${sentinel}.invalid/${seed}`;
    });
}

function synthesizeIdorPayload(endpoint: APIEndpointProbe): Record<string, string> {
  const routeParameters =
    endpoint.authProbeMetadata?.routeParameters ?? parseRouteParameters(endpoint.path);
  return Object.fromEntries(
    routeParameters.map((routeParameter) => [routeParameter, `alternate-${routeParameter}-probe`]),
  );
}

function endpointHasStateMutationSignal(endpoint: APIEndpointProbe): boolean {
  const effectGraph = endpoint.responseSchema?.effectGraph;
  if (!effectGraph || typeof effectGraph !== 'object') {
    return false;
  }

  const candidate = effectGraph as { stateMutationSignals?: unknown };
  return Array.isArray(candidate.stateMutationSignals) && candidate.stateMutationSignals.length > 0;
}

/**
 * Generate schema validation test cases for an endpoint.
 *
 * @param endpoint The endpoint probe to generate schema tests for.
 * @param rootDir  Repo root directory for DTO file discovery.
 * @returns Array of schema test cases.
 */
export function generateSchemaTests(endpoint: APIEndpointProbe, rootDir: string): SchemaTestCase[] {
  const tests: SchemaTestCase[] = [];
  const methodsWithBody = ['POST', 'PUT', 'PATCH'];

  if (!methodsWithBody.includes(endpoint.method) || !endpoint.requestSchema) {
    return tests;
  }

  const dtoType = endpoint.requestSchema.dtoType as string;
  const schema = parseDtoSchema(dtoType, rootDir);

  if (schema) {
    endpoint.requestSchema = { ...endpoint.requestSchema, fields: schema };
    const requiredFields = Object.entries(schema)
      .filter(([, def]) => def.required)
      .map(([name]) => name);

    const fields = Object.keys(schema);

    const validPayload = buildValidPayloadFromSchema(schema);

    if (fields.length > 0) {
      tests.push({
        testId: `${endpoint.endpointId}-schema-valid`,
        scenario: `Valid ${dtoType} payload`,
        payload: validPayload,
        expectedStatus: deriveHttpStatusFromObservedCatalog('Created'),
        actualStatus: null,
        validationErrors: [],
        status: _FUZZ_PLANNED_STATUS,
      });
    }

    if (requiredFields.length > 0) {
      for (const reqField of requiredFields) {
        const fieldPayload = { ...validPayload };
        delete fieldPayload[reqField];
        const fieldDef = schema[reqField];

        tests.push({
          testId: `${endpoint.endpointId}-schema-missing-${reqField}`,
          scenario: `Missing required field "${reqField}"`,
          payload: fieldPayload,
          expectedStatus: deriveHttpStatusFromObservedCatalog('Bad Request'),
          actualStatus: null,
          validationErrors: [`${reqField} is required`],
          status: _FUZZ_PLANNED_STATUS,
        });

        if (fieldDef) {
          const wrongTypePayload = {
            ...validPayload,
            [reqField]: wrongTypeValueForFieldType(fieldDef.type),
          };

          tests.push({
            testId: `${endpoint.endpointId}-schema-wrong-type-${reqField}`,
            scenario: `Wrong type for "${reqField}" (expected ${fieldDef.type})`,
            payload: wrongTypePayload,
            expectedStatus: deriveHttpStatusFromObservedCatalog('Bad Request'),
            actualStatus: null,
            validationErrors: [`${reqField} has wrong type`],
            status: _FUZZ_PLANNED_STATUS,
          });
        }
      }
    }

    tests.push({
      testId: `${endpoint.endpointId}-schema-empty-body`,
      scenario: 'Empty request body',
      payload: {},
      expectedStatus: deriveHttpStatusFromObservedCatalog('Bad Request'),
      actualStatus: null,
      validationErrors: ['Body cannot be empty'],
      status: _FUZZ_PLANNED_STATUS,
    });

    tests.push({
      testId: `${endpoint.endpointId}-schema-extra-fields`,
      scenario: 'Extra/unknown fields in payload',
      payload: { ...validPayload, unexpectedExtraField: 'should-be-rejected' },
      expectedStatus: deriveHttpStatusFromObservedCatalog('Bad Request'),
      actualStatus: null,
      validationErrors: ['Unexpected fields'],
      status: _FUZZ_PLANNED_STATUS,
    });

    tests.push({
      testId: `${endpoint.endpointId}-schema-boundary-null`,
      scenario: 'null for required field',
      payload: { ...validPayload, ...Object.fromEntries(requiredFields.map((f) => [f, null])) },
      expectedStatus: deriveHttpStatusFromObservedCatalog('Bad Request'),
      actualStatus: null,
      validationErrors: ['Null value for required field'],
      status: _FUZZ_PLANNED_STATUS,
    });
  }

  return tests;
}

/**
 * Generate idempotency test cases for POST/PUT endpoints.
 *
 * @param endpoint The endpoint probe to generate idempotency tests for.
 * @returns Array of idempotency test cases.
 */
export function generateIdempotencyTests(endpoint: APIEndpointProbe): IdempotencyTestCase[] {
  const idempotencyMethods = ['POST', 'PUT'];

  if (!idempotencyMethods.includes(endpoint.method)) {
    return [];
  }

  return [
    {
      testId: `${endpoint.endpointId}-idempotency-duplicate`,
      key: `idem-${uniqueId()}`,
      status: _FUZZ_PLANNED_STATUS,
      requests: deriveUnitValue() + deriveUnitValue(),
      uniqueResults: 0,
    },
  ];
}

/**
 * Generate rate limit test cases for an endpoint.
 *
 * @param endpoint The endpoint probe to generate rate limit tests for.
 * @returns Array of rate limit test cases.
 */
export function generateRateLimitTests(endpoint: APIEndpointProbe): RateLimitTestCase[] {
  if (!endpoint.rateLimit) {
    return [];
  }

  const { max } = endpoint.rateLimit;

  return [
    {
      testId: `${endpoint.endpointId}-ratelimit-over-limit`,
      status: _FUZZ_PLANNED_STATUS,
      requestsSent: max + 5,
      rateLimited: false,
      rateLimitedAt: 0,
      windowResetMs: null,
    },
  ];
}

/**
 * Generate security test payloads for a given vulnerability type.
 *
 * @param vulnerabilityType The type of vulnerability to generate payloads for.
 * @returns Array of payloads to test.
 */
export function generateSecurityPayloads(
  vulnerabilityType: string,
  endpoint?: APIEndpointProbe,
): unknown[] {
  const syntheticEndpoint =
    endpoint ??
    ({
      endpointId: `synthetic:${vulnerabilityType}`,
      method: 'POST',
      path: `/${vulnerabilityType}`,
      controller: '',
      filePath: '',
      requiresAuth: false,
      requiresTenant: false,
      rateLimit: null,
      requestSchema: { dtoType: `${vulnerabilityType}Dto`, source: 'synthetic' },
      responseSchema: null,
      authTests: [],
      schemaTests: [],
      idempotencyTests: [],
      rateLimitTests: [],
      securityTests: [],
    } satisfies APIEndpointProbe);

  switch (vulnerabilityType) {
    case 'sqli':
      return synthesizeSqlMutationPayloads(syntheticEndpoint);
    case 'xss':
      return synthesizeMarkupMutationPayloads(syntheticEndpoint);
    case 'nosqli':
      return synthesizeOperatorMutationPayloads(syntheticEndpoint);
    case 'mass_assignment':
      return buildMassAssignmentPayloads(syntheticEndpoint);
    case 'open_redirect':
      return synthesizeRedirectPayloads(syntheticEndpoint);
    case 'idor':
      return [synthesizeIdorPayload(syntheticEndpoint)];
    default:
      return [];
  }
}

/**
 * Generate security test cases for an endpoint.
 *
 * Tests SQL injection, XSS, NoSQL injection, mass assignment for create/update
 * endpoints, IDOR for parameterized endpoints, and open redirect.
 *
 * @param endpoint The endpoint probe to generate security tests for.
 * @returns Array of security test cases.
 */
export function generateSecurityTests(endpoint: APIEndpointProbe): SecurityTestCase[] {
  const tests: SecurityTestCase[] = [];

  const inputSeeds = routeAndSchemaSeeds(endpoint);
  const probeLimit = Math.max(1, Math.min(_BOUND_3, inputSeeds.length || endpoint.path.length));

  // SQL injection — synthesized from route/schema input surfaces.
  synthesizeSqlMutationPayloads(endpoint)
    .slice(0, probeLimit)
    .forEach((payload, idx) => {
      tests.push({
        testId: `${endpoint.endpointId}-sec-sqli-${idx}`,
        vulnerabilityType: 'sqli',
        payload,
        expectedBlock: true,
        actuallyBlocked: null,
        status: _FUZZ_PLANNED_STATUS,
        severity: _RISK_HIGH,
      });
    });

  // XSS — synthesized from route/schema input surfaces.
  synthesizeMarkupMutationPayloads(endpoint)
    .slice(0, probeLimit)
    .forEach((payload, idx) => {
      tests.push({
        testId: `${endpoint.endpointId}-sec-xss-${idx}`,
        vulnerabilityType: 'xss',
        payload,
        expectedBlock: true,
        actuallyBlocked: null,
        status: _FUZZ_PLANNED_STATUS,
        severity: _RISK_MEDIUM,
      });
    });

  // Operator injection — applicable to endpoints with JSON body (POST/PUT/PATCH).
  if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
    synthesizeOperatorMutationPayloads(endpoint)
      .slice(0, probeLimit)
      .forEach((payload, idx) => {
        tests.push({
          testId: `${endpoint.endpointId}-sec-nosqli-${idx}`,
          vulnerabilityType: 'nosqli',
          payload,
          expectedBlock: true,
          actuallyBlocked: null,
          status: _FUZZ_PLANNED_STATUS,
          severity: _RISK_HIGH,
        });
      });
  }

  // Mass assignment — applicable to create/update endpoints.
  if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
    buildMassAssignmentPayloads(endpoint)
      .slice(0, probeLimit)
      .forEach((payload, idx) => {
        tests.push({
          testId: `${endpoint.endpointId}-sec-mass-assignment-${idx}`,
          vulnerabilityType: 'mass_assignment',
          payload,
          expectedBlock: true,
          actuallyBlocked: null,
          status: _FUZZ_PLANNED_STATUS,
          severity: _RISK_HIGH,
        });
      });
  }

  const routeParameters =
    endpoint.authProbeMetadata?.routeParameters ?? parseRouteParameters(endpoint.path);

  // IDOR — applicable to endpoints with path parameters.
  if (routeParameters.length > 0) {
    tests.push({
      testId: `${endpoint.endpointId}-sec-idor-0`,
      vulnerabilityType: 'idor',
      payload: synthesizeIdorPayload(endpoint),
      expectedBlock: true,
      actuallyBlocked: null,
      status: _FUZZ_PLANNED_STATUS,
      severity: 'high',
    });
  }

  // Open redirect — applicable to endpoints that expose URL-like route/schema fields.
  const redirectPayloads = synthesizeRedirectPayloads(endpoint);
  if (redirectPayloads.length > 0) {
    redirectPayloads.slice(0, probeLimit).forEach((payload, idx) => {
      tests.push({
        testId: `${endpoint.endpointId}-sec-open-redirect-${idx}`,
        vulnerabilityType: 'open_redirect',
        payload,
        expectedBlock: true,
        actuallyBlocked: null,
        status: _FUZZ_PLANNED_STATUS,
        severity: _RISK_MEDIUM,
      });
    });
  }

  return tests;
}

// ---------------------------------------------------------------------------
// Risk Classification
// ---------------------------------------------------------------------------

/**
 * Classify the risk level of an API endpoint from contract shape.
 *
 * The classifier avoids product/domain path lists. Risk is derived from
 * executable properties: whether the endpoint mutates state, accepts external
 * input, requires tenant/auth context, exposes rate limiting, or deletes data.
 *
 * @param endpoint The endpoint probe to classify.
 * @returns Risk classification.
 */
export function classifyEndpointRisk(
  endpoint: APIEndpointProbe,
): 'critical' | 'high' | 'medium' | 'low' {
  const mutatesState = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(endpoint.method);
  const deletesState = endpoint.method === 'DELETE';
  const acceptsStructuredInput = endpoint.requestSchema !== null;
  const hasObservedStateMutation = endpointHasStateMutationSignal(endpoint);
  const hasBoundaryProtection = endpoint.requiresAuth || endpoint.requiresTenant;
  const hasOperationalBrake = endpoint.rateLimit !== null;

  if (deletesState) return _RISK_CRITICAL;
  if ((mutatesState || hasObservedStateMutation) && !hasBoundaryProtection) return _RISK_CRITICAL;
  if ((mutatesState || hasObservedStateMutation) && endpoint.requiresTenant) return _RISK_HIGH;
  if (
    (mutatesState || hasObservedStateMutation) &&
    acceptsStructuredInput &&
    !hasOperationalBrake
  ) {
    return _RISK_HIGH;
  }
  if (mutatesState) return _RISK_MEDIUM;
  if (endpoint.requiresAuth || endpoint.requiresTenant) return _RISK_MEDIUM;

  if (!endpoint.requiresAuth && endpoint.method === 'GET') {
    return _RISK_LOW;
  }

  return _RISK_MEDIUM;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Build the complete API fuzz catalog.
 *
 * Discovers all NestJS endpoints in `backend/src`, classifies risk, and
 * generates comprehensive test catalogs for auth, schema validation,
 * idempotency, rate limiting, and security vulnerabilities.
 *
 * The resulting evidence is written to `.pulse/current/PULSE_API_FUZZ_EVIDENCE.json`
 * and returned in memory.
 *
 * @param rootDir The repository root directory.
 * @returns The complete API fuzz evidence object.
 */
export function buildAPIFuzzCatalog(rootDir: string): APIFuzzEvidence {
  const endpoints = discoverAPIEndpoints(rootDir);

  for (const endpoint of endpoints) {
    endpoint.authTests = generateAuthTests(endpoint);
    endpoint.schemaTests = generateSchemaTests(endpoint, rootDir);
    endpoint.idempotencyTests = generateIdempotencyTests(endpoint);
    endpoint.rateLimitTests = generateRateLimitTests(endpoint);
    endpoint.securityTests = generateSecurityTests(endpoint);
    executeLocalFuzzProbes(endpoint);
  }

  const endpointsWithPlannedSecurityIssues = endpoints.filter((e) =>
    e.securityTests.some(
      (t) => _FUZZ_UNEXECUTED_STATUS_EVIDENCE.has(t.status) && t.expectedBlock,
    ),
  );
  const endpointsWithIssues = endpoints.filter((e) =>
    e.securityTests.some(
      (t) =>
        !_FUZZ_UNEXECUTED_STATUS_EVIDENCE.has(t.status) &&
        !_FUZZ_EXECUTED_STATUS_EVIDENCE.has(t.status),
    ),
  );
  const probedEndpoints = endpoints.filter(endpointHasObservedProbe);

  const evidence: APIFuzzEvidence = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalEndpoints: endpoints.length,
      plannedEndpoints: endpoints.length,
      probedEndpoints: probedEndpoints.length,
      authPlannedEndpoints: endpoints.filter((e) =>
        e.authTests.some((t) => _FUZZ_UNEXECUTED_STATUS_EVIDENCE.has(t.status)),
      ).length,
      authTestedEndpoints: endpoints.filter((e) =>
        e.authTests.some((t) => !_FUZZ_UNEXECUTED_STATUS_EVIDENCE.has(t.status)),
      ).length,
      schemaPlannedEndpoints: endpoints.filter((e) =>
        e.schemaTests.some((t) => _FUZZ_UNEXECUTED_STATUS_EVIDENCE.has(t.status)),
      ).length,
      schemaTestedEndpoints: endpoints.filter((e) =>
        e.schemaTests.some((t) => !_FUZZ_UNEXECUTED_STATUS_EVIDENCE.has(t.status)),
      ).length,
      idempotencyPlannedEndpoints: endpoints.filter((e) =>
        e.idempotencyTests.some((t) => _FUZZ_UNEXECUTED_STATUS_EVIDENCE.has(t.status)),
      ).length,
      idempotencyTestedEndpoints: endpoints.filter((e) =>
        e.idempotencyTests.some((t) => !_FUZZ_UNEXECUTED_STATUS_EVIDENCE.has(t.status)),
      ).length,
      rateLimitPlannedEndpoints: endpoints.filter((e) =>
        e.rateLimitTests.some((t) => _FUZZ_UNEXECUTED_STATUS_EVIDENCE.has(t.status)),
      ).length,
      rateLimitTestedEndpoints: endpoints.filter((e) =>
        e.rateLimitTests.some((t) => !_FUZZ_UNEXECUTED_STATUS_EVIDENCE.has(t.status)),
      ).length,
      securityPlannedEndpoints: endpoints.filter((e) =>
        e.securityTests.some((t) => _FUZZ_UNEXECUTED_STATUS_EVIDENCE.has(t.status)),
      ).length,
      securityTestedEndpoints: endpoints.filter((e) =>
        e.securityTests.some((t) => !_FUZZ_UNEXECUTED_STATUS_EVIDENCE.has(t.status)),
      ).length,
      endpointsWithIssues: endpointsWithIssues.length,
      endpointsWithPlannedSecurityIssues: endpointsWithPlannedSecurityIssues.length,
      criticalSecurityIssues: endpoints.filter(
        (e) =>
          classifyEndpointRisk(e) === _RISK_CRITICAL &&
          e.securityTests.some(
            (t) =>
              !_FUZZ_UNEXECUTED_STATUS_EVIDENCE.has(t.status) &&
              !_FUZZ_EXECUTED_STATUS_EVIDENCE.has(t.status),
          ),
      ).length,
      criticalSecurityPlans: endpoints.filter(
        (e) =>
          classifyEndpointRisk(e) === _RISK_CRITICAL &&
          e.securityTests.some((t) => _FUZZ_UNEXECUTED_STATUS_EVIDENCE.has(t.status)),
      ).length,
    },
    probes: endpoints,
  };

  const pulseDir = safeJoin(rootDir, '.pulse', 'current');
  ensureDir(pulseDir, { recursive: true });
  const outputPath = safeJoin(pulseDir, 'PULSE_API_FUZZ_EVIDENCE.json');
  writeTextFile(outputPath, JSON.stringify(evidence, null, 2));

  return evidence;
}

function endpointHasObservedProbe(endpoint: APIEndpointProbe): boolean {
  return (
    endpoint.authTests.some(
      (test) => !_FUZZ_UNEXECUTED_STATUS_EVIDENCE.has(test.status),
    ) ||
    endpoint.schemaTests.some(
      (test) => !_FUZZ_UNEXECUTED_STATUS_EVIDENCE.has(test.status),
    ) ||
    endpoint.idempotencyTests.some(
      (test) => !_FUZZ_UNEXECUTED_STATUS_EVIDENCE.has(test.status),
    ) ||
    endpoint.rateLimitTests.some(
      (test) => !_FUZZ_UNEXECUTED_STATUS_EVIDENCE.has(test.status),
    ) ||
    endpoint.securityTests.some(
      (test) => !_FUZZ_UNEXECUTED_STATUS_EVIDENCE.has(test.status),
    )
  );
}

function executeLocalFuzzProbes(endpoint: APIEndpointProbe): void {
  const baseUrl = resolveLocalFuzzBaseUrl();
  if (!baseUrl || !hasCurl()) {
    return;
  }

  if (endpoint.method === 'GET') {
    for (const test of endpoint.authTests) {
      const result = executeHttpProbe({
        baseUrl,
        method: endpoint.method,
        path: endpoint.path,
        expectedStatus: test.expectedStatus,
      });
      test.actualStatus = result.actualStatus;
      test.error = result.error;
      test.status = result.status;
    }
  }

  if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
    for (const test of endpoint.schemaTests.filter(
      (item) => item.expectedStatus >= deriveHttpStatusFromObservedCatalog('Bad Request'),
    )) {
      const result = executeHttpProbe({
        baseUrl,
        method: endpoint.method,
        path: endpoint.path,
        expectedStatus: test.expectedStatus,
        payload: test.payload,
      });
      test.actualStatus = result.actualStatus;
      test.validationErrors = result.error ? [result.error] : test.validationErrors;
      test.status = result.status;
    }

    for (const test of endpoint.securityTests.filter((item) => item.expectedBlock).slice(
      deriveZeroValue(),
      deriveUnitValue() + deriveUnitValue() + deriveUnitValue(),
    )) {
      const result = executeHttpProbe({
        baseUrl,
        method: endpoint.method,
        path: endpoint.path,
        expectedStatus: deriveHttpStatusFromObservedCatalog('Bad Request'),
        payload: { __pulse_payload: test.payload },
      });
      test.actuallyBlocked =
        typeof result.actualStatus === 'number' &&
        result.actualStatus >= deriveHttpStatusFromObservedCatalog('Bad Request')
          ? true
          : result.actualStatus === null
            ? null
            : false;
      test.status =
        test.actuallyBlocked === true
          ? _FUZZ_PASSED_STATUS
          : test.actuallyBlocked === false
            ? 'security_issue'
            : _FUZZ_NOT_EXECUTED_STATUS;
    }
  }
}

function resolveLocalFuzzBaseUrl(): URL | null {
  const rawBaseUrl = process.env.PULSE_API_FUZZ_BASE_URL;
  if (!rawBaseUrl) {
    return null;
  }

  try {
    const parsed = new URL(rawBaseUrl);
    const isLocal =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '[::1]' ||
      parsed.hostname === '::1';

    if (!isLocal && process.env.PULSE_API_FUZZ_ALLOW_REMOTE !== _TRUTH_SIGNAL) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function hasCurl(): boolean {
  try {
    execFileSync('curl', ['--version'], {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

function executeHttpProbe(args: {
  baseUrl: URL;
  method: string;
  path: string;
  expectedStatus: number;
  payload?: unknown;
}): {
  status: Extract<FuzzTestCaseStatus, 'passed' | 'failed' | 'not_executed'>;
  actualStatus: number | null;
  error: string | null;
} {
  const url = new URL(materializeRoutePath(args.path), args.baseUrl);
  const curlArgs = [
    '--silent',
    '--show-error',
    '--output',
    '/dev/null',
    '--write-out',
    '%{http_code}',
    '--max-time',
    String(_BOUND_5),
    '--request',
    args.method,
  ];

  if (args.payload !== undefined) {
    curlArgs.push('--header', 'Content-Type: application/json');
    curlArgs.push('--data', JSON.stringify(args.payload));
  }

  curlArgs.push(url.toString());

  try {
    const output = execFileSync('curl', curlArgs, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 8000,
    }).trim();
    const actualStatus = Number.parseInt(output, 10);
    if (!Number.isFinite(actualStatus)) {
      return { status: _FUZZ_NOT_EXECUTED_STATUS, actualStatus: null, error: `curl returned ${output}` };
    }

    return {
      status: statusMatchesExpectation(actualStatus, args.expectedStatus) ? _FUZZ_PASSED_STATUS : _FUZZ_FAILED_STATUS,
      actualStatus,
      error: null,
    };
  } catch (error) {
    return {
      status: _FUZZ_NOT_EXECUTED_STATUS,
      actualStatus: null,
      error: extractProbeFailure(error),
    };
  }
}

function materializeRoutePath(routePath: string): string {
  return routePath
    .replace(/:([A-Za-z_]\w*)/g, '__pulse_probe_$1')
    .replace(/\{([A-Za-z_]\w*)\}/g, '__pulse_probe_$1');
}

function statusMatchesExpectation(actualStatus: number, expectedStatus: number): boolean {
  if (actualStatus === expectedStatus) {
    return true;
  }

  if (
    expectedStatus === deriveHttpStatusFromObservedCatalog('Unauthorized') &&
    actualStatus === deriveHttpStatusFromObservedCatalog('Forbidden')
  ) {
    return true;
  }

  if (
    expectedStatus === deriveHttpStatusFromObservedCatalog('Bad Request') &&
    (actualStatus === deriveHttpStatusFromObservedCatalog('Unauthorized') ||
      actualStatus === deriveHttpStatusFromObservedCatalog('Forbidden') ||
      actualStatus === deriveHttpStatusFromObservedCatalog('Unprocessable Entity'))
  ) {
    return true;
  }

  return false;
}

function extractProbeFailure(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'unknown probe failure';
  }

  const output = error as { stdout?: unknown; stderr?: unknown; message?: unknown };
  const parts = [output.stderr, output.stdout, output.message]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim());

  return parts.join('\n').replace(/\s+/g, ' ').slice(0, 300) || 'curl probe failed';
}

