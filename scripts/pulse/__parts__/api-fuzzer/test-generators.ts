import type {
  APIEndpointProbe,
  AuthTestCase,
  IdempotencyTestCase,
  RateLimitTestCase,
  SchemaTestCase,
  SecurityTestCase,
} from '../../types.api-fuzzer';
import { uniqueId, parseRouteParameters } from './helpers';
import {
  buildMassAssignmentPayloads,
  routeAndSchemaSeeds,
  synthesizeIdorPayload,
  synthesizeMarkupMutationPayloads,
  synthesizeOperatorMutationPayloads,
  synthesizeRedirectPayloads,
  synthesizeSqlMutationPayloads,
} from './payload-synthesis';
import {
  buildValidPayloadFromSchema,
  parseDtoSchema,
  wrongTypeValueForFieldType,
} from './schema-parsers';

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
        status: 'planned',
        expectedStatus: 200,
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
      status: 'planned',
      expectedStatus: 401,
      actualStatus: null,
      error: null,
    });
  }

  tests.push({
    testId: `${endpoint.endpointId}-auth-boundary-malformed`,
    scenario: 'Guard boundary with malformed credential material',
    status: 'planned',
    expectedStatus: 401,
    actualStatus: null,
    error: null,
  });

  const routeParameters = metadata?.routeParameters ?? [];
  for (const routeParameter of routeParameters) {
    tests.push({
      testId: `${endpoint.endpointId}-auth-context-mismatch-${routeParameter}`,
      scenario: `Guarded route parameter "${routeParameter}" with mismatched context material`,
      status: 'planned',
      expectedStatus: 403,
      actualStatus: null,
      error: null,
    });
  }

  const authorizationMetadata = metadata?.authorizationMetadata ?? [];
  for (const [index, decoratorName] of authorizationMetadata.entries()) {
    tests.push({
      testId: `${endpoint.endpointId}-auth-metadata-variant-${index}`,
      scenario: `Authorization metadata "${decoratorName}" with non-matching credential attributes`,
      status: 'planned',
      expectedStatus: 403,
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
      status: 'planned',
      expectedStatus: 403,
      actualStatus: null,
      error: null,
    });
  }

  return tests;
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
        expectedStatus: 201,
        actualStatus: null,
        validationErrors: [],
        status: 'planned',
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
          expectedStatus: 400,
          actualStatus: null,
          validationErrors: [`${reqField} is required`],
          status: 'planned',
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
            expectedStatus: 400,
            actualStatus: null,
            validationErrors: [`${reqField} has wrong type`],
            status: 'planned',
          });
        }
      }
    }

    tests.push({
      testId: `${endpoint.endpointId}-schema-empty-body`,
      scenario: 'Empty request body',
      payload: {},
      expectedStatus: 400,
      actualStatus: null,
      validationErrors: ['Body cannot be empty'],
      status: 'planned',
    });

    tests.push({
      testId: `${endpoint.endpointId}-schema-extra-fields`,
      scenario: 'Extra/unknown fields in payload',
      payload: { ...validPayload, unexpectedExtraField: 'should-be-rejected' },
      expectedStatus: 400,
      actualStatus: null,
      validationErrors: ['Unexpected fields'],
      status: 'planned',
    });

    tests.push({
      testId: `${endpoint.endpointId}-schema-boundary-null`,
      scenario: 'null for required field',
      payload: { ...validPayload, ...Object.fromEntries(requiredFields.map((f) => [f, null])) },
      expectedStatus: 400,
      actualStatus: null,
      validationErrors: ['Null value for required field'],
      status: 'planned',
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
      status: 'planned',
      requests: 2,
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
      status: 'planned',
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
  const probeLimit = Math.max(1, Math.min(3, inputSeeds.length || endpoint.path.length));

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
        status: 'planned',
        severity: 'high',
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
        status: 'planned',
        severity: 'medium',
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
          status: 'planned',
          severity: 'high',
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
          status: 'planned',
          severity: 'high',
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
      status: 'planned',
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
        status: 'planned',
        severity: 'medium',
      });
    });
  }

  return tests;
}
