import { makeDisclosureEngineGate, DisclosureEngineInput } from './disclosure-engine.gate';
import type { GateVerdict } from './pulse-gates.types';

/**
 * UTP-INCENT-005 — disclosure-engine gate contract spec.
 *
 * Covers >=25 scenarios:
 *   - Positive (PASS): no affiliation, valid disclosures, fully disclosed ties.
 *   - Negative (FAIL): hidden affiliation, missing commercialRelationship field,
 *     undisclosed commercial ties, non-public relationship, stale disclosure.
 */

function validInput(overrides?: Partial<DisclosureEngineInput>): DisclosureEngineInput {
  return {
    recommendationId: 'rec-001',
    recommendedPartyId: 'party-abc-123',
    recommendedPartyName: 'Acme Tools',
    isKloelAffiliate: false,
    hasCommercialRelationship: false,
    ...overrides,
  };
}

function check(input: DisclosureEngineInput, mode?: 'log_only' | 'hard_fail'): GateVerdict {
  return makeDisclosureEngineGate(mode).check(input);
}

// ─── Positive (PASS) scenarios ────────────────────────────────────────

describe('disclosure-engine gate — PASS scenarios', () => {
  it('1. no affiliate, no commercial relationship passes', () => {
    expect(check(validInput()).status).toBe('PASS');
  });

  it('2. isKloelAffiliate=true with valid disclosureStatement passes', () => {
    const v = check(validInput({
      isKloelAffiliate: true,
      disclosureStatement: 'Kloel receives a commission for referrals to Acme Tools.',
    }));
    expect(v.status).toBe('PASS');
  });

  it('3. hasCommercialRelationship=true with commercialRelationship and disclosure passes', () => {
    const v = check(validInput({
      hasCommercialRelationship: true,
      disclosureStatement: 'Kloel has a revenue-sharing agreement with Acme Tools as of Q1 2026.',
      commercialRelationship: {
        type: 'revenue-share',
        details: '10% revenue share on converted referrals',
        isPublic: true,
      },
    }));
    expect(v.status).toBe('PASS');
  });

  it('4. both affiliate and commercial relationship fully disclosed passes', () => {
    const v = check(validInput({
      isKloelAffiliate: true,
      hasCommercialRelationship: true,
      disclosureStatement: 'Kloel is an affiliate of Acme Tools and receives compensation for referrals.',
      commercialRelationship: {
        type: 'affiliate',
        details: 'Kloel earns commission on each referred sale',
        isPublic: true,
      },
    }));
    expect(v.status).toBe('PASS');
  });

  it('5. isKloelAffiliate=false with disclosure alone (no commercial relationship) passes', () => {
    const v = check(validInput({
      isKloelAffiliate: false,
      disclosureStatement: undefined,
    }));
    expect(v.status).toBe('PASS');
  });

  it('6. commercial relationship with long disclosure and isPublic=true passes', () => {
    const v = check(validInput({
      hasCommercialRelationship: true,
      disclosureStatement: 'Kloel maintains a strategic partnership with Acme Tools since March 2026.',
      commercialRelationship: {
        type: 'sponsorship',
        details: 'Annual sponsorship agreement for platform integration',
        isPublic: true,
      },
    }));
    expect(v.status).toBe('PASS');
  });

  it('7. equity-type commercial relationship with full disclosure passes', () => {
    const v = check(validInput({
      hasCommercialRelationship: true,
      disclosureStatement: 'Kloel holds equity in Acme Tools parent company.',
      commercialRelationship: {
        type: 'equity',
        details: '5% equity stake acquired in seed round',
        isPublic: true,
      },
    }));
    expect(v.status).toBe('PASS');
  });
});

// ─── Negative (FAIL) — hidden affiliation ─────────────────────────────

describe('disclosure-engine gate — FAIL (hidden affiliation)', () => {
  it('8. isKloelAffiliate=true without disclosureStatement fails', () => {
    const v = check(validInput({
      isKloelAffiliate: true,
      disclosureStatement: undefined,
    }));
    expect(v.status).toBe('FAIL');
    expect(v.reason).toMatch(/disclosure violation/);
    expect(v.evidence!.length).toBe(1);
    expect(v.evidence![0]!.path).toBe('$.disclosureStatement');
    expect(v.evidence![0]!.detail).toMatch(/hidden affiliation/);
  });

  it('9. isKloelAffiliate=true with disclosureStatement="" (empty string) fails', () => {
    const v = check(validInput({
      isKloelAffiliate: true,
      disclosureStatement: '',
    }));
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0]!.detail).toMatch(/hidden affiliation/);
  });

  it('10. isKloelAffiliate=true with disclosureStatement="   " (whitespace) fails', () => {
    const v = check(validInput({
      isKloelAffiliate: true,
      disclosureStatement: '   ',
    }));
    expect(v.status).toBe('FAIL');
  });

  it('11. isKloelAffiliate=true with disclosure too short (under 10 chars) fails', () => {
    const v = check(validInput({
      isKloelAffiliate: true,
      disclosureStatement: 'Affil.',
    }));
    expect(v.status).toBe('FAIL');
    expect(v.evidence!.some((e) => e.detail.includes('insufficient disclosure'))).toBe(true);
  });

  it('12. isKloelAffiliate=true with disclosure exactly 9 chars fails', () => {
    const v = check(validInput({
      isKloelAffiliate: true,
      disclosureStatement: '123456789',
    }));
    expect(v.status).toBe('FAIL');
  });
});

// ─── Negative (FAIL) — missing commercialRelationship field ───────────

describe('disclosure-engine gate — FAIL (missing commercialRelationship)', () => {
  it('13. hasCommercialRelationship=true without commercialRelationship object fails', () => {
    const v = check(validInput({
      hasCommercialRelationship: true,
      commercialRelationship: undefined,
    }));
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0]!.path).toBe('$.commercialRelationship');
    expect(v.evidence![0]!.detail).toMatch(/missing commercial relationship/);
  });

  it('14. hasCommercialRelationship=true with commercialRelationship=null fails', () => {
    const v = check(validInput({
      hasCommercialRelationship: true,
      commercialRelationship: null as unknown as undefined,
    }));
    expect(v.status).toBe('FAIL');
  });

  it('15. hasCommercialRelationship=true with disclosure but no commercialRelationship fails', () => {
    const v = check(validInput({
      hasCommercialRelationship: true,
      disclosureStatement: 'Kloel has a partnership with Acme Tools.',
      commercialRelationship: undefined,
    }));
    expect(v.status).toBe('FAIL');
    expect(v.evidence!.some((e) => e.path === '$.commercialRelationship')).toBe(true);
  });
});

// ─── Negative (FAIL) — undisclosed commercial ties ────────────────────

describe('disclosure-engine gate — FAIL (undisclosed commercial ties)', () => {
  it('16. commercialRelationship present without disclosureStatement fails', () => {
    const v = check(validInput({
      commercialRelationship: {
        type: 'revenue-share',
        details: '10% revenue share',
        isPublic: true,
      },
      disclosureStatement: undefined,
    }));
    expect(v.status).toBe('FAIL');
    expect(v.evidence!.some((e) => e.detail.includes('undisclosed commercial tie'))).toBe(true);
  });

  it('17. commercialRelationship with isPublic=false fails', () => {
    const v = check(validInput({
      hasCommercialRelationship: true,
      disclosureStatement: 'Kloel has a commercial relationship with Acme Tools.',
      commercialRelationship: {
        type: 'sponsorship',
        details: 'Sponsorship agreement',
        isPublic: false,
      },
    }));
    expect(v.status).toBe('FAIL');
    expect(v.evidence!.some((e) => e.path === '$.commercialRelationship.isPublic')).toBe(true);
  });

  it('18. commercialRelationship isPublic=false without disclosureStatement fails (multiple violations)', () => {
    const v = check(validInput({
      hasCommercialRelationship: true,
      commercialRelationship: {
        type: 'equity',
        details: 'Equity stake',
        isPublic: false,
      },
      disclosureStatement: undefined,
    }));
    expect(v.status).toBe('FAIL');
    expect(v.evidence!.length).toBeGreaterThanOrEqual(2);
  });

  it('19. affiliate + hidden commercial relationship produces multiple evidence entries', () => {
    const v = check(validInput({
      isKloelAffiliate: true,
      hasCommercialRelationship: true,
      disclosureStatement: undefined,
      commercialRelationship: {
        type: 'affiliate',
        details: 'Commission agreement',
        isPublic: false,
      },
    }));
    expect(v.status).toBe('FAIL');
    expect(v.evidence!.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── Negative (FAIL) — stale disclosure ───────────────────────────────

describe('disclosure-engine gate — FAIL (stale disclosure)', () => {
  it('20. disclosureStatement present but no affiliate or commercial relationship fails', () => {
    const v = check(validInput({
      isKloelAffiliate: false,
      hasCommercialRelationship: false,
      commercialRelationship: undefined,
      disclosureStatement: 'Kloel is a partner of Acme Tools.',
    }));
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0]!.detail).toMatch(/stale disclosure/);
  });
});

// ─── Deep payload edge cases ──────────────────────────────────────────

describe('disclosure-engine gate — edge cases', () => {
  it('21. isKloelAffiliate=true with disclosureStatement exactly at minimum length passes', () => {
    const v = check(validInput({
      isKloelAffiliate: true,
      disclosureStatement: '1234567890',
    }));
    expect(v.status).toBe('PASS');
  });

  it('22. commercialRelationship with empty type and valid disclosure passes', () => {
    const v = check(validInput({
      hasCommercialRelationship: true,
      disclosureStatement: 'Kloel maintains a commercial relationship with Acme Tools since 2025.',
      commercialRelationship: {
        type: '',
        details: 'Details pending',
        isPublic: true,
      },
    }));
    expect(v.status).toBe('PASS');
  });
});

// ─── Mode contract ────────────────────────────────────────────────────

describe('disclosure-engine gate — mode contract', () => {
  it('23. default mode is hard_fail', () => {
    const v = makeDisclosureEngineGate().check(validInput());
    expect(v.mode).toBe('hard_fail');
  });

  it('24. explicitly set log_only mode is respected', () => {
    const v = makeDisclosureEngineGate('log_only').check(validInput());
    expect(v.mode).toBe('log_only');
  });

  it('25. FAIL verdict carries hard_fail mode when configured', () => {
    const v = makeDisclosureEngineGate('hard_fail').check(validInput({
      isKloelAffiliate: true,
    }));
    expect(v.status).toBe('FAIL');
    expect(v.mode).toBe('hard_fail');
  });

  it('26. PASS verdict includes no reason field', () => {
    const v = check(validInput());
    expect(v.status).toBe('PASS');
    expect(v.reason).toBeUndefined();
  });

  it('27. FAIL verdict includes reason and evidence', () => {
    const v = check(validInput({
      isKloelAffiliate: true,
      disclosureStatement: undefined,
    }));
    expect(v.status).toBe('FAIL');
    expect(v.reason).toBeDefined();
    expect(v.evidence).toBeDefined();
    expect(v.evidence!.length).toBeGreaterThan(0);
  });

  it('28. FAIL verdict reason mentions recommendationId and party name', () => {
    const v = check(validInput({
      isKloelAffiliate: true,
      disclosureStatement: undefined,
    }));
    expect(v.reason).toContain('rec-001');
    expect(v.reason).toContain('Acme Tools');
  });

  it('29. measuredAt is a valid ISO date', () => {
    const v = check(validInput());
    expect(() => new Date(v.measuredAt)).not.toThrow();
    expect(new Date(v.measuredAt).toISOString()).toBe(v.measuredAt);
  });

  it('30. measuredBy is the correct gate identifier', () => {
    const v = makeDisclosureEngineGate().check(validInput());
    expect(v.measuredBy).toBe('disclosure-engine.gate');
  });

  it('31. gate name matches canonical name', () => {
    const v = makeDisclosureEngineGate().check(validInput());
    expect(v.gateName).toBe('disclosure-engine');
  });

  it('32. evidence entry contains path and detail fields', () => {
    const v = check(validInput({
      isKloelAffiliate: true,
      disclosureStatement: undefined,
    }));
    expect(v.status).toBe('FAIL');
    const ev = v.evidence![0]!;
    expect(ev.path).toBeDefined();
    expect(typeof ev.path).toBe('string');
    expect(ev.detail).toBeDefined();
    expect(typeof ev.detail).toBe('string');
  });

  it('33. PASS verdict has no evidence array', () => {
    const v = check(validInput());
    expect(v.status).toBe('PASS');
    expect(v.evidence).toBeUndefined();
  });
});
