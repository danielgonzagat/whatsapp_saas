import * as path from 'path';
import type { PulseConfig } from '../types.manifest';
import type { HarnessTarget, HarnessTargetKind } from '../types.execution-harness';
import { parseBackendRoutes } from '../parsers/backend-parser';
import { walkFiles } from '../parsers/utils';
import { readTextFile } from '../safe-fs';
import {
  CRO_KIND_LABEL,
  ENDPOINT_KIND_LABEL,
  mutatingHttpVerbs,
  persistentStateMutationShape,
  SERVICE_KIND_LABEL,
  targetKindFromDecorator,
  WEBHOOK_KIND_LABEL,
  WORKER_KIND_LABEL,
} from './grammar';
import {
  camelToKebab,
  EXECUTABLE_FEASIBILITY,
  isWebhookLikeTarget,
  NEEDS_STAGING_FEASIBILITY,
  normalizeDiscoveredLocator,
  parseRouteParameters,
  unique,
} from './helpers';
import {
  RawWorkerDiscovery,
  extractConstructorAliases,
  extractPublicMethods,
  collectPrismaModelsFromText,
  nestjsBullMQDiscoveries,
  rawWorkerDiscoveries,
  resolveDependencyNames,
} from './discovery';

/**
 * Discover HTTP endpoint targets from NestJS controllers.
 *
 * Scans `@Controller()` classes and extracts all route handlers decorated with
 * `@Get`, `@Post`, `@Put`, `@Delete`, or `@Patch`. Determines auth requirements
 * from `@UseGuards()` and `@Public()` decorators.
 *
 * @param config - PULSE configuration with backend directory paths
 * @returns Array of endpoint harness targets
 */
export function discoverEndpoints(config: PulseConfig): HarnessTarget[] {
  const parsedBackendEntries = parseBackendRoutes(config);

  return parsedBackendEntries.map((parsedEntry) => {
    const kind = targetKindFromDecorator(parsedEntry.httpMethod);
    const normalizedLocator = normalizeDiscoveredLocator(parsedEntry.fullPath);
    const targetId = `endpoint:${parsedEntry.httpMethod.toLowerCase()}:${camelToKebab(normalizedLocator)}`;

    const requiresAuth = !parsedEntry.isPublic && parsedEntry.guards.length > 0;
    const requiresTenant =
      requiresAuth &&
      (parseRouteParameters(normalizedLocator).length > 0 ||
        parsedEntry.serviceCalls.length > 0 ||
        mutatingHttpVerbs().has(parsedEntry.httpMethod.toUpperCase()));

    return {
      targetId,
      kind,
      name: `${parsedEntry.controllerPath}/${parsedEntry.methodName}`,
      filePath: parsedEntry.file,
      methodName: parsedEntry.methodName,
      routePattern: normalizedLocator,
      httpMethod: parsedEntry.httpMethod,
      requiresAuth,
      requiresTenant,
      dependencies: parsedEntry.serviceCalls.map((call) => {
        const dotIndex = call.lastIndexOf('.');
        return dotIndex !== -1 ? call.slice(0, dotIndex) : call;
      }),
      fixtures: [],
      feasibility: EXECUTABLE_FEASIBILITY,
      feasibilityReason: '',
      generatedTests: [],
      generated: false,
    };
  });
}

/**
 * Discover service-level targets from `@Injectable()` classes.
 *
 * Scans service files and extracts every public method as a harness target.
 * Each target's dependencies are resolved by tracing constructor injection
 * and intra-method `this.dependency.method()` calls.
 *
 * @param config - PULSE configuration with backend directory paths
 * @returns Array of service harness targets
 */
export function discoverServices(config: PulseConfig): HarnessTarget[] {
  const targets: HarnessTarget[] = [];

  const files = walkFiles(config.backendDir, ['.ts']).filter(
    (f) =>
      !/\.(spec|test|d)\.ts$/.test(f) &&
      !/node_modules/.test(f) &&
      (/\.service\.ts$/.test(f) ||
        /\.engine\.ts$/.test(f) ||
        /\.guard\.ts$/.test(f) ||
        /\.interceptor\.ts$/.test(f) ||
        /\.middleware\.ts$/.test(f)),
  );

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    if (!/@Injectable\(\)/.test(content)) {
      continue;
    }

    const classMatch = content.match(/export\s+class\s+(\w+)/);
    const className = classMatch ? classMatch[1] : path.basename(file, '.ts');
    const methods = extractPublicMethods(content);
    const aliases = extractConstructorAliases(content);

    for (const method of methods) {
      const targetId = `service:${camelToKebab(className)}:${camelToKebab(method.name)}`;
      const relFile = path.relative(config.rootDir, file);

      const dependencyEdges = resolveDependencyNames(file, className, method.name);
      const serviceDependencyIds = dependencyEdges.map(
        (dep) => `service:${camelToKebab(dep.className)}`,
      );

      // Detect Prisma models accessed within the method body
      const methodRe = new RegExp(`\\b${method.name}\\s*(?:<[^>]+>)?\\s*\\(`);
      const methodMatch = content.match(methodRe);
      let prismaModels: string[] = [];
      let methodBodyText = '';
      if (methodMatch && typeof methodMatch.index === 'number') {
        const afterMethod = content.slice(methodMatch.index);
        let braceDepth = 0;
        let bodyStart = -1;
        let bodyEnd = -1;
        for (let i = 0; i < afterMethod.length; i++) {
          const ch = afterMethod[i];
          if (ch === '{') {
            if (bodyStart === -1) {
              bodyStart = i;
            }
            braceDepth++;
          } else if (ch === '}') {
            braceDepth--;
            if (braceDepth === 0 && bodyStart !== -1) {
              bodyEnd = i;
              break;
            }
          }
        }
        const bodyText =
          bodyStart !== -1 && bodyEnd !== -1
            ? afterMethod.slice(bodyStart, bodyEnd + 1)
            : afterMethod.slice(0, Math.min(2000, afterMethod.length));
        methodBodyText = bodyText;
        prismaModels = collectPrismaModelsFromText(bodyText);
      }
      const hasPersistentMutation =
        prismaModels.length > 0 && persistentStateMutationShape().test(methodBodyText);
      const requiresAuth = false;
      const requiresTenant = hasPersistentMutation;
      const dependencies = unique([
        ...serviceDependencyIds,
        ...prismaModels.map((model) => `model:${model}`),
      ]);

      targets.push({
        targetId,
        kind: SERVICE_KIND_LABEL as HarnessTargetKind,
        name: `${className}.${method.name}`,
        filePath: relFile,
        methodName: method.name,
        routePattern: null,
        httpMethod: null,
        requiresAuth,
        requiresTenant,
        dependencies,
        fixtures: [],
        feasibility: EXECUTABLE_FEASIBILITY,
        feasibilityReason: '',
        generatedTests: [],
        generated: false,
      });
    }
  }

  return targets;
}

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
      kind: WORKER_KIND_LABEL as HarnessTargetKind,
      name: `${discovery.queueName}/${discovery.handlerName}`,
      filePath: discovery.file,
      methodName: discovery.handlerName,
      routePattern: null,
      httpMethod: null,
      requiresAuth: false,
      requiresTenant: false,
      dependencies: [],
      fixtures: [],
      feasibility: NEEDS_STAGING_FEASIBILITY,
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
      kind: WORKER_KIND_LABEL as HarnessTargetKind,
      name: `${discovery.queueName}/${discovery.handlerName}`,
      filePath: discovery.file,
      methodName: discovery.handlerName,
      routePattern: null,
      httpMethod: null,
      requiresAuth: false,
      requiresTenant: false,
      dependencies: [],
      fixtures: [],
      feasibility: NEEDS_STAGING_FEASIBILITY,
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
        kind: WORKER_KIND_LABEL as HarnessTargetKind,
        name: `${discovery.queueName}/${discovery.handlerName}`,
        filePath: discovery.file,
        methodName: discovery.handlerName,
        routePattern: null,
        httpMethod: null,
        requiresAuth: false,
        requiresTenant: false,
        dependencies: [],
        fixtures: [],
        feasibility: NEEDS_STAGING_FEASIBILITY,
        feasibilityReason: 'Worker requires queue infrastructure',
        generatedTests: [],
        generated: false,
      });
    }
  }

  return targets;
}

/**
 * Discover cron targets from `@Cron()` decorated methods.
 *
 * Scans the backend directory for NestJS `@Cron(schedule)` decorators.
 * Each scheduled method becomes a harness target.
 *
 * @param config - PULSE configuration with backend directory paths
 * @returns Array of cron harness targets
 */
export function discoverCrons(config: PulseConfig): HarnessTarget[] {
  const targets: HarnessTarget[] = [];

  const files = walkFiles(config.backendDir, ['.ts']).filter(
    (f) => !/\.(spec|test|d)\.ts$/.test(f) && !/node_modules/.test(f),
  );

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    if (!/@Cron\s*\(/.test(content)) {
      continue;
    }

    const classMatch = content.match(/export\s+class\s+(\w+)/);
    const className = classMatch ? classMatch[1] : path.basename(file, '.ts');

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const cronMatch = trimmed.match(/@Cron\(\s*([^)]*)\)/);
      if (!cronMatch) {
        continue;
      }

      const cronExpr = cronMatch[1].replace(/\s+/g, ' ').trim();

      // Find the method name on the next line(s)
      let methodName = 'unknown';
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const methodLine = lines[j].trim();
        if (methodLine.startsWith('@')) {
          continue;
        }
        const nameMatch = methodLine.match(
          /^(?:public|private|protected)?\s*(?:async\s+)?([A-Za-z_]\w*)\s*\(/,
        );
        if (nameMatch) {
          methodName = nameMatch[1];
          break;
        }
      }

      const targetId = `cron:${camelToKebab(className)}:${camelToKebab(methodName)}`;

      targets.push({
        targetId,
        kind: CRO_KIND_LABEL as HarnessTargetKind,
        name: `${className}.${methodName} (${cronExpr})`,
        filePath: relFile,
        methodName,
        routePattern: null,
        httpMethod: null,
        requiresAuth: false,
        requiresTenant: false,
        dependencies: [],
        fixtures: [],
        feasibility: EXECUTABLE_FEASIBILITY,
        feasibilityReason: '',
        generatedTests: [],
        generated: false,
      });
    }
  }

  return targets;
}

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
      kind: WEBHOOK_KIND_LABEL as HarnessTargetKind,
      targetId: ep.targetId.replace(/^endpoint:/, 'webhook:'),
      requiresAuth: false, // webhooks typically use signature verification, not JWT
    }));
}
