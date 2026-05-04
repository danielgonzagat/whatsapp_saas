import type { PulseConfig } from '../../types';
import type { HarnessTarget } from '../../types.execution-harness';
import { parseBackendRoutes } from '../../parsers/backend-parser';
import { targetKindFromDecorator, mutatingHttpVerbs } from './grammar';
import { camelToKebab, normalizeDiscoveredLocator, parseRouteParameters } from './helpers';

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
      feasibility: 'executable',
      feasibilityReason: '',
      generatedTests: [],
      generated: false,
    };
  });
}
