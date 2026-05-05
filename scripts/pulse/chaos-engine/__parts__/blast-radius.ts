import type { ChaosTarget } from '../../types.chaos-engine';
import type { PulseCapability } from '../../types';
import {
  type ChaosOperationalConcern,
  ChaosProviderName,
  lookupChaosTargetEvidence,
  compactBlastRadius,
  dependencyId,
} from './detection';
import {
  discoverExternalReceiverTokensFromEvidence,
  deriveZeroValue,
} from '../../dynamic-reality-kernel';

// ── Blast-radius computation ──────────────────────────────────────────────

/** Find all capabilities that structurally depend on a target class. */
export function computeBlastRadius(target: ChaosTarget, capabilities: PulseCapability[]): string[] {
  const postgresLabel = lookupChaosTargetEvidence('postgres');
  const redisLabel = lookupChaosTargetEvidence('redis');
  const internalApiLabel = lookupChaosTargetEvidence('internal_api');
  const externalHttpLabel = lookupChaosTargetEvidence('external_http');
  const webhookReceiverLabel = lookupChaosTargetEvidence('webhook_receiver');
  return capabilities
    .filter((cap) => {
      const roles = new Set(cap.rolesPresent ?? []);
      if (target === postgresLabel) {
        return roles.has('persistence');
      }
      if (target === redisLabel) {
        return roles.has('side_effect') || roles.has('orchestration');
      }
      if (target === internalApiLabel) {
        return roles.has('interface') || cap.routePatterns.length > deriveZeroValue();
      }
      if (target === externalHttpLabel || target === webhookReceiverLabel) {
        return roles.has('side_effect') || cap.routePatterns.length > deriveZeroValue();
      }
      return false;
    })
    .map((cap) => cap.id);
}

/**
 * Compute blast radius specific to a named provider.
 *
 * This is broader than the target-level blast radius because it checks
 * for provider-specific file references and capability name patterns.
 */
export function computeProviderBlastRadius(
  provider: ChaosProviderName,
  providerFiles: string[],
  capabilities: PulseCapability[],
): string[] {
  const target = targetForDetectedDependency(provider, providerFiles);
  const baseRadius = computeBlastRadius(target, capabilities);
  const baseIds = new Set(baseRadius);

  // Add capabilities whose file paths overlap with provider detection.
  for (const cap of capabilities) {
    if (baseIds.has(cap.id)) continue;
    const capFiles = new Set(cap.filePaths ?? []);
    const hasOverlap = providerFiles.some((pf) => capFiles.has(pf));
    if (hasOverlap) {
      baseIds.add(cap.id);
    }
  }

  return compactBlastRadius([...baseIds].sort());
}

export function targetForDetectedDependency(
  dependency: ChaosProviderName,
  dependencyFiles: string[],
): ChaosTarget {
  const postgresDep = dependencyId('target', lookupChaosTargetEvidence('postgres'));
  const redisDep = dependencyId('target', lookupChaosTargetEvidence('redis'));
  if (dependency === postgresDep) {
    return lookupChaosTargetEvidence('postgres');
  }
  if (dependency === redisDep) {
    return lookupChaosTargetEvidence('redis');
  }
  const receiverTokens = discoverExternalReceiverTokensFromEvidence();
  if (dependencyFiles.some((file) => receiverTokens.some((token) => file.includes(token)))) {
    return lookupChaosTargetEvidence('webhook_receiver');
  }
  return lookupChaosTargetEvidence('external_http');
}

export function dependencyLabel(dependency: ChaosProviderName): string {
  const [, rawName = dependency] = dependency.split(/:(.*)/s);
  const name = rawName.replace(/[-_]+/g, ' ').trim();
  return name ? `external dependency ${name}` : 'external dependency';
}

export function hasOperationalEvidence(text: string, pattern: RegExp): boolean {
  return pattern.test(text.replace(/[-_/.:]+/g, ' '));
}

export function buildOperationalEvidenceText(
  provider: ChaosProviderName | undefined,
  providerFiles: string[],
  capabilities: PulseCapability[],
): string {
  const blastRadius = provider
    ? new Set(computeProviderBlastRadius(provider, providerFiles, capabilities))
    : new Set<string>();
  const capabilityEvidence = capabilities
    .filter((capability) => !provider || blastRadius.has(capability.id))
    .flatMap((capability) => [
      capability.id,
      capability.name,
      ...capability.filePaths,
      ...capability.routePatterns,
      ...capability.evidenceSources,
      ...capability.validationTargets,
      ...capability.rolesPresent,
    ]);

  return [provider ?? '', ...providerFiles, ...capabilityEvidence].join(' ').toLowerCase();
}

export function deriveOperationalConcerns(
  provider: ChaosProviderName | undefined,
  providerFiles: string[],
  capabilities: PulseCapability[],
): Set<ChaosOperationalConcern> {
  const evidenceText = buildOperationalEvidenceText(provider, providerFiles, capabilities);
  const concerns = new Set<ChaosOperationalConcern>();

  if (
    hasOperationalEvidence(
      evidenceText,
      /\b(payment|checkout|billing|invoice|subscription|wallet|ledger|split|payout|refund|chargeback|settlement|idempotency|idempotent)\b/,
    )
  ) {
    concerns.add('payment_idempotency');
  }

  if (
    hasOperationalEvidence(
      evidenceText,
      /\b(whatsapp|waha|waba|phone\s*number|message|messaging|conversation|inbox|chat|queue|retry)\b/,
    )
  ) {
    concerns.add('whatsapp_queue_retry');
  }

  if (
    hasOperationalEvidence(
      evidenceText,
      /\b(email|mail|smtp|resend|sendgrid|postmark|verification|password\s*reset|welcome|deliverability)\b/,
    )
  ) {
    concerns.add('email_retry_fallback');
  }

  if (
    hasOperationalEvidence(
      evidenceText,
      /\b(ai|llm|model|prompt|completion|embedding|agent|copilot|autopilot|brain|openai|anthropic|cache)\b/,
    )
  ) {
    concerns.add('ai_model_fallback_cache');
  }

  return concerns;
}
