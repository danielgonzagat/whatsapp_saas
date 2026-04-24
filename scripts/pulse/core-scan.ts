/**
 * Core parser phase: runs all 8 synchronous parsers and returns CoreParserData.
 * Extracted to keep daemon.ts under 600 lines.
 */
import type { PulseConfig } from './types';
import type { CoreParserData } from './functional-map-types';
import { parseSchema } from './parsers/schema-parser';
import { parseBackendRoutes } from './parsers/backend-parser';
import { traceServices } from './parsers/service-tracer';
import { parseAPICalls, parseProxyRoutes } from './parsers/api-parser';
import { parseUIElements } from './parsers/ui-parser';
import { detectFacades } from './parsers/facade-detector';
import { buildHookRegistry } from './parsers/hook-registry';
import type { PulseExecutionTracer } from './execution-trace';

/** Run all synchronous core parsers and return CoreParserData. */
export function runCoreParsers(config: PulseConfig, tracer?: PulseExecutionTracer): CoreParserData {
  tracer?.startPhase('scan:core-parsers');
  const prismaModels = parseSchema(config);
  const backendRoutes = parseBackendRoutes(config);
  const serviceTraces = traceServices(config);
  const apiCalls = parseAPICalls(config);
  const proxyRoutes = parseProxyRoutes(config);
  const hookRegistry = buildHookRegistry(config);
  const uiElements = parseUIElements(config, hookRegistry);
  const facades = detectFacades(config);
  tracer?.finishPhase('scan:core-parsers', 'passed', {
    metadata: {
      uiElements: uiElements.length,
      apiCalls: apiCalls.length,
      backendRoutes: backendRoutes.length,
      prismaModels: prismaModels.length,
      serviceTraces: serviceTraces.length,
      proxyRoutes: proxyRoutes.length,
      facades: facades.length,
    },
  });

  return {
    uiElements,
    apiCalls,
    backendRoutes,
    prismaModels,
    serviceTraces,
    proxyRoutes,
    facades,
    hookRegistry,
  };
}
