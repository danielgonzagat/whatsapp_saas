import { fail, Gate, GateEvidence, GateMode, GateVerdict, pass } from './pulse-gates.types';

/**
 * UTP-INCENT-005 — `disclosure-engine` gate.
 *
 * Implements PCI.4 §3.14: cross-recommendations issued by Kloel must
 * explicitly disclose any commercial relationship between Kloel and the
 * recommended party. Hidden affiliations, missing commercial relationship
 * fields, and undisclosed commercial ties are blocking violations.
 *
 * Detection surface:
 *  1. Hidden affiliation: isKloelAffiliate is true but no disclosureStatement
 *     is provided, or the disclosureStatement is empty/whitespace-only.
 *  2. Missing commercial relationship field: hasCommercialRelationship is
 *     true but commercialRelationship is undefined/null/missing.
 *  3. Commercial relationship with undisclosed tie: commercialRelationship
 *     is present and valid, but no disclosureStatement accompanies it.
 *  4. Commercial relationship marked as non-public: commercialRelationship
 *     exists but isPublic is explicitly false, violating disclosure duty.
 *  5. Disclosure is present but references no actual commercial relationship.
 *
 * Default mode: hard_fail per PCI.4 §3.14 (Onda 9 hard_fail same-wave).
 */
const MEASURED_BY = 'disclosure-engine.gate' as const;

const MIN_DISCLOSURE_LENGTH = 10;

export interface CommercialRelationship {
  readonly type: string;
  readonly details: string;
  readonly isPublic: boolean;
}

export interface DisclosureEngineInput {
  readonly recommendationId: string;
  readonly recommendedPartyId: string;
  readonly recommendedPartyName: string;
  readonly isKloelAffiliate?: boolean;
  readonly hasCommercialRelationship?: boolean;
  readonly disclosureStatement?: string;
  readonly commercialRelationship?: CommercialRelationship;
}

function isEmptyDisclosure(disclosure?: string): boolean {
  if (disclosure === undefined || disclosure === null) return true;
  return disclosure.trim().length === 0;
}

function isShortDisclosure(disclosure?: string): boolean {
  if (disclosure === undefined || disclosure === null) return false;
  return disclosure.trim().length < MIN_DISCLOSURE_LENGTH;
}

export function makeDisclosureEngineGate(
  mode: GateMode = 'hard_fail',
): Gate<DisclosureEngineInput> {
  return {
    name: 'disclosure-engine',
    mode,
    check: (input: DisclosureEngineInput): GateVerdict => {
      const evidence: GateEvidence[] = [];

      const hasAffiliate = input.isKloelAffiliate === true;
      const hasCommercialRel = input.hasCommercialRelationship === true;
      const hasDisclosure = !isEmptyDisclosure(input.disclosureStatement);
      const hasCommercialRelObj =
        input.commercialRelationship !== undefined &&
        input.commercialRelationship !== null;

      // 1. Hidden affiliation: affiliate flag set but no disclosure
      if (hasAffiliate && !hasDisclosure) {
        const detail = isEmptyDisclosure(input.disclosureStatement)
          ? `hidden affiliation: isKloelAffiliate=${input.isKloelAffiliate} but disclosureStatement is missing for recommended party "${input.recommendedPartyName}" (${input.recommendedPartyId})`
          : `hidden affiliation: isKloelAffiliate=${input.isKloelAffiliate} but disclosureStatement is empty for recommended party "${input.recommendedPartyName}" (${input.recommendedPartyId})`;
        evidence.push({
          path: '$.disclosureStatement',
          detail,
        });
      }

      // 2. Hidden affiliation with too-short disclosure
      if (hasAffiliate && hasDisclosure && isShortDisclosure(input.disclosureStatement)) {
        evidence.push({
          path: '$.disclosureStatement',
          detail: `insufficient disclosure: disclosureStatement for affiliate "${input.recommendedPartyName}" is too short (${input.disclosureStatement!.trim().length} chars, minimum ${MIN_DISCLOSURE_LENGTH})`,
        });
      }

      // 3. Missing commercialRelationship field when hasCommercialRelationship is set
      if (hasCommercialRel && !hasCommercialRelObj) {
        evidence.push({
          path: '$.commercialRelationship',
          detail: `missing commercial relationship: hasCommercialRelationship=${input.hasCommercialRelationship} but commercialRelationship field is absent for recommended party "${input.recommendedPartyName}" (${input.recommendedPartyId})`,
        });
      }

      // 4. Commercial relationship present but no disclosure
      if (hasCommercialRelObj && !hasDisclosure) {
        evidence.push({
          path: '$.disclosureStatement',
          detail: `undisclosed commercial tie: commercialRelationship exists (type="${input.commercialRelationship!.type}") for "${input.recommendedPartyName}" but disclosureStatement is missing`,
        });
      }

      // 5. Commercial relationship marked non-public
      if (hasCommercialRelObj && input.commercialRelationship!.isPublic === false) {
        evidence.push({
          path: '$.commercialRelationship.isPublic',
          detail: `hidden commercial relationship: commercialRelationship.isPublic is false for "${input.recommendedPartyName}" — relationship must be publicly disclosed per PCI.4 §3.14`,
        });
      }

      // 6. Disclosure present but no commercial relationship at all
      if (
        hasDisclosure &&
        !hasAffiliate &&
        !hasCommercialRel &&
        !hasCommercialRelObj
      ) {
        evidence.push({
          path: '$.disclosureStatement',
          detail: `stale disclosure: disclosureStatement is present but no affiliate flag or commercial relationship exists for "${input.recommendedPartyName}"`,
        });
      }

      if (evidence.length === 0) {
        return pass('disclosure-engine', mode, MEASURED_BY);
      }

      return fail(
        'disclosure-engine',
        mode,
        MEASURED_BY,
        `${evidence.length} disclosure violation(s) detected for recommendation "${input.recommendationId}" targeting "${input.recommendedPartyName}"`,
        evidence,
      );
    },
  };
}
