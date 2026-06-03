import type { Break } from './types.manifest';
import {
  manifestBreak,
  isStringArray,
  isManifestModuleArray,
  isActorKind,
  isScenarioKind,
  isProviderMode,
  isScenarioRunner,
  isScenarioExecutionMode,
  isTimeWindowModeArray,
  isEnvironmentArray,
} from './manifest-validators';
import {
  validateInvariantSpecsShape,
  validateTemporaryAcceptancesShape,
  validateCertificationTiersShape,
} from './manifest-shape-validators-2';
import {
  validateFinalReadinessCriteriaShape,
  validateOverridesShape,
  validateCrossRefs,
} from './manifest-shape-validators-3';

const REQUIRED_FIELDS: Array<keyof import('./types.manifest').PulseManifest> = [
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

function validateManifestRootShape(
  manifest: Record<string, unknown>,
  manifestPath: string,
): Break[] {
  const issues: Break[] = [];

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

  return issues;
}

function validateModulesShape(
  manifest: Record<string, unknown>,
  manifestPath: string,
): Break[] {
  const issues: Break[] = [];

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

  return issues;
}

function validateActorProfilesShape(
  manifest: Record<string, unknown>,
  manifestPath: string,
): Break[] {
  const issues: Break[] = [];

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
      return issues;
    }

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

  return issues;
}

function validateScenarioSpecsShape(
  manifest: Record<string, unknown>,
  manifestPath: string,
): Break[] {
  const issues: Break[] = [];

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
      return issues;
    }

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

  return issues;
}

function validateFlowSpecsShape(
  manifest: Record<string, unknown>,
  manifestPath: string,
): Break[] {
  const issues: Break[] = [];

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
      return issues;
    }

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

  return issues;
}

export function validateManifestShape(raw: unknown, manifestPath: string): Break[] {
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

  issues.push(...validateManifestRootShape(manifest, manifestPath));
  issues.push(...validateModulesShape(manifest, manifestPath));
  issues.push(...validateActorProfilesShape(manifest, manifestPath));
  issues.push(...validateScenarioSpecsShape(manifest, manifestPath));
  issues.push(...validateFlowSpecsShape(manifest, manifestPath));
  issues.push(...validateInvariantSpecsShape(manifest, manifestPath));
  issues.push(...validateTemporaryAcceptancesShape(manifest, manifestPath));
  issues.push(...validateCertificationTiersShape(manifest, manifestPath));
  issues.push(...validateFinalReadinessCriteriaShape(manifest, manifestPath));
  issues.push(...validateOverridesShape(manifest, manifestPath));
  issues.push(...validateCrossRefs(manifest, manifestPath));

  return issues;
}
