import { safeJoin, safeResolve } from './safe-path';
import * as path from 'path';
import type { PulseConfig, PulseManifest, PulseManifestLoadResult, Break } from './types';
import type { CoreParserData } from './functional-map-types';
import { pathExists, readTextFile } from './safe-fs';

/** Pulse_manifest_filename. */
export const PULSE_MANIFEST_FILENAME = 'pulse.manifest.json';

/** Supported_stacks. */
export const SUPPORTED_STACKS = new Set<string>();

const REQUIRED_FIELDS: Array<keyof PulseManifest> = [
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

function manifestBreak(
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every((item) => typeof item === 'string')
  );
}

function isManifestModuleArray(value: unknown): boolean {
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

function isEnvironmentArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((item) => item === 'scan' || item === 'deep' || item === 'total')
  );
}

function isTimeWindowModeArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((item) => item === 'total' || item === 'shift' || item === 'soak')
  );
}

function isActorKind(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isScenarioKind(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isProviderMode(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isScenarioRunner(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isScenarioExecutionMode(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isGateNameArray(value: unknown): boolean {
  return isStringArray(value);
}
