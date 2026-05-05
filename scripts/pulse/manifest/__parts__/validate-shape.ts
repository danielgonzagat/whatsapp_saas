import type { Break } from '../../types.manifest';
import {
  manifestBreak,
  isStringArray,
  isManifestModuleArray,
  isActorKind,
  isTimeWindowModeArray,
  isScenarioKind,
  isStringRecord,
  isProviderMode,
  isScenarioRunner,
  isScenarioExecutionMode,
  isEnvironmentArray,
  isGateNameArray,
} from './helpers';
import { deriveStringUnionMembersFromTypeContract } from '../../dynamic-reality-kernel/__parts__/type-contract-labels';
import { REQUIRED_FIELDS } from './helpers';

export function validateManifestShapePart1(
  raw: unknown,
  manifestPath: string,
): { issues: Break[]; manifest: Record<string, unknown> } {
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
    return { issues, manifest: {} };
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

  return { issues, manifest };
}
