import type { APIEndpointProbe } from '../../types.api-fuzzer';
import { parseRouteParameters, uniqueStrings } from './helpers';
import { schemaFieldsFromEndpoint, sampleValueForFieldType } from './schema-parsers';

export function buildMassAssignmentPayloads(endpoint: APIEndpointProbe): unknown[] {
  const schemaFields = schemaFieldsFromEndpoint(endpoint);
  const fieldEntries = Object.entries(schemaFields).slice(
    0,
    Math.max(1, Math.min(3, Object.keys(schemaFields).length)),
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

export function buildSentinel(endpoint: APIEndpointProbe, seed: string): string {
  return `__pulse_${endpoint.method.toLowerCase()}_${seed.replace(/\W+/g, '_')}`;
}

export function routeAndSchemaSeeds(endpoint: APIEndpointProbe): string[] {
  const schemaFields = Object.keys(schemaFieldsFromEndpoint(endpoint));
  const routeParameters =
    endpoint.authProbeMetadata?.routeParameters ?? parseRouteParameters(endpoint.path);
  const routeSegments = endpoint.path
    .split('/')
    .map((segment) => segment.replace(/^:/, ''))
    .filter((segment) => segment.length > 0);

  return uniqueStrings([...schemaFields, ...routeParameters, ...routeSegments]);
}

export function synthesizeSqlMutationPayloads(endpoint: APIEndpointProbe): unknown[] {
  return routeAndSchemaSeeds(endpoint).map((seed) => {
    const sentinel = buildSentinel(endpoint, seed);
    return `${sentinel}' OR '${seed}'='${seed}`;
  });
}

export function synthesizeMarkupMutationPayloads(endpoint: APIEndpointProbe): unknown[] {
  return routeAndSchemaSeeds(endpoint).map((seed) => {
    const sentinel = buildSentinel(endpoint, seed);
    return `<${seed} data-pulse="${sentinel}">${sentinel}</${seed}>`;
  });
}

export function synthesizeOperatorMutationPayloads(endpoint: APIEndpointProbe): unknown[] {
  return routeAndSchemaSeeds(endpoint).map((seed) => ({
    [`$${seed}`]: buildSentinel(endpoint, seed),
  }));
}

export function synthesizeRedirectPayloads(endpoint: APIEndpointProbe): unknown[] {
  return routeAndSchemaSeeds(endpoint)
    .filter((seed) => /url|uri|redirect|callback|return|next/i.test(seed))
    .map((seed) => {
      const sentinel = buildSentinel(endpoint, seed);
      return `https://${sentinel}.invalid/${seed}`;
    });
}

export function synthesizeIdorPayload(endpoint: APIEndpointProbe): Record<string, string> {
  const routeParameters =
    endpoint.authProbeMetadata?.routeParameters ?? parseRouteParameters(endpoint.path);
  return Object.fromEntries(
    routeParameters.map((routeParameter) => [routeParameter, `alternate-${routeParameter}-probe`]),
  );
}

export function endpointHasStateMutationSignal(endpoint: APIEndpointProbe): boolean {
  const effectGraph = endpoint.responseSchema?.effectGraph;
  if (!effectGraph || typeof effectGraph !== 'object') {
    return false;
  }

  const candidate = effectGraph as { stateMutationSignals?: unknown };
  return Array.isArray(candidate.stateMutationSignals) && candidate.stateMutationSignals.length > 0;
}
