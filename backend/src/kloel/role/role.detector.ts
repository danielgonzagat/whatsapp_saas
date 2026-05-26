/**
 * UTP-ROLE-001 — Role Detector.
 *
 * Detects the workspace owner's economic role from spine usage
 * patterns, implementing B0.3 (recognition of real economic role).
 *
 * Pure function — receives SpineEventRef[] and returns RoleDetection[].
 * No Prisma, no DI. Detection is based on event-type presence patterns:
 * product/checkout events → producer, affiliate events → affiliate,
 * multi-workspace activity → agency, deal-closing dominance → closer,
 * content/campaign signals → creator, domain concentration → especialista.
 */

import type { SpineEventRef } from '../mind/mind.types';
import type { Role, RoleDetection, RoleDetectorInput } from './types';
import { clampConfidence } from './types';

const PRODUCER_EVENTS = new Set([
  'commerce.product.created',
  'commerce.product.updated',
  'commerce.checkout.created',
  'commerce.checkout.completed',
  'commerce.payment.approved',
  'commerce.member_area.enrolled',
]);

const AFFILIATE_EVENTS = new Set([
  'commerce.affiliate.link_created',
  'commerce.affiliate.commission_received',
  'commerce.affiliate.click_registered',
]);

const AGENCY_EVENTS = new Set([
  'workspace.team.member_added',
  'workspace.team.member_removed',
  'commerce.campaign.created',
  'commerce.campaign.started',
]);

const CLOSER_EVENTS = new Set([
  'commerce.crm.deal_won',
  'commerce.crm.deal_lost',
  'commerce.lead.qualified',
  'commerce.lead.objection_raised',
  'commerce.lead.converted',
]);

const CREATOR_EVENTS = new Set([
  'commerce.content.published',
  'commerce.campaign.created',
  // commerce.lead.created intentionally NOT here — it's a generic operational
  // event that every role triggers; counting it as creator-only signal
  // would prevent gestor fallback detection.
  'commerce.whatsapp.message_sent',
]);

const SPECIALIST_EVENTS = new Set([
  'commerce.kyc.submitted',
  'commerce.kyc.approved',
  'commerce.flows.deployed',
  'commerce.whatsapp.configuration_updated',
]);

/**
 * Build a fingerprint (event name → count) from a list of spine events.
 */
function fingerprintEvents(
  events: readonly SpineEventRef[],
): Map<string, number> {
  const fp = new Map<string, number>();
  for (const e of events) {
    fp.set(e.eventName, (fp.get(e.eventName) ?? 0) + 1);
  }
  return fp;
}

/**
 * Compute a role candidate score based on matching event counts.
 */
function scoreRole(
  fp: Map<string, number>,
  roleEvents: Set<string>,
  totalEvents: number,
): number {
  if (totalEvents === 0) {return 0;}
  let hits = 0;
  for (const name of roleEvents) {
    hits += fp.get(name) ?? 0;
  }
  return hits / Math.max(totalEvents, 1);
}

/**
 * UTP-ROLE-001: detect the workspace owner role from spine usage.
 *
 * Scores each role against the spine fingerprint and returns
 * ranked detections. The role with the highest score that also
 * passes a minimum confidence is the primary detection.
 *
 * Confidence is penalised when multiple roles have similar scores
 * (ambivalence penalty).
 */
export function detectRoles(input: RoleDetectorInput): readonly RoleDetection[] {
  const nowMs = input.nowMs ?? Date.now();
  const events = input.events;
  const detectedAt = new Date(nowMs).toISOString();

  if (events.length === 0) {
    return [];
  }

  const fp = fingerprintEvents(events);
  const total = events.length;

  const rawScores: { role: Role; score: number; signals: string[] }[] = [];

  const roleEventMap: { role: Role; set: Set<string> }[] = [
    { role: 'produtor', set: PRODUCER_EVENTS },
    { role: 'afiliado', set: AFFILIATE_EVENTS },
    { role: 'agencia', set: AGENCY_EVENTS },
    { role: 'closer', set: CLOSER_EVENTS },
    { role: 'creator', set: CREATOR_EVENTS },
    { role: 'especialista', set: SPECIALIST_EVENTS },
  ];

  for (const { role, set } of roleEventMap) {
    const raw = scoreRole(fp, set, total);
    const signals: string[] = [];
    for (const name of set) {
      const count = fp.get(name);
      if (count && count > 0) {
        signals.push(name);
      }
    }
    rawScores.push({ role, score: raw, signals });
  }

  // Gestor is detected by exclusion: has events but low specialisation
  const maxSpecialised = Math.max(...rawScores.map((r) => r.score));
  const isManager =
    total > 5 && maxSpecialised < 0.2;
  if (isManager) {
    rawScores.push({
      role: 'gestor',
      score: 0.15 + (total > 20 ? 0.1 : 0),
      signals: ['commerce.lead.created', 'workspace.settings.updated'],
    });
  }

  // Boost agency for multi-workspace events
  const uniqueWorkspaces = new Set(
    events.map((e) => e.workspaceId).filter(Boolean),
  );
  if (uniqueWorkspaces.size > 1) {
    const agencyEntry = rawScores.find((r) => r.role === 'agencia');
    if (agencyEntry) {
      agencyEntry.score = Math.min(1, agencyEntry.score + 0.3);
    }
  }

  // Boost closer if deal_won count is high relative to total
  const dealsWon = fp.get('commerce.crm.deal_won') ?? 0;
  const dealsLost = fp.get('commerce.crm.deal_lost') ?? 0;
  if (dealsWon + dealsLost > total * 0.15) {
    const closerEntry = rawScores.find((r) => r.role === 'closer');
    if (closerEntry) {
      closerEntry.score = Math.min(1, closerEntry.score + 0.25);
    }
  }

  // Convert to detections with confidence clamping and ambivalence penalty
  const nonZero = rawScores.filter((r) => r.score > 0);

  const detections: RoleDetection[] = nonZero
    .sort((a, b) => b.score - a.score)
    .map((r, _idx, arr) => {
      let conf = clampConfidence(r.score);
      // Ambivalence penalty: if multiple roles score close to each other,
      // reduce confidence proportionally
      if (arr.length > 1) {
        const second = arr[0]?.role === r.role ? arr[1] : arr[0];
        if (second) {
          const gap = Math.abs(r.score - second.score);
          if (gap < 0.15) {
            conf = clampConfidence(conf * 0.6);
          }
        }
      }
      return {
        role: r.role,
        confidence: Math.round(conf * 100) / 100,
        detectedFromSignals: r.signals,
        workspaceId: input.workspaceId,
        truthMode: 'inferred' as const,
        detectedAt,
      };
    })
    .filter((d) => d.confidence >= 0.1);

  return detections;
}

/**
 * UTP-ROLE-001 helper: pick the primary role from detections.
 * Returns undefined if no detections exist.
 */
export function primaryRoleFromDetections(
  detections: readonly RoleDetection[],
): Role | undefined {
  if (detections.length === 0) {return undefined;}
  // Primary is the highest-confidence detection above 0.3
  const candidates = detections.filter((d) => d.confidence >= 0.3);
  if (candidates.length === 0) {return undefined;}
  return candidates[0]!.role;
}
