import type { Break } from '../../types.manifest';
import { manifestBreak, isStringArray, isStringRecord, isGateNameArray } from './helpers';
import { deriveStringUnionMembersFromTypeContract } from '../../dynamic-reality-kernel/__parts__/type-contract-labels';

export function validateManifestShapePart2(
  manifest: Record<string, unknown>,
  manifestPath: string,
  issues: Break[],
): Break[] {
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
          !deriveStringUnionMembersFromTypeContract(
            'scripts/pulse/types.health.ts',
            'PulseTemporaryAcceptanceTargetType',
          ).has(String(record.targetType))
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
