/**
 * PULSE API Contract & Fuzz Probe Engine — Security Test Generator & Risk Classifier
 *
 * Generates security test cases (SQLi, XSS, NoSQLi, mass assignment, IDOR,
 * open redirect) and classifies endpoint risk from contract shape.
 */
import type { APIEndpointProbe, SecurityTestCase } from '../types.api-fuzzer';
import { PLANNED, STATUS, deriveUnitValue, parseRouteParameters } from './constants';
import {
  synthesizeSqlMutationPayloads,
  synthesizeMarkupMutationPayloads,
  synthesizeOperatorMutationPayloads,
  buildMassAssignmentPayloads,
  synthesizeRedirectPayloads,
  synthesizeIdorPayload,
  routeAndSchemaSeeds,
  endpointHasStateMutationSignal,
} from './payload-synthesizers';

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
  const probeLimit = Math.max(
    deriveUnitValue(),
    Math.min(
      deriveUnitValue() + deriveUnitValue() + deriveUnitValue(),
      inputSeeds.length || endpoint.path.length,
    ),
  );

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
        status: PLANNED,
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
        status: PLANNED,
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
          status: PLANNED,
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
          status: PLANNED,
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
      status: PLANNED,
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
        status: PLANNED,
        severity: 'medium',
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

  if (deletesState) return 'critical';
  if ((mutatesState || hasObservedStateMutation) && !hasBoundaryProtection) return 'critical';
  if ((mutatesState || hasObservedStateMutation) && endpoint.requiresTenant) return 'high';
  if (
    (mutatesState || hasObservedStateMutation) &&
    acceptsStructuredInput &&
    !hasOperationalBrake
  ) {
    return 'high';
  }
  if (mutatesState) return 'medium';
  if (endpoint.requiresAuth || endpoint.requiresTenant) return 'medium';

  if (!endpoint.requiresAuth && endpoint.method === 'GET') {
    return 'low';
  }

  return 'medium';
}
