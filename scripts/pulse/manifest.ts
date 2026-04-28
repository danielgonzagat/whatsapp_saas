import { safeJoin, safeResolve } from './safe-path';
import * as path from 'path';
import type { PulseConfig, PulseManifest, PulseManifestLoadResult, Break } from './types';
import type { CoreParserData } from './functional-map-types';
import { pathExists, readTextFile } from './safe-fs';

/** Pulse_manifest_filename. */
export const PULSE_MANIFEST_FILENAME = 'pulse.manifest.json';

/** Supported_stacks. */
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

const VALID_GATE_NAMES = new Set([
  'scopeClosed',
  'adapterSupported',
  'specComplete',
  'truthExtractionPass',
  'staticPass',
  'runtimePass',
  'browserPass',
  'flowPass',
  'invariantPass',
  'securityPass',
  'isolationPass',
  'recoveryPass',
  'performancePass',
  'observabilityPass',
  'customerPass',
  'operatorPass',
  'adminPass',
  'soakPass',
  'syntheticCoveragePass',
  'evidenceFresh',
  'pulseSelfTrustPass',
  'noOverclaimPass',
  'executionMatrixCompletePass',
  'criticalPathObservedPass',
  'breakpointPrecisionPass',
  'multiCycleConvergencePass',
  'testHonestyPass',
  'assertionStrengthPass',
  'typeIntegrityPass',
]);

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
  return ['customer', 'operator', 'admin', 'system'].includes(String(value));
}

function isScenarioKind(value: unknown): boolean {
  return [
    'single-session',
    'multi-session',
    'multi-actor',
    'long-lived',
    'async-reconciled',
  ].includes(String(value));
}

function isProviderMode(value: unknown): boolean {
  return ['replay', 'sandbox', 'real_smoke', 'hybrid'].includes(String(value));
}

function isScenarioRunner(value: unknown): boolean {
  return ['playwright-spec', 'derived'].includes(String(value));
}

function isScenarioExecutionMode(value: unknown): boolean {
  return ['real', 'derived', 'mapping'].includes(String(value));
}

function isGateNameArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => VALID_GATE_NAMES.has(String(item)));
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
        if (
          typeof record.name !== 'string' ||
          typeof record.state !== 'string' ||
          typeof record.notes !== 'string'
        ) {
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

  if (
    'legacyModules' in manifest &&
    manifest.legacyModules !== undefined &&
    !isManifestModuleArray(manifest.legacyModules)
  ) {
    issues.push(
      manifestBreak(
        'MANIFEST_INVALID',
        'pulse.manifest.json field "legacyModules" must be an array of module entries',
        'Legacy modules must define name, state, and notes just like active modules.',
        manifestPath,
      ),
    );
  }

  if ('actorProfiles' in manifest) {
    if (!Array.isArray(manifest.actorProfiles)) {
      issues.push(
        manifestBreak(
          'MANIFEST_INVALID',
          'pulse.manifest.json field "actorProfiles" must be an array',
          'Each actor profile must define id, kind, description, moduleFocus, and defaultTimeWindowModes.',
          manifestPath,
        ),
      );
    } else {
      for (const [index, entry] of manifest.actorProfiles.entries()) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          issues.push(
            manifestBreak(
              'MANIFEST_INVALID',
              `pulse.manifest.json actorProfiles[${index}] is invalid`,
              'Each actor profile must be an object.',
              manifestPath,
            ),
          );
          continue;
        }

        const record = entry as Record<string, unknown>;
        if (
          typeof record.id !== 'string' ||
          !isActorKind(record.kind) ||
          typeof record.description !== 'string' ||
          !isStringArray(record.moduleFocus) ||
          !isTimeWindowModeArray(record.defaultTimeWindowModes)
        ) {
          issues.push(
            manifestBreak(
              'MANIFEST_INVALID',
              `pulse.manifest.json actor profile "${String(record.id || index)}" is missing required fields`,
              'Actor profiles require id, kind, description, moduleFocus, and defaultTimeWindowModes.',
              manifestPath,
            ),
          );
        }
      }
    }
  }

  if ('scenarioSpecs' in manifest) {
    if (!Array.isArray(manifest.scenarioSpecs)) {
      issues.push(
        manifestBreak(
          'MANIFEST_INVALID',
          'pulse.manifest.json field "scenarioSpecs" must be an array',
          'Each scenario spec must define actor, scope, execution, and evidence requirements.',
          manifestPath,
        ),
      );
    } else {
      for (const [index, entry] of manifest.scenarioSpecs.entries()) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          issues.push(
            manifestBreak(
              'MANIFEST_INVALID',
              `pulse.manifest.json scenarioSpecs[${index}] is invalid`,
              'Each scenario spec must be an object.',
              manifestPath,
            ),
          );
          continue;
        }
        const record = entry as Record<string, unknown>;
        if (
          typeof record.id !== 'string' ||
          !isActorKind(record.actorKind) ||
          !isScenarioKind(record.scenarioKind) ||
          typeof record.critical !== 'boolean' ||
          !isStringArray(record.moduleKeys) ||
          !isStringArray(record.routePatterns) ||
          !isStringArray(record.flowSpecs) ||
          !isStringArray(record.flowGroups) ||
          !isStringArray(record.playwrightSpecs) ||
          !isStringArray(record.runtimeProbes) ||
          typeof record.requiresBrowser !== 'boolean' ||
          typeof record.requiresPersistence !== 'boolean' ||
          !isStringArray(record.asyncExpectations) ||
          !isProviderMode(record.providerMode) ||
          !isTimeWindowModeArray(record.timeWindowModes) ||
          !isScenarioRunner(record.runner) ||
          !isScenarioExecutionMode(record.executionMode) ||
          !isStringArray(record.worldStateKeys) ||
          !isStringArray(record.requiredArtifacts) ||
          typeof record.notes !== 'string'
        ) {
          issues.push(
            manifestBreak(
              'MANIFEST_INVALID',
              `pulse.manifest.json scenario spec "${String(record.id || index)}" is missing required fields`,
              'Scenario specs require id, actorKind, scenarioKind, critical, moduleKeys, routePatterns, flowSpecs, flowGroups, playwrightSpecs, runtimeProbes, requiresBrowser, requiresPersistence, asyncExpectations, providerMode, timeWindowModes, runner, executionMode, worldStateKeys, requiredArtifacts, and notes.',
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
          typeof record.oracle !== 'string' ||
          !isProviderMode(record.providerMode) ||
          typeof record.smokeRequired !== 'boolean' ||
          typeof record.notes !== 'string' ||
          typeof record.critical !== 'boolean' ||
          !isStringArray(record.preconditions) ||
          !isEnvironmentArray(record.environments)
        ) {
          issues.push(
            manifestBreak(
              'MANIFEST_INVALID',
              `pulse.manifest.json flow spec "${String(record.id || index)}" is missing required fields`,
              'Flow specs require id, surface, runner, oracle, providerMode, smokeRequired, critical, preconditions, environments, and notes.',
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
          typeof record.evaluator !== 'string' ||
          typeof record.notes !== 'string' ||
          typeof record.critical !== 'boolean' ||
          !isStringArray(record.dependsOn) ||
          !isEnvironmentArray(record.environments)
        ) {
          issues.push(
            manifestBreak(
              'MANIFEST_INVALID',
              `pulse.manifest.json invariant spec "${String(record.id || index)}" is missing required fields`,
              'Invariant specs require id, surface, source, evaluator, critical, dependsOn, environments, and notes.',
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

        if (
          !['gate', 'break_type', 'surface', 'flow', 'invariant'].includes(
            String(record.targetType),
          )
        ) {
          issues.push(
            manifestBreak(
              'MANIFEST_INVALID',
              `pulse.manifest.json temporary acceptance "${String(record.id || index)}" has unsupported targetType`,
              'Allowed targetType values are gate, break_type, surface, flow, invariant.',
              manifestPath,
            ),
          );
        }

        if (
          typeof record.expiresAt === 'string' &&
          ['flow', 'invariant'].includes(String(record.targetType))
        ) {
          const expiresAt = Date.parse(record.expiresAt);
          const maxWindowMs = 14 * 24 * 60 * 60 * 1000;
          if (!Number.isFinite(expiresAt)) {
            issues.push(
              manifestBreak(
                'MANIFEST_INVALID',
                `pulse.manifest.json temporary acceptance "${String(record.id || index)}" has invalid expiresAt`,
                'Use ISO8601 timestamp format.',
                manifestPath,
              ),
            );
          } else if (expiresAt - Date.now() > maxWindowMs) {
            issues.push(
              manifestBreak(
                'MANIFEST_INVALID',
                `pulse.manifest.json temporary acceptance "${String(record.id || index)}" exceeds 14-day max window`,
                'Flow and invariant acceptances must expire within 14 days.',
                manifestPath,
              ),
            );
          }
        }
      }
    }
  }

  if ('certificationTiers' in manifest) {
    if (!Array.isArray(manifest.certificationTiers)) {
      issues.push(
        manifestBreak(
          'MANIFEST_INVALID',
          'pulse.manifest.json field "certificationTiers" must be an array',
          'Certification tiers must define id, name, gates and any hard readiness requirements.',
          manifestPath,
        ),
      );
    } else {
      for (const [index, entry] of manifest.certificationTiers.entries()) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          issues.push(
            manifestBreak(
              'MANIFEST_INVALID',
              `pulse.manifest.json certificationTiers[${index}] is invalid`,
              'Each certification tier must be an object.',
              manifestPath,
            ),
          );
          continue;
        }

        const record = entry as Record<string, unknown>;
        if (
          typeof record.id !== 'number' ||
          typeof record.name !== 'string' ||
          !isGateNameArray(record.gates) ||
          ('requireNoAcceptedFlows' in record &&
            typeof record.requireNoAcceptedFlows !== 'boolean') ||
          ('requireNoAcceptedScenarios' in record &&
            typeof record.requireNoAcceptedScenarios !== 'boolean') ||
          ('requireWorldStateConvergence' in record &&
            typeof record.requireWorldStateConvergence !== 'boolean')
        ) {
          issues.push(
            manifestBreak(
              'MANIFEST_INVALID',
              `pulse.manifest.json certification tier "${String(record.name || record.id || index)}" is missing required fields`,
              'Certification tiers require numeric id, string name, valid gate list, and optional boolean readiness requirements.',
              manifestPath,
            ),
          );
        }
      }
    }
  }

  if ('finalReadinessCriteria' in manifest) {
    const record = manifest.finalReadinessCriteria as Record<string, unknown> | undefined;
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      issues.push(
        manifestBreak(
          'MANIFEST_INVALID',
          'pulse.manifest.json field "finalReadinessCriteria" must be an object',
          'Final readiness criteria must define the hard requirements for final certification.',
          manifestPath,
        ),
      );
    } else if (
      typeof record.requireAllTiersPass !== 'boolean' ||
      typeof record.requireNoAcceptedCriticalFlows !== 'boolean' ||
      typeof record.requireNoAcceptedCriticalScenarios !== 'boolean' ||
      typeof record.requireWorldStateConvergence !== 'boolean'
    ) {
      issues.push(
        manifestBreak(
          'MANIFEST_INVALID',
          'pulse.manifest.json field "finalReadinessCriteria" is missing required boolean fields',
          'Final readiness criteria require requireAllTiersPass, requireNoAcceptedCriticalFlows, requireNoAcceptedCriticalScenarios and requireWorldStateConvergence.',
          manifestPath,
        ),
      );
    }
  }

  if ('overrides' in manifest && manifest.overrides !== undefined) {
    if (
      !manifest.overrides ||
      typeof manifest.overrides !== 'object' ||
      Array.isArray(manifest.overrides)
    ) {
      issues.push(
        manifestBreak(
          'MANIFEST_INVALID',
          'pulse.manifest.json field "overrides" must be an object',
          'Overrides must be a JSON object with string arrays and alias maps.',
          manifestPath,
        ),
      );
    } else {
      const overrides = manifest.overrides as Record<string, unknown>;
      const arrayFields = [
        'excludedModules',
        'criticalModules',
        'internalModules',
        'excludedFlowCandidates',
      ];
      for (const field of arrayFields) {
        if (
          field in overrides &&
          overrides[field] !== undefined &&
          !isStringArray(overrides[field])
        ) {
          issues.push(
            manifestBreak(
              'MANIFEST_INVALID',
              `pulse.manifest.json overrides.${field} must be a string array`,
              'Override lists must be arrays of strings.',
              manifestPath,
            ),
          );
        }
      }

      const recordFields = ['moduleAliases', 'flowAliases'];
      for (const field of recordFields) {
        if (
          field in overrides &&
          overrides[field] !== undefined &&
          !isStringRecord(overrides[field])
        ) {
          issues.push(
            manifestBreak(
              'MANIFEST_INVALID',
              `pulse.manifest.json overrides.${field} must be a string map`,
              'Alias override maps must be objects whose values are strings.',
              manifestPath,
            ),
          );
        }
      }
    }
  }

  if (Array.isArray(manifest.flowSpecs) && Array.isArray(manifest.temporaryAcceptances)) {
    const flowIds = new Set(
      manifest.flowSpecs
        .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
        .map((entry) => String((entry as Record<string, unknown>).id || '')),
    );
    const invariantIds = new Set(
      Array.isArray(manifest.invariantSpecs)
        ? manifest.invariantSpecs
            .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
            .map((entry) => String((entry as Record<string, unknown>).id || ''))
        : [],
    );

    for (const [index, entry] of manifest.temporaryAcceptances.entries()) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        continue;
      }
      const record = entry as Record<string, unknown>;
      if (
        record.targetType === 'flow' &&
        typeof record.target === 'string' &&
        !flowIds.has(record.target)
      ) {
        issues.push(
          manifestBreak(
            'MANIFEST_INVALID',
            `pulse.manifest.json temporary acceptance "${String(record.id || index)}" targets unknown flow "${record.target}"`,
            'Target flow must exist in flowSpecs.',
            manifestPath,
          ),
        );
      }
      if (
        record.targetType === 'invariant' &&
        typeof record.target === 'string' &&
        !invariantIds.has(record.target)
      ) {
        issues.push(
          manifestBreak(
            'MANIFEST_INVALID',
            `pulse.manifest.json temporary acceptance "${String(record.id || index)}" targets unknown invariant "${record.target}"`,
            'Target invariant must exist in invariantSpecs.',
            manifestPath,
          ),
        );
      }
    }
  }

  if (Array.isArray(manifest.scenarioSpecs)) {
    const actorProfileKinds = new Set(
      Array.isArray(manifest.actorProfiles)
        ? manifest.actorProfiles
            .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
            .map((entry) => String((entry as Record<string, unknown>).kind || ''))
        : [],
    );
    const flowIds = new Set(
      Array.isArray(manifest.flowSpecs)
        ? manifest.flowSpecs
            .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
            .map((entry) => String((entry as Record<string, unknown>).id || ''))
        : [],
    );

    for (const [index, entry] of manifest.scenarioSpecs.entries()) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        continue;
      }
      const record = entry as Record<string, unknown>;
      const actorKind = String(record.actorKind || '');
      if (actorKind && !actorProfileKinds.has(actorKind)) {
        issues.push(
          manifestBreak(
            'MANIFEST_INVALID',
            `pulse.manifest.json scenario "${String(record.id || index)}" references actorKind "${actorKind}" without a matching actor profile`,
            'Declare one actorProfiles entry for every actorKind used by scenarioSpecs.',
            manifestPath,
          ),
        );
      }

      const referencedFlowSpecs = Array.isArray(record.flowSpecs) ? record.flowSpecs : [];
      for (const flowId of referencedFlowSpecs) {
        if (typeof flowId === 'string' && !flowIds.has(flowId)) {
          issues.push(
            manifestBreak(
              'MANIFEST_INVALID',
              `pulse.manifest.json scenario "${String(record.id || index)}" references unknown flow spec "${flowId}"`,
              'Scenario flowSpecs must reference ids declared in flowSpecs.',
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

/** Load pulse manifest. */
export function loadPulseManifest(
  config: PulseConfig,
  coreData: CoreParserData,
): PulseManifestLoadResult {
  const manifestPath = safeJoin(config.rootDir, PULSE_MANIFEST_FILENAME);

  if (!pathExists(manifestPath)) {
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
    rawContent = readTextFile(manifestPath, 'utf8');
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
  const unsupportedStacks = manifest.supportedStacks.filter(
    (stack) => !SUPPORTED_STACKS.has(stack),
  );
  const discoveredSurfaces = discoverSurfaceKinds(config, coreData);
  const declared = new Set([...(manifest.surfaces || []), ...(manifest.excludedSurfaces || [])]);
  const unknownSurfaces = discoveredSurfaces.filter((surface) => !declared.has(surface));

  return {
    manifest,
    manifestPath,
    issues,
    unknownSurfaces,
    unsupportedStacks,
  };
}
