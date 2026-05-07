/**
 * PULSE API Contract & Fuzz Probe Engine — Core Test Generators
 *
 * Generates auth, schema validation, idempotency, and rate limit test cases
 * from endpoint probes.
 */
import type {
  APIEndpointProbe,
  AuthTestCase,
  IdempotencyTestCase,
  RateLimitTestCase,
  SchemaTestCase,
} from '../../types.api-fuzzer';
import {
  PLANNED,
  OK,
  CREATED,
  BAD_REQUEST,
  UNAUTHORIZED,
  FORBIDDEN,
  IDEM,
  uniqueId,
  deriveZeroValue,
} from './constants';
import {
  parseDtoSchema,
  buildValidPayloadFromSchema,
  wrongTypeValueForFieldType,
} from './dto-parser';

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
        status: PLANNED,
        expectedStatus: OK,
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
      status: PLANNED,
      expectedStatus: UNAUTHORIZED,
      actualStatus: null,
      error: null,
    });
  }

  tests.push({
    testId: `${endpoint.endpointId}-auth-boundary-malformed`,
    scenario: 'Guard boundary with malformed credential material',
    status: PLANNED,
    expectedStatus: UNAUTHORIZED,
    actualStatus: null,
    error: null,
  });

  const routeParameters = metadata?.routeParameters ?? [];
  for (const routeParameter of routeParameters) {
    tests.push({
      testId: `${endpoint.endpointId}-auth-context-mismatch-${routeParameter}`,
      scenario: `Guarded route parameter "${routeParameter}" with mismatched context material`,
      status: PLANNED,
      expectedStatus: FORBIDDEN,
      actualStatus: null,
      error: null,
    });
  }

  const authorizationMetadata = metadata?.authorizationMetadata ?? [];
  for (const [index, decoratorName] of authorizationMetadata.entries()) {
    tests.push({
      testId: `${endpoint.endpointId}-auth-metadata-variant-${index}`,
      scenario: `Authorization metadata "${decoratorName}" with non-matching credential attributes`,
      status: PLANNED,
      expectedStatus: FORBIDDEN,
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
      status: PLANNED,
      expectedStatus: FORBIDDEN,
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
        expectedStatus: CREATED,
        actualStatus: null,
        validationErrors: [],
        status: PLANNED,
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
          expectedStatus: BAD_REQUEST,
          actualStatus: null,
          validationErrors: [`${reqField} is required`],
          status: PLANNED,
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
            expectedStatus: BAD_REQUEST,
            actualStatus: null,
            validationErrors: [`${reqField} has wrong type`],
            status: PLANNED,
          });
        }
      }
    }

    tests.push({
      testId: `${endpoint.endpointId}-schema-empty-body`,
      scenario: 'Empty request body',
      payload: {},
      expectedStatus: BAD_REQUEST,
      actualStatus: null,
      validationErrors: ['Body cannot be empty'],
      status: PLANNED,
    });

    tests.push({
      testId: `${endpoint.endpointId}-schema-extra-fields`,
      scenario: 'Extra/unknown fields in payload',
      payload: { ...validPayload, unexpectedExtraField: 'should-be-rejected' },
      expectedStatus: BAD_REQUEST,
      actualStatus: null,
      validationErrors: ['Unexpected fields'],
      status: PLANNED,
    });

    tests.push({
      testId: `${endpoint.endpointId}-schema-boundary-null`,
      scenario: 'null for required field',
      payload: { ...validPayload, ...Object.fromEntries(requiredFields.map((f) => [f, null])) },
      expectedStatus: BAD_REQUEST,
      actualStatus: null,
      validationErrors: ['Null value for required field'],
      status: PLANNED,
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
      status: IDEM.planned,
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
      status: PLANNED,
      requestsSent: max + 5,
      rateLimited: false,
      rateLimitedAt: deriveZeroValue(),
      windowResetMs: null,
    },
  ];
}
