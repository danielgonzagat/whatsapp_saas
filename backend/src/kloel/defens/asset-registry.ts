import { Injectable } from '@nestjs/common';
import type { DefensibleAsset, AssetKind, EvidenceInput } from './types';
import { assetStrengthFromScore, filterByWorkspace } from './types';

/**
 * DEFENS-001 — AssetRegistry.
 *
 * Registers and tracks defensible assets per workspace. Scans spine
 * events for evidence of asset creation and strength accumulation.
 * Each asset has a strength score (0-1), kind, and evidence trail.
 */

const ASSET_EVENT_SIGNALS: Readonly<Record<string, { readonly kind: AssetKind; readonly label: string; readonly baseScore: number }>> = {
  'commerce.member_area.enrolled': { kind: 'community', label: 'Member Community', baseScore: 0.1 },
  'commerce.member_area.progressed': { kind: 'community', label: 'Member Community', baseScore: 0.05 },
  'commerce.affiliate.performance_measured': { kind: 'process_moat', label: 'Affiliate Network', baseScore: 0.15 },
  'commerce.crm.deal_won': { kind: 'case_library', label: 'Success Cases', baseScore: 0.1 },
  'commerce.lead.converted': { kind: 'switching_cost', label: 'Conversion Track Record', baseScore: 0.08 },
  'commerce.campaign.audience_reached': { kind: 'owned_audience', label: 'Campaign Audience', baseScore: 0.05 },
  'commerce.error.recovery_proof_packaged': { kind: 'switching_cost', label: 'Recovery Proof Trail', baseScore: 0.12 },
};

interface AssetSignal {
  readonly kind: AssetKind;
  readonly label: string;
  readonly baseScore: number;
}

@Injectable()
export class AssetRegistry {
  private readonly store = new Map<string, Map<string, DefensibleAsset>>();

  register(input: EvidenceInput): readonly DefensibleAsset[] {
    const wsAssets = this.ensureWorkspace(input.workspaceId);
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);
    const now = input.nowMs ?? Date.now();
    const nowIso = new Date(now).toISOString();
    const added: DefensibleAsset[] = [];

    for (const event of wsEvents) {
      const signal = this.resolveSignal(event);
      if (!signal) continue;

      const asset = this.upsertAsset(wsAssets, input.workspaceId, signal, event.eventId, nowIso);
      if (asset) added.push(asset);
    }

    return added;
  }

  private resolveSignal(event: EvidenceInput['events'][number]): AssetSignal | undefined {
    const staticSignal = ASSET_EVENT_SIGNALS[event.eventName];
    if (staticSignal) return staticSignal;

  if (
    event.eventName === 'cognition.valence_assigned' &&
    event.entityRef?.entityType === 'operator'
  ) {
    const p = event.payload;
    const operatorNote = typeof p?.['operatorNote'] === 'string'
      ? p['operatorNote'].trim()
      : '';
    if (
      p &&
      p['accepted'] === false &&
      operatorNote.length > 0 &&
      typeof p['learningFraming'] === 'string' &&
      p['learningFraming'].includes('not human performance scoring')
      ) {
        return { kind: 'switching_cost', label: 'Owner Criterion Memory', baseScore: 0.1 };
      }
    }

    return undefined;
  }

  private upsertAsset(
    wsAssets: Map<string, DefensibleAsset>,
    workspaceId: string,
    signal: AssetSignal,
    eventId: string,
    nowIso: string,
  ): DefensibleAsset | undefined {
    const assetId = this.makeAssetId(workspaceId, signal.kind, signal.label);
    const existing = wsAssets.get(assetId);

    if (existing) {
      const newScore = Math.min(1, existing.score + signal.baseScore);
      const updatedEvidence = [...existing.evidence, eventId].slice(-50);
      const updated: DefensibleAsset = {
        ...existing,
        score: newScore,
        strength: assetStrengthFromScore(newScore),
        lastUpdatedAt: nowIso,
        evidence: updatedEvidence,
      };
      wsAssets.set(assetId, updated);
      return updated;
    }

    const asset: DefensibleAsset = {
      workspaceId,
      assetId,
      kind: signal.kind,
      label: signal.label,
      strength: assetStrengthFromScore(signal.baseScore),
      score: signal.baseScore,
      firstRecordedAt: nowIso,
      lastUpdatedAt: nowIso,
      evidence: [eventId],
    };
    wsAssets.set(assetId, asset);
    return asset;
  }

  list(workspaceId: string): readonly DefensibleAsset[] {
    const wsAssets = this.ensureWorkspace(workspaceId);
    return [...wsAssets.values()].sort((a, b) => b.score - a.score);
  }

  get(workspaceId: string, assetId: string): DefensibleAsset | undefined {
    return this.ensureWorkspace(workspaceId).get(assetId);
  }

  count(workspaceId: string): number {
    return this.ensureWorkspace(workspaceId).size;
  }

  private ensureWorkspace(workspaceId: string): Map<string, DefensibleAsset> {
    let ws = this.store.get(workspaceId);
    if (!ws) {
      ws = new Map();
      this.store.set(workspaceId, ws);
    }
    return ws;
  }

  private makeAssetId(workspaceId: string, kind: AssetKind, label: string): string {
    return `${workspaceId}:${kind}:${label.toLowerCase().replace(/\s+/g, '_')}`;
  }
}
