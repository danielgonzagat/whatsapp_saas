/**
 * UTP-AGENCY-002 — Per-Client Context Bundler.
 *
 * Bundles all relevant context for a single client into a
 * ClientContextBundle. Normalizes optional fields and assigns
 * default tags when none are provided.
 *
 * Pure function — creates a structured bundle from raw input.
 */

import type { BundleInput, ClientContextBundle } from './types';
import { clampScore } from './types';

export interface BundleResult {
  readonly bundle: ClientContextBundle;
  readonly enrichedTags: readonly string[];
}

function inferTags(input: BundleInput): readonly string[] {
  if (input.tags && input.tags.length > 0) {
    return input.tags;
  }
  const inferred: string[] = [];
  if (input.monthlyRevenueCents > 100_000n) {
    inferred.push('high_value');
  } else if (input.monthlyRevenueCents > 10_000n) {
    inferred.push('mid_value');
  } else {
    inferred.push('low_value');
  }
  if (input.relationshipAgeDays < 90) {
    inferred.push('new_client');
  } else if (input.relationshipAgeDays > 365) {
    inferred.push('long_term');
  }
  if (input.openIssues > 3) {
    inferred.push('needs_attention');
  }
  if (input.activeProjects > 5) {
    inferred.push('high_engagement');
  }
  return inferred;
}

export function bundleClientContext(input: BundleInput): BundleResult {
  const nowMs = input.nowMs ?? Date.now();
  const tags = inferTags(input);

  const bundle: ClientContextBundle = {
    clientId: input.clientId,
    workspaceId: input.workspaceId,
    clientName: input.clientName,
    relationshipAgeDays: Math.max(0, input.relationshipAgeDays),
    activeProjects: Math.max(0, input.activeProjects),
    monthlyRevenueCents: input.monthlyRevenueCents,
    lastContactAt: input.lastContactAt,
    openIssues: Math.max(0, input.openIssues),
    satisfactionScore: clampScore(input.satisfactionScore),
    contractRenewalAt: input.contractRenewalAt,
    bundledAt: new Date(nowMs).toISOString(),
    tags,
  };

  const enrichedTags = [...tags];

  return { bundle, enrichedTags };
}
