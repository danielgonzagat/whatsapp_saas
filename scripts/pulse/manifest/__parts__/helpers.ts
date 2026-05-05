import { safeJoin } from '../../safe-path';
import * as path from 'path';
import type { PulseConfig, PulseManifest, Break } from '../../types.manifest';
import type { CoreParserData } from '../../functional-map-types';
import { pathExists } from '../../safe-fs';
import { deriveStringUnionMembersFromTypeContract } from '../../dynamic-reality-kernel/__parts__/type-contract-labels';
import {
  discoverActorKindLabels,
  discoverEnvironmentLabels,
  discoverProviderModeLabels,
  discoverScenarioKindLabels,
  discoverTimeWindowModeLabels,
} from '../../dynamic-reality-kernel/__parts__/type-contract-engines';

export const PULSE_MANIFEST_FILENAME = 'pulse.manifest.json';

export const SUPPORTED_STACKS = new Set<string>();

export const REQUIRED_FIELDS: Array<keyof PulseManifest> = [
  'version',
  'projectId',
  'projectName',
  'systemType',
  'supportedStacks',
  'surfaces',
  'criticalDomains',
  'modules',
  'actorProfiles',
  'scenarioSpecs',
  'externalIntegrations',
  'jobs',
  'webhooks',
  'stateMachines',
  'criticalFlows',
  'invariants',
  'flowSpecs',
  'invariantSpecs',
  'temporaryAcceptances',
  'certificationTiers',
  'finalReadinessCriteria',
  'slos',
  'securityRequirements',
  'recoveryRequirements',
  'excludedSurfaces',
  'environments',
];

export function manifestBreak(
  type: 'MANIFEST_MISSING' | 'MANIFEST_INVALID' | 'UNKNOWN_SURFACE',
  description: string,
  detail: string,
  file: string,
  line: number = 1,
): Break {
  return {
    type,
    severity: 'high',
    file,
    line,
    description,
    detail,
    source: 'manifest',
  };
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every((item) => typeof item === 'string')
  );
}

export function isManifestModuleArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return false;
      }
      const record = entry as Record<string, unknown>;
      return (
        typeof record.name === 'string' &&
        typeof record.state === 'string' &&
        typeof record.notes === 'string'
      );
    })
  );
}

export function isEnvironmentArray(value: unknown): boolean {
  const envLabels = discoverEnvironmentLabels();
  return Array.isArray(value) && value.every((item) => envLabels.has(item as string));
}

export function isTimeWindowModeArray(value: unknown): boolean {
  const modeLabels = discoverTimeWindowModeLabels();
  return Array.isArray(value) && value.every((item) => modeLabels.has(item as string));
}

export function isActorKind(value: unknown): boolean {
  return discoverActorKindLabels().has(value as string);
}

export function isScenarioKind(value: unknown): boolean {
  return discoverScenarioKindLabels().has(value as string);
}

export function isProviderMode(value: unknown): boolean {
  return discoverProviderModeLabels().has(value as string);
}

export function isScenarioRunner(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isScenarioExecutionMode(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isGateNameArray(value: unknown): boolean {
  return isStringArray(value);
}

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
