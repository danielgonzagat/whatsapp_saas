import type { APIEndpointProbe } from '../../types.api-fuzzer';
import { endpointHasStateMutationSignal } from './payload-synthesis';

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
