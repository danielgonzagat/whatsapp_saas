import type { PulseConfig } from '../../types';
import type { HarnessTarget, HarnessTargetKind } from '../../types.execution-harness';
import { isWebhookLikeTarget } from './helpers';
import { discoverEndpoints } from './discover-endpoints';

/**
 * Discover webhook handler targets.
 *
 * Identifies webhook endpoints from POST routes and inbound delivery markers
 * such as callback, event, or signature handling. Each handler is registered
 * as a harness target with webhook-specific fixture requirements.
 *
 * @param config - PULSE configuration with backend directory paths
 * @param allEndpoints - Pre-discovered endpoint targets (used to filter webhooks)
 * @returns Array of webhook harness targets
 */
export function discoverWebhooks(
  config: PulseConfig,
  allEndpoints: HarnessTarget[] = [],
): HarnessTarget[] {
  const endpoints = allEndpoints.length > 0 ? allEndpoints : discoverEndpoints(config);

  return endpoints
    .filter((ep) => {
      return isWebhookLikeTarget(ep);
    })
    .map((ep) => ({
      ...ep,
      kind: 'webhook' as HarnessTargetKind,
      targetId: ep.targetId.replace(/^endpoint:/, 'webhook:'),
      requiresAuth: false, // webhooks typically use signature verification, not JWT
    }));
}
