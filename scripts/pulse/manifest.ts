import * as fs from 'fs';
import * as path from 'path';
import type { PulseConfig, PulseManifest, PulseManifestLoadResult, Break } from './types';
import type { CoreParserData } from './functional-map-types';

export const PULSE_MANIFEST_FILENAME = 'pulse.manifest.json';

export const SUPPORTED_STACKS = new Set([
  'nextjs-app-router',
  'react-ui',
  'nestjs',
  'prisma',
  'bullmq',
  'webhook-http',
]);

const REQUIRED_FIELDS: Array<keyof PulseManifest> = [
  'version',
  'projectId',
  'projectName',
  'systemType',
  'supportedStacks',
  'surfaces',
  'criticalDomains',
  'modules',
  'externalIntegrations',
  'jobs',
  'webhooks',
  'stateMachines',
  'criticalFlows',
  'invariants',
  'flowSpecs',
  'invariantSpecs',
  'temporaryAcceptances',
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
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function validateManifestShape(raw: unknown, manifestPath: string): Break[] {
  const issues: Break[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    issues.push(
      manifestBreak(
        'MANIFEST_INVALID',
        'pulse.manifest.json must be a JSON object',
        'The manifest root value must be an object with the required certification fields.',
        manifestPath,
      ),
    );
    return issues;
  }

  const manifest = raw as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    if (!(field in manifest)) {
      issues.push(
        manifestBreak(
          'MANIFEST_INVALID',
          `pulse.manifest.json is missing required field "${field}"`,
          'Certification cannot close scope without the full manifest contract.',
          manifestPath,
        ),
      );
    }
  }

  if ('supportedStacks' in manifest && !isStringArray(manifest.supportedStacks)) {
    issues.push(
      manifestBreak(
        'MANIFEST_INVALID',
        'pulse.manifest.json field "supportedStacks" must be a string array',
        'Declare every supported adapter as a string entry.',
        manifestPath,
      ),
    );
  }

  if ('surfaces' in manifest && !isStringArray(manifest.surfaces)) {
    issues.push(
      manifestBreak(
        'MANIFEST_INVALID',
        'pulse.manifest.json field "surfaces" must be a string array',
        'Declare every certified surface as a string entry.',
        manifestPath,
      ),
    );
  }

  if ('modules' in manifest) {
    if (!Array.isArray(manifest.modules)) {
      issues.push(
        manifestBreak(
          'MANIFEST_INVALID',
          'pulse.manifest.json field "modules" must be an array',
          'Modules must declare name, state, and notes.',
          manifestPath,
        ),
      );
    } else {
      for (const [index, moduleEntry] of manifest.modules.entries()) {
        if (!moduleEntry || typeof moduleEntry !== 'object' || Array.isArray(moduleEntry)) {
          issues.push(
            manifestBreak(
              'MANIFEST_INVALID',
              `pulse.manifest.json module at index ${index} is invalid`,
              'Each module must be an object with name, state, and notes.',
              manifestPath,
            ),
          );
          continue;
        }

        const record = moduleEntry as Record<string, unknown>;
        if (typeof record.name !== 'string' || typeof record.state !== 'string' || typeof record.notes !== 'string') {
          issues.push(
            manifestBreak(
              'MANIFEST_INVALID',
              `pulse.manifest.json module "${String(record.name || index)}" is missing name/state/notes`,
              'Each module entry must define string fields: name, state, notes.',
              manifestPath,
            ),
          );
        }
      }
    }
  }

  if ('flowSpecs' in manifest) {
    if (!Array.isArray(manifest.flowSpecs)) {
      issues.push(
        manifestBreak(
          'MANIFEST_INVALID',
          'pulse.manifest.json field "flowSpecs" must be an array',
          'Each flow spec must define id, surface, runner, critical, and notes.',
          manifestPath,
        ),
      );
    } else {
      for (const [index, entry] of manifest.flowSpecs.entries()) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          issues.push(
            manifestBreak(
              'MANIFEST_INVALID',
              `pulse.manifest.json flowSpecs[${index}] is invalid`,
              'Each flow spec must be an object.',
              manifestPath,
            ),
          );
          continue;
        }
        const record = entry as Record<string, unknown>;
        if (
          typeof record.id !== 'string' ||
          typeof record.surface !== 'string' ||
          typeof record.runner !== 'string' ||
          typeof record.notes !== 'string' ||
          typeof record.critical !== 'boolean'
        ) {
          issues.push(
            manifestBreak(
              'MANIFEST_INVALID',
              `pulse.manifest.json flow spec "${String(record.id || index)}" is missing required fields`,
              'Flow specs require id, surface, runner, critical, and notes.',
              manifestPath,
            ),
          );
        }
      }
    }
  }

  if ('invariantSpecs' in manifest) {
    if (!Array.isArray(manifest.invariantSpecs)) {
      issues.push(
        manifestBreak(
          'MANIFEST_INVALID',
          'pulse.manifest.json field "invariantSpecs" must be an array',
          'Each invariant spec must define id, surface, source, critical, and notes.',
          manifestPath,
        ),
      );
    } else {
      for (const [index, entry] of manifest.invariantSpecs.entries()) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          issues.push(
            manifestBreak(
              'MANIFEST_INVALID',
              `pulse.manifest.json invariantSpecs[${index}] is invalid`,
              'Each invariant spec must be an object.',
              manifestPath,
            ),
          );
          continue;
        }
        const record = entry as Record<string, unknown>;
        if (
          typeof record.id !== 'string' ||
          typeof record.surface !== 'string' ||
          typeof record.source !== 'string' ||
          typeof record.notes !== 'string' ||
          typeof record.critical !== 'boolean'
        ) {
          issues.push(
            manifestBreak(
              'MANIFEST_INVALID',
              `pulse.manifest.json invariant spec "${String(record.id || index)}" is missing required fields`,
              'Invariant specs require id, surface, source, critical, and notes.',
              manifestPath,
            ),
          );
        }
      }
    }
  }

  if ('temporaryAcceptances' in manifest) {
    if (!Array.isArray(manifest.temporaryAcceptances)) {
      issues.push(
        manifestBreak(
          'MANIFEST_INVALID',
          'pulse.manifest.json field "temporaryAcceptances" must be an array',
          'Temporary acceptances must declare id, targetType, target, reason, and expiresAt.',
          manifestPath,
        ),
      );
    } else {
      for (const [index, entry] of manifest.temporaryAcceptances.entries()) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          issues.push(
            manifestBreak(
              'MANIFEST_INVALID',
              `pulse.manifest.json temporaryAcceptances[${index}] is invalid`,
              'Each temporary acceptance must be an object.',
              manifestPath,
            ),
          );
          continue;
        }

        const record = entry as Record<string, unknown>;
        if (
          typeof record.id !== 'string' ||
          typeof record.targetType !== 'string' ||
          typeof record.target !== 'string' ||
          typeof record.reason !== 'string' ||
          typeof record.expiresAt !== 'string'
        ) {
          issues.push(
            manifestBreak(
              'MANIFEST_INVALID',
              `pulse.manifest.json temporary acceptance "${String(record.id || index)}" is missing required fields`,
              'Temporary acceptances require id, targetType, target, reason, and expiresAt.',
              manifestPath,
            ),
          );
        }
      }
    }
  }

  return issues;
}

function discoverSurfaceKinds(config: PulseConfig, coreData: CoreParserData): string[] {
  const discovered = new Set<string>();

  if (coreData.uiElements.length > 0) discovered.add('frontend-ui');
  if (coreData.apiCalls.length > 0) discovered.add('frontend-api-client');
  if (coreData.proxyRoutes.length > 0) discovered.add('frontend-proxy');
  if (coreData.backendRoutes.length > 0) discovered.add('backend-routes');
  if (coreData.prismaModels.length > 0) discovered.add('database-models');
  if (fs.existsSync(config.workerDir)) discovered.add('workers');
  if (coreData.backendRoutes.some(route => /webhook/i.test(route.fullPath))) discovered.add('webhooks');
  if (coreData.serviceTraces.some(trace => /queue|bull|job/i.test(trace.serviceName))) discovered.add('queues');

  return [...discovered].sort();
}

export function loadPulseManifest(config: PulseConfig, coreData: CoreParserData): PulseManifestLoadResult {
  const manifestPath = path.join(config.rootDir, PULSE_MANIFEST_FILENAME);

  if (!fs.existsSync(manifestPath)) {
    return {
      manifest: null,
      manifestPath: null,
      issues: [
        manifestBreak(
          'MANIFEST_MISSING',
          'pulse.manifest.json is missing',
          'Create the project manifest before using certification gates.',
          path.relative(config.rootDir, manifestPath),
        ),
      ],
      unknownSurfaces: [],
      unsupportedStacks: [],
    };
  }

  let rawContent = '';
  try {
    rawContent = fs.readFileSync(manifestPath, 'utf8');
  } catch (error) {
    return {
      manifest: null,
      manifestPath,
      issues: [
        manifestBreak(
          'MANIFEST_INVALID',
          'pulse.manifest.json could not be read',
          (error as Error).message || 'Unknown filesystem error',
          path.relative(config.rootDir, manifestPath),
        ),
      ],
      unknownSurfaces: [],
      unsupportedStacks: [],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (error) {
    return {
      manifest: null,
      manifestPath,
      issues: [
        manifestBreak(
          'MANIFEST_INVALID',
          'pulse.manifest.json is not valid JSON',
          (error as Error).message || 'JSON parse error',
          path.relative(config.rootDir, manifestPath),
        ),
      ],
      unknownSurfaces: [],
      unsupportedStacks: [],
    };
  }

  const issues = validateManifestShape(parsed, path.relative(config.rootDir, manifestPath));
  if (issues.length > 0) {
    return {
      manifest: null,
      manifestPath,
      issues,
      unknownSurfaces: [],
      unsupportedStacks: [],
    };
  }

  const manifest = parsed as PulseManifest;
  const unsupportedStacks = manifest.supportedStacks.filter(stack => !SUPPORTED_STACKS.has(stack));
  const discoveredSurfaces = discoverSurfaceKinds(config, coreData);
  const declared = new Set([...(manifest.surfaces || []), ...(manifest.excludedSurfaces || [])]);
  const unknownSurfaces = discoveredSurfaces.filter(surface => !declared.has(surface));

  return {
    manifest,
    manifestPath,
    issues,
    unknownSurfaces,
    unsupportedStacks,
  };
}
