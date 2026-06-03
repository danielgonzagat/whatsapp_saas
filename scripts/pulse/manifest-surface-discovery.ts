import type { PulseConfig } from './types.manifest';
import type { CoreParserData } from './functional-map-types';
import { pathExists } from './safe-fs';

export function discoverSurfaceKinds(config: PulseConfig, coreData: CoreParserData): string[] {
  const discovered = new Set<string>();

  if (coreData.uiElements.length > 0) {
    discovered.add('frontend-ui');
  }
  if (coreData.apiCalls.length > 0) {
    discovered.add('frontend-api-client');
  }
  if (coreData.proxyRoutes.length > 0) {
    discovered.add('frontend-proxy');
  }
  if (coreData.backendRoutes.length > 0) {
    discovered.add('backend-routes');
  }
  if (coreData.prismaModels.length > 0) {
    discovered.add('database-models');
  }
  if (pathExists(config.workerDir)) {
    discovered.add('workers');
  }
  if (coreData.backendRoutes.some((route) => /webhook/i.test(route.fullPath))) {
    discovered.add('webhooks');
  }
  if (coreData.serviceTraces.some((trace) => /queue|bull|job/i.test(trace.serviceName))) {
    discovered.add('queues');
  }

  return [...discovered].sort();
}
