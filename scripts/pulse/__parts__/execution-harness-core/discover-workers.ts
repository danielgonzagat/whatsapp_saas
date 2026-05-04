import type { PulseConfig } from '../../types';
import type { HarnessTarget } from '../../types.execution-harness';
import { camelToKebab } from './helpers';
import { rawWorkerDiscoveries, nestjsBullMQDiscoveries } from './worker-detection';

/**
 * Discover worker targets from BullMQ processors.
 *
 * Detects both raw `new Worker('queue-name', ...)` invocations and NestJS
 * `@Processor()` / `@Process()` decorator patterns. Each job handler is
 * registered as a harness target.
 *
 * @param config - PULSE configuration with backend and worker directory paths
 * @returns Array of worker harness targets
 */
export function discoverWorkers(config: PulseConfig): HarnessTarget[] {
  const targets: HarnessTarget[] = [];

  // Raw BullMQ workers in backend
  const backendDiscoveries = rawWorkerDiscoveries(config.backendDir);
  for (const discovery of backendDiscoveries) {
    const targetId = `worker:${camelToKebab(discovery.queueName)}:${camelToKebab(discovery.handlerName)}`;

    targets.push({
      targetId,
      kind: 'worker',
      name: `${discovery.queueName}/${discovery.handlerName}`,
      filePath: discovery.file,
      methodName: discovery.handlerName,
      routePattern: null,
      httpMethod: null,
      requiresAuth: false,
      requiresTenant: false,
      dependencies: [],
      fixtures: [],
      feasibility: 'needs_staging',
      feasibilityReason: 'Worker requires queue infrastructure',
      generatedTests: [],
      generated: false,
    });
  }

  // NestJS BullMQ @Processor decorators in backend
  const nestjsBackend = nestjsBullMQDiscoveries(config.backendDir);
  for (const discovery of nestjsBackend) {
    const targetId = `worker:${camelToKebab(discovery.queueName)}:${camelToKebab(discovery.handlerName)}`;

    if (targets.some((t) => t.targetId === targetId)) {
      continue;
    }

    targets.push({
      targetId,
      kind: 'worker',
      name: `${discovery.queueName}/${discovery.handlerName}`,
      filePath: discovery.file,
      methodName: discovery.handlerName,
      routePattern: null,
      httpMethod: null,
      requiresAuth: false,
      requiresTenant: false,
      dependencies: [],
      fixtures: [],
      feasibility: 'needs_staging',
      feasibilityReason: 'Worker requires queue infrastructure',
      generatedTests: [],
      generated: false,
    });
  }

  // Worker directory (if applicable)
  if (config.workerDir && config.workerDir !== config.backendDir) {
    const workerDiscoveries = rawWorkerDiscoveries(config.workerDir);
    for (const discovery of workerDiscoveries) {
      const targetId = `worker:${camelToKebab(discovery.queueName)}:${camelToKebab(discovery.handlerName)}`;

      if (targets.some((t) => t.targetId === targetId)) {
        continue;
      }

      targets.push({
        targetId,
        kind: 'worker',
        name: `${discovery.queueName}/${discovery.handlerName}`,
        filePath: discovery.file,
        methodName: discovery.handlerName,
        routePattern: null,
        httpMethod: null,
        requiresAuth: false,
        requiresTenant: false,
        dependencies: [],
        fixtures: [],
        feasibility: 'needs_staging',
        feasibilityReason: 'Worker requires queue infrastructure',
        generatedTests: [],
        generated: false,
      });
    }
  }

  return targets;
}
