import type { Break } from './types.manifest';
import {
  manifestBreak,
  isStringArray,
  isStringRecord,
} from './manifest-validators';

export function validateFinalReadinessCriteriaShape(
  manifest: Record<string, unknown>,
  manifestPath: string,
): Break[] {
  const issues: Break[] = [];

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

  return issues;
}

export function validateOverridesShape(
  manifest: Record<string, unknown>,
  manifestPath: string,
): Break[] {
  const issues: Break[] = [];

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
      return issues;
    }

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

  return issues;
}

export function validateCrossRefs(
  manifest: Record<string, unknown>,
  manifestPath: string,
): Break[] {
  const issues: Break[] = [];

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
    const declaredActorKinds = new Set(
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
      if (actorKind && !declaredActorKinds.has(actorKind)) {
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
