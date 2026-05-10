import type { FuzzStrategy, FuzzTestCase } from '../../types.property-tester';
import {
  isObservedDestructiveMethod,
  isObservedMutatingMethod,
  observedMethodAcceptsBody,
} from '../../dynamic-reality-grammar';
import {
  deriveEndpointRiskFromObservedProfile,
  deriveExpectedStatusCodesFromObservedProfile,
  deriveStrategyWeightFromObservedProfile,
} from '../../dynamic-reality-kernel/profile-derivations';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/catalog-arithmetic';
import {
  hasObservedToken,
  splitIdentifierTokensFromObservedName,
} from '../../dynamic-reality-kernel/token-evidence';
import { addExpectedStatus, hasQueryParameter, isStringEvidence } from './core';

type EndpointRisk = 'high' | 'medium' | 'low';
type ProofInputType = 'none' | 'path_parameter' | 'query_parameter' | 'request_body' | 'schema';
type EntrypointType = 'read_endpoint' | 'state_endpoint' | 'external_receiver';
type StateEffect = 'read_only' | 'state_mutation' | 'destructive_mutation';

interface EndpointDescriptor {
  method: string;
  path: string;
  filePath: string;
  requiresAuth?: boolean;
  requiresTenant?: boolean;
  rateLimit?: unknown;
  requestSchema?: unknown;
  responseSchema?: unknown;
}

interface EndpointProofProfile {
  inputTypes: Set<ProofInputType>;
  entrypointType: EntrypointType;
  stateEffect: StateEffect;
  hasExternalEffect: boolean;
  hasSchema: boolean;
  runtimeExposure: 'public' | 'protected' | 'unknown';
}

/**
 * Classify an endpoint's security risk level based on request shape.
 *
 * @param endpoint  The normalized route path or endpoint descriptor.
 * @returns          "high", "medium", or "low".
 */
export function classifyEndpointRisk(endpoint: string | EndpointDescriptor): EndpointRisk {
  let proofShape = buildEndpointProofProfile(
    isStringEvidence(endpoint) ? { method: 'GET', path: endpoint, filePath: '' } : endpoint,
  );
  return deriveEndpointRiskFromObservedProfile(
    proofShape.stateEffect,
    proofShape.hasExternalEffect,
    proofShape.runtimeExposure,
    proofShape.inputTypes.has('path_parameter'),
    proofShape.inputTypes.has('query_parameter'),
    proofShape.hasSchema,
  );
}

export function buildEndpointProofProfile(endpoint: EndpointDescriptor): EndpointProofProfile {
  let method = endpoint.method.toUpperCase();
  let segments = endpoint.path.split('/').filter(Boolean);
  let inputTypes = new Set<ProofInputType>();
  let routeText = `${endpoint.path} ${endpoint.filePath}`;
  let hasSchema = Boolean(endpoint.requestSchema);
  let acceptsBody = observedMethodAcceptsBody(method, hasSchema);
  let routeTokens = splitIdentifierTokensFromObservedName(routeText);
  let hasExternalReceiverShape = hasObservedToken(routeTokens, [
    'webhook',
    'callback',
    'event',
    'receiver',
    'listener',
  ]);

  if (segments.some((segment) => segment.startsWith(':'))) {
    inputTypes.add('path_parameter');
  }
  if (hasQueryParameter(endpoint.path)) {
    inputTypes.add('query_parameter');
  }
  if (acceptsBody) {
    inputTypes.add('request_body');
  }
  if (hasSchema) {
    inputTypes.add('schema');
  }
  if (!inputTypes.size) {
    inputTypes.add('none');
  }

  let stateEffect: StateEffect = isObservedDestructiveMethod(method)
    ? 'destructive_mutation'
    : isObservedMutatingMethod(method)
      ? 'state_mutation'
      : 'read_only';
  let runtimeExposure: EndpointProofProfile['runtimeExposure'] =
    endpoint.requiresAuth === Boolean(deriveUnitValue()) ||
    endpoint.requiresTenant === Boolean(deriveUnitValue())
      ? 'protected'
      : endpoint.requiresAuth === Boolean(deriveZeroValue()) ||
          endpoint.requiresTenant === Boolean(deriveZeroValue())
        ? 'public'
        : 'unknown';
  let entrypointType: EntrypointType = hasExternalReceiverShape
    ? 'external_receiver'
    : stateEffect === 'read_only'
      ? 'read_endpoint'
      : 'state_endpoint';

  return {
    inputTypes,
    entrypointType,
    stateEffect,
    hasExternalEffect: hasExternalReceiverShape || entrypointType === 'external_receiver',
    hasSchema,
    runtimeExposure,
  };
}

/**
 * Generate fuzz test case metadata for each discovered endpoint.
 * Each endpoint gets multiple strategies, producing a rich test catalog.
 *
 * @param endpoints  Endpoint descriptors with method, path, and filePath.
 * @returns          Array of fuzz test case metadata.
 */
export function generateFuzzCasesFromEndpoints(endpoints: EndpointDescriptor[]): FuzzTestCase[] {
  let cases: FuzzTestCase[] = [];

  let counter = 0;

  for (let endpoint of endpoints) {
    let profile = buildEndpointProofProfile(endpoint);
    let strategies = synthesizeFuzzStrategies(profile);
    for (let strategy of strategies) {
      let risk = classifyEndpointRisk(endpoint);
      let testId = `fuzz-${String(++counter).padStart(4, '0')}`;
      let expectedStatuses = generateExpectedStatusCodes(endpoint, strategy, profile);

      let securityIssues: Array<{ type: string; description: string; payload: unknown }> = [];

      if (risk === 'high' && strategy === 'invalid_only' && !profile.inputTypes.has('none')) {
        securityIssues.push({
          type: 'injection',
          description: `High-risk input surface ${endpoint.method} ${endpoint.path} requires injection and XSS fuzzing`,
          payload: null,
        });
      }

      if (risk === 'high' && strategy === 'boundary' && profile.inputTypes.size > 0) {
        securityIssues.push({
          type: 'boundary',
          description: `High-risk input surface ${endpoint.method} ${endpoint.path} requires boundary testing`,
          payload: null,
        });
      }

      cases.push({
        testId,
        endpoint: `${endpoint.method} ${endpoint.path}`,
        method: endpoint.method,
        strategy,
        status: 'planned',
        requestCount: estimateRequestCount(strategy, profile),
        statusCodes: expectedStatuses,
        failures: 0,
        securityIssues,
        durationMs: 0,
      });
    }
  }

  return cases;
}

export function synthesizeFuzzStrategies(profile: EndpointProofProfile): FuzzStrategy[] {
  let strategies = new Set<FuzzStrategy>(['valid_only']);

  if (!profile.inputTypes.has('none') || profile.hasSchema) {
    strategies.add('invalid_only');
  }
  if (
    profile.inputTypes.has('path_parameter') ||
    profile.inputTypes.has('request_body') ||
    profile.hasSchema ||
    profile.stateEffect !== 'read_only'
  ) {
    strategies.add('boundary');
  }
  if (
    profile.entrypointType === 'external_receiver' ||
    profile.runtimeExposure !== 'protected' ||
    profile.hasSchema
  ) {
    strategies.add('random');
  }
  if (profile.stateEffect !== 'read_only' && profile.hasSchema) {
    strategies.add('both');
  }

  return [...strategies];
}

export function strategyWeight(strategy: FuzzStrategy, profile: EndpointProofProfile): number {
  return deriveStrategyWeightFromObservedProfile(
    strategy,
    profile.inputTypes.size,
    profile.stateEffect !== 'read_only',
    profile.hasSchema,
    profile.runtimeExposure === 'public',
  );
}

export function estimateRequestCount(
  strategy: FuzzStrategy,
  profile: EndpointProofProfile,
): number {
  return strategyWeight(strategy, profile);
}

export function generateExpectedStatusCodes(
  endpoint: EndpointDescriptor,
  strategy: FuzzStrategy,
  profile: EndpointProofProfile,
): Record<number, number> {
  return deriveExpectedStatusCodesFromObservedProfile(
    endpoint.method,
    strategy,
    profile.inputTypes.size,
    profile.hasSchema,
    profile.inputTypes.has('request_body'),
    endpoint.rateLimit !== undefined && endpoint.rateLimit !== null,
    profile.runtimeExposure === 'protected',
  );
}

export { addExpectedStatus };
