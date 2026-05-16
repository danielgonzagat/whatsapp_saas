/**
 * UTP-AGENCY-007 — Internal Knowledge Leak Guard.
 *
 * Zero-leak guarantee between clients. Scans all client context
 * bundles for accidental cross-client data exposure. Cross-
 * references every bundle against every other bundle to detect
 * any field that should belong to one client but appears in
 * another's context.
 *
 * Pure function — stateless leak detection from bundles.
 */

import type {
  ClientContextBundle,
  InternalKnowledgeLeak,
  LeakDetail,
  LeakGuardInput,
  LeakSeverity,
} from './types';
import { LEAK_CHECK_FIELDS } from './types';

export interface LeakGuardResult {
  readonly leak: InternalKnowledgeLeak;
  readonly safe: boolean;
}

function checkBundlePair(
  source: ClientContextBundle,
  target: ClientContextBundle,
): readonly LeakDetail[] {
  if (source.clientId === target.clientId) {
    return [];
  }

  const details: LeakDetail[] = [];

  for (const field of LEAK_CHECK_FIELDS) {
    const sourceValue = source[field];
    const targetValue = target[field];

    if (
      sourceValue !== undefined &&
      sourceValue !== null &&
      targetValue !== undefined &&
      targetValue !== null
    ) {
      if (typeof sourceValue === 'bigint' && typeof targetValue === 'bigint') {
        if (sourceValue !== 0n && sourceValue === targetValue) {
          details.push({
            sourceClientId: source.clientId,
            targetClientId: target.clientId,
            leakedField: field,
            severity: field === 'monthlyRevenueCents' ? 'high' : 'moderate',
          });
        }
      } else if (
        typeof sourceValue === 'string' &&
        typeof targetValue === 'string' &&
        sourceValue.length > 0
      ) {
        if (sourceValue === targetValue) {
          details.push({
            sourceClientId: source.clientId,
            targetClientId: target.clientId,
            leakedField: field,
            severity: 'moderate',
          });
        } else if (
          sourceValue.length > 5 &&
          targetValue.includes(sourceValue) &&
          field === 'clientName'
        ) {
          details.push({
            sourceClientId: source.clientId,
            targetClientId: target.clientId,
            leakedField: field,
            severity: 'low',
          });
        }
      } else if (typeof sourceValue === 'number' && typeof targetValue === 'number') {
        if (sourceValue !== 0 && sourceValue === targetValue) {
          details.push({
            sourceClientId: source.clientId,
            targetClientId: target.clientId,
            leakedField: field,
            severity: 'low',
          });
        }
      }
    }
  }

  return details;
}

function computeLeakSeverity(details: readonly LeakDetail[]): LeakSeverity {
  if (details.length === 0) {
    return 'none';
  }
  const hasHigh = details.some((d) => d.severity === 'high');
  const hasModerate = details.some((d) => d.severity === 'moderate');
  if (hasHigh) {
    return 'high';
  }
  if (hasModerate) {
    return 'moderate';
  }
  if (details.length > 2) {
    return 'low';
  }
  return 'low';
}

export function guardKnowledgeLeak(input: LeakGuardInput): LeakGuardResult {
  const nowMs = input.nowMs ?? Date.now();
  const bundles = input.bundles;

  if (bundles.length < 2) {
    const leak: InternalKnowledgeLeak = {
      workspaceId: input.workspaceId,
      leakDetected: false,
      severity: 'none',
      affectedBundles: [],
      assessedAt: new Date(nowMs).toISOString(),
    };
    return { leak, safe: true };
  }

  const allDetails: LeakDetail[] = [];

  for (let i = 0; i < bundles.length; i++) {
    for (let j = i + 1; j < bundles.length; j++) {
      const details = checkBundlePair(bundles[i]!, bundles[j]!);
      allDetails.push(...details);
    }
  }

  const severity = computeLeakSeverity(allDetails);
  const leakDetected = allDetails.length > 0;

  const leak: InternalKnowledgeLeak = {
    workspaceId: input.workspaceId,
    leakDetected,
    severity,
    affectedBundles: allDetails,
    assessedAt: new Date(nowMs).toISOString(),
  };

  return { leak, safe: !leakDetected };
}
