import type { FuzzStrategy, FuzzTestCase } from '../../types.property-tester';
import type { EndpointDescriptor, EndpointProofProfile } from './types';
import { classifyEndpointRisk, buildEndpointProofProfile } from './endpoint-discovery';
import { deriveHttpStatusFromObservedCatalog as httpStatus } from '../../dynamic-reality-kernel';
import { isObservedMutatingMethod } from '../../dynamic-reality-grammar';
import { unitValue, zeroValue, unitWhen, addExpectedStatus } from './util';

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

function synthesizeFuzzStrategies(profile: EndpointProofProfile): FuzzStrategy[] {
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

function strategyWeight(strategy: FuzzStrategy, profile: EndpointProofProfile): number {
  let surfaceWidth = Math.max(unitValue(), profile.inputTypes.size);
  let stateWidth = surfaceWidth + unitWhen(profile.stateEffect !== 'read_only');
  let schemaWidth = stateWidth + unitWhen(profile.hasSchema);
  let publicWidth = schemaWidth + unitWhen(profile.runtimeExposure === 'public');
  let observedWeights = new Map<FuzzStrategy, number[]>([
    ['valid_only', [surfaceWidth, unitValue()]],
    ['invalid_only', [publicWidth, surfaceWidth]],
    ['boundary', [schemaWidth, surfaceWidth, stateWidth]],
    ['random', [publicWidth, schemaWidth, stateWidth, surfaceWidth]],
    ['both', [schemaWidth, stateWidth]],
  ]);
  let selectedWeights = observedWeights.get(strategy) ?? [surfaceWidth];
  return selectedWeights.reduce((total, value) => total + value, zeroValue());
}

function estimateRequestCount(strategy: FuzzStrategy, profile: EndpointProofProfile): number {
  return strategyWeight(strategy, profile);
}

function generateExpectedStatusCodes(
  endpoint: EndpointDescriptor,
  strategy: FuzzStrategy,
  profile: EndpointProofProfile,
): Record<number, number> {
  let codes: Record<number, number> = {};
  let method = endpoint.method.toUpperCase();
  let successCode = isObservedMutatingMethod(method) ? httpStatus('Created') : httpStatus('OK');
  let surfaceWidth = Math.max(unitValue(), profile.inputTypes.size);
  let schemaWidth = surfaceWidth + unitWhen(profile.hasSchema);

  switch (strategy) {
    case 'valid_only':
      addExpectedStatus(codes, successCode, unitValue());
      break;
    case 'invalid_only':
      addExpectedStatus(codes, httpStatus('Bad Request'), surfaceWidth);
      addExpectedStatus(codes, httpStatus('Unprocessable Entity'), schemaWidth);
      if (profile.runtimeExposure === 'protected') {
        addExpectedStatus(codes, httpStatus('Unauthorized'), unitValue());
        addExpectedStatus(codes, httpStatus('Forbidden'), unitValue());
      }
      break;
    case 'boundary':
      addExpectedStatus(codes, successCode, surfaceWidth);
      addExpectedStatus(codes, httpStatus('Bad Request'), schemaWidth + surfaceWidth);
      addExpectedStatus(codes, httpStatus('Unprocessable Entity'), schemaWidth);
      if (profile.inputTypes.has('request_body')) {
        addExpectedStatus(codes, httpStatus('Payload Too Large'), unitValue());
      }
      break;
    case 'random':
      addExpectedStatus(codes, successCode, schemaWidth);
      addExpectedStatus(codes, httpStatus('Bad Request'), schemaWidth);
      addExpectedStatus(codes, httpStatus('Not Found'), unitValue());
      addExpectedStatus(codes, httpStatus('Unprocessable Entity'), schemaWidth);
      if (endpoint.rateLimit !== undefined && endpoint.rateLimit !== null) {
        addExpectedStatus(codes, httpStatus('Too Many Requests'), unitValue());
      }
      if (profile.runtimeExposure === 'protected') {
        addExpectedStatus(codes, httpStatus('Unauthorized'), surfaceWidth);
        addExpectedStatus(codes, httpStatus('Forbidden'), unitValue());
      }
      break;
    case 'both':
      addExpectedStatus(codes, successCode, surfaceWidth);
      addExpectedStatus(codes, httpStatus('Bad Request'), schemaWidth);
      addExpectedStatus(codes, httpStatus('Unprocessable Entity'), schemaWidth);
      break;
    default:
      break;
  }

  return codes;
}
