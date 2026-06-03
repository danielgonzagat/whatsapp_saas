import type { Break } from './types.manifest';
import {
  manifestBreak,
  isStringArray,
  isGateNameArray,
  isEnvironmentArray,
} from './manifest-validators';
import { deriveStringUnionMembersFromTypeContract } from './dynamic-reality-kernel/type-contract-labels';

export function validateInvariantSpecsShape(
  manifest: Record<string, unknown>,
  manifestPath: string,
): Break[] {
  const issues: Break[] = [];

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
      return issues;
    }

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

  return issues;
}

export function validateTemporaryAcceptancesShape(
  manifest: Record<string, unknown>,
  manifestPath: string,
): Break[] {
  const issues: Break[] = [];

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
      return issues;
    }

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

  return issues;
}

export function validateCertificationTiersShape(
  manifest: Record<string, unknown>,
  manifestPath: string,
): Break[] {
  const issues: Break[] = [];

  if ('certificationTiers' in manifest) {
    if (!Array.isArray(manifest.certificationTiers)) {
      issues.push(
        manifestBreak(
          'MANIFEST_INVALID',
          'pulse.manifest.json field "certificationTiers" must be an array',
          'Certification tiers must define id, name, gates and required readiness entries.',
          manifestPath,
        ),
      );
      return issues;
    }

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

  return issues;
}
