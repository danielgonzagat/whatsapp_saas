/**
 * MercadoEntradaDeclaratorService — spec (>= 12 scenarios).
 *
 * Tests:
 *   1.  ACTIVE_ENTRY_MARKET is the first candidate (produtor + validacao + infoproduto + checkout_direto)
 *   2.  ENTRY_MARKET_CANDIDATES has exactly 5 entries
 *   3.  Candidates are ranked in descending compositeScore order
 *   4.  All 5 candidates have valid role, stage, businessType, and flagshipJourney
 *   5.  All composite scores are in [0, 1] range
 *   6.  All candidate scores (5 dimensions) are in [0, 1] range
 *   7.  computeCompositeScore returns correct weighted value
 *   8.  getCandidates() returns all 5 candidates
 *   9.  getActiveMarket() returns the active market
 *   10. getActiveDeclaration() returns a valid declaration with eventId
 *   11. declareMarket() succeeds for valid marketId
 *   12. declareMarket() fails for unknown marketId
 *   13. declareMarket() emits mercado_entrada.declared event via spine
 *   14. getDeclarationHistory() tracks all declarations
 *   15. buildRanking() returns complete ranking with active market
 *   16. findCandidateById returns undefined for unknown ID
 *   17. entryMarketFromCandidate strips candidate scores
 */
import { MercadoEntradaDeclaratorService } from './mercado-entrada.declarator.service';
import {
  ACTIVE_ENTRY_MARKET,
  ENTRY_MARKET_CANDIDATES,
  ALL_BUSINESS_TYPES,
  ALL_FLAGSHIP_JOURNEYS,
  SCORING_WEIGHTS,
  computeCompositeScore,
  findCandidateById,
  entryMarketFromCandidate,
} from './mercado-entrada.declarator.service';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import { ValenceTaggerService } from '../mind/valence-tagger.service';
import type { SpineEventEnvelope } from '../spine/spine-event.types';
import type { Role } from '../role/types';
import type { MaturityStage } from '../maturity/maturity.types';
import { ALL_ROLES } from '../role/types';
import { MATURITY_STAGES_ORDERED } from '../maturity/maturity.types';

// =========================================================================
// HELPERS
// =========================================================================

function makeService(spine?: SpineEmitterService): MercadoEntradaDeclaratorService {
  const svc = new MercadoEntradaDeclaratorService();
  svc.setSpine(spine);
  svc.onModuleInit();
  return svc;
}

function makeSpine(): SpineEmitterService {
  return new SpineEmitterService(new ValenceTaggerService());
}

function spineEventsOfKind(
  spine: SpineEmitterService,
  eventName: string,
): readonly SpineEventEnvelope[] {
  return spine.recentEvents().filter((e) => e.eventName === eventName);
}

function hasValidRole(role: Role): boolean {
  return ALL_ROLES.includes(role);
}

function hasValidStage(stage: MaturityStage): boolean {
  return MATURITY_STAGES_ORDERED.includes(stage);
}

function hasValidBusinessType(bt: string): boolean {
  return ALL_BUSINESS_TYPES.includes(bt as typeof ALL_BUSINESS_TYPES[number]);
}

function hasValidJourney(j: string): boolean {
  return ALL_FLAGSHIP_JOURNEYS.includes(j as typeof ALL_FLAGSHIP_JOURNEYS[number]);
}

// =========================================================================
// SCENARIO 1 — ACTIVE_ENTRY_MARKET identity
// =========================================================================
describe('MercadoEntradaDeclarator — ACTIVE_ENTRY_MARKET', () => {
  it('1. is produtor + validacao + infoproduto + checkout_direto', () => {
    expect(ACTIVE_ENTRY_MARKET.marketId).toBe(
      'produtor-infoproduto-validacao-checkout',
    );
    expect(ACTIVE_ENTRY_MARKET.role).toBe('produtor');
    expect(ACTIVE_ENTRY_MARKET.stage).toBe('validacao');
    expect(ACTIVE_ENTRY_MARKET.businessType).toBe('infoproduto');
    expect(ACTIVE_ENTRY_MARKET.flagshipJourney).toBe('checkout_direto');
    expect(ACTIVE_ENTRY_MARKET.rationale.length).toBeGreaterThan(0);
    expect(ACTIVE_ENTRY_MARKET.label.length).toBeGreaterThan(0);
  });

  it('2. is identical to ENTRY_MARKET_CANDIDATES[0] (minus scores)', () => {
    const top = ENTRY_MARKET_CANDIDATES[0];
    expect(ACTIVE_ENTRY_MARKET.marketId).toBe(top.marketId);
    expect(ACTIVE_ENTRY_MARKET.role).toBe(top.role);
    expect(ACTIVE_ENTRY_MARKET.stage).toBe(top.stage);
    expect(ACTIVE_ENTRY_MARKET.businessType).toBe(top.businessType);
    expect(ACTIVE_ENTRY_MARKET.flagshipJourney).toBe(top.flagshipJourney);
  });
});

// =========================================================================
// SCENARIO 2-3 — candidate count and rank order
// =========================================================================
describe('MercadoEntradaDeclarator — candidates', () => {
  it('3. ENTRY_MARKET_CANDIDATES has exactly 5 entries', () => {
    expect(ENTRY_MARKET_CANDIDATES).toHaveLength(5);
  });

  it('4. candidates are ranked 1..5 in descending compositeScore', () => {
    for (let i = 1; i < ENTRY_MARKET_CANDIDATES.length; i++) {
      const prev = ENTRY_MARKET_CANDIDATES[i - 1]!;
      const curr = ENTRY_MARKET_CANDIDATES[i]!;
      expect(prev.compositeScore).toBeGreaterThanOrEqual(curr.compositeScore);
      expect(curr.rank).toBe(i + 1);
    }
    expect(ENTRY_MARKET_CANDIDATES[0]!.rank).toBe(1);
  });

  it('5. every candidate marketId is unique', () => {
    const ids = ENTRY_MARKET_CANDIDATES.map((c) => c.marketId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// =========================================================================
// SCENARIO 4-5 — type validity
// =========================================================================
describe('MercadoEntradaDeclarator — type invariants', () => {
  it('6. all candidates have valid role, stage, businessType, and journey', () => {
    for (const c of ENTRY_MARKET_CANDIDATES) {
      expect(hasValidRole(c.role)).toBe(true);
      expect(hasValidStage(c.stage)).toBe(true);
      expect(hasValidBusinessType(c.businessType)).toBe(true);
      expect(hasValidJourney(c.flagshipJourney)).toBe(true);
    }
  });

  it('7. all scores (5 dims + composite) are in [0, 1] range', () => {
    for (const c of ENTRY_MARKET_CANDIDATES) {
      expect(c.payablePainSize).toBeGreaterThanOrEqual(0);
      expect(c.payablePainSize).toBeLessThanOrEqual(1);
      expect(c.n4plusProofSpeed).toBeGreaterThanOrEqual(0);
      expect(c.n4plusProofSpeed).toBeLessThanOrEqual(1);
      expect(c.adoptionFriction).toBeGreaterThanOrEqual(0);
      expect(c.adoptionFriction).toBeLessThanOrEqual(1);
      expect(c.spontaneousReferral).toBeGreaterThanOrEqual(0);
      expect(c.spontaneousReferral).toBeLessThanOrEqual(1);
      expect(c.indispensability).toBeGreaterThanOrEqual(0);
      expect(c.indispensability).toBeLessThanOrEqual(1);
      expect(c.compositeScore).toBeGreaterThanOrEqual(0);
      expect(c.compositeScore).toBeLessThanOrEqual(1);
    }
  });

  it('8. scoring weights sum to 1.0', () => {
    const sum =
      SCORING_WEIGHTS.payablePainSize +
      SCORING_WEIGHTS.n4plusProofSpeed +
      SCORING_WEIGHTS.adoptionFriction +
      SCORING_WEIGHTS.spontaneousReferral +
      SCORING_WEIGHTS.indispensability;
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('9. computeCompositeScore matches expected for known inputs', () => {
    const score = computeCompositeScore(1.0, 1.0, 1.0, 1.0, 1.0);
    expect(score).toBeCloseTo(1.0, 3);

    const zero = computeCompositeScore(0, 0, 0, 0, 0);
    expect(zero).toBeCloseTo(0, 3);

    const partial = computeCompositeScore(0.5, 0.5, 0.5, 0.5, 0.5);
    expect(partial).toBeCloseTo(0.5, 3);
  });
});

// =========================================================================
// SCENARIO 8-9 — service getters
// =========================================================================
describe('MercadoEntradaDeclaratorService — getters', () => {
  it('10. getCandidates() returns all 5 candidates', () => {
    const svc = makeService();
    expect(svc.getCandidates()).toHaveLength(5);
  });

  it('11. getActiveMarket() returns the active entry market', () => {
    const svc = makeService();
    const active = svc.getActiveMarket();
    expect(active.marketId).toBe('produtor-infoproduto-validacao-checkout');
    expect(active.role).toBe('produtor');
  });

  it('12. getActiveDeclaration() returns declaration with eventId and timestamp', () => {
    const svc = makeService();
    const decl = svc.getActiveDeclaration();
    expect(decl.active.marketId).toBe('produtor-infoproduto-validacao-checkout');
    expect(decl.declaredAt).toBeTruthy();
    expect(decl.declaredBy).toBeTruthy();
    expect(decl.eventId).toBeTruthy();
    expect(decl.eventId.startsWith('me_')).toBe(true);
  });
});

// =========================================================================
// SCENARIO 10-11 — declareMarket
// =========================================================================
describe('MercadoEntradaDeclaratorService — declareMarket', () => {
  it('13. declareMarket succeeds for valid marketId', () => {
    const svc = makeService();
    const result = svc.declareMarket('closer-tracao-whatsapp', 'test-suite');
    expect(result.ok).toBe(true);
    expect(result.declaration.active.marketId).toBe('closer-tracao-whatsapp');
    expect(result.declaration.declaredBy).toBe('test-suite');
    expect(result.declaration.previousMarketId).toBe('produtor-infoproduto-validacao-checkout');
    expect(result.declaration.eventId.startsWith('me_')).toBe(true);

    const active = svc.getActiveMarket();
    expect(active.marketId).toBe('closer-tracao-whatsapp');
  });

  it('14. declareMarket fails for unknown marketId', () => {
    const svc = makeService();
    const result = svc.declareMarket('mercado-inexistente', 'test-suite');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unknown marketId');
    expect(result.error).toContain('mercado-inexistente');

    const active = svc.getActiveMarket();
    expect(active.marketId).toBe('produtor-infoproduto-validacao-checkout');
  });

  it('15. declareMarket to same market returns ok without history growth', () => {
    const svc = makeService();
    const before = svc.getDeclarationHistory().length;
    const result = svc.declareMarket('produtor-infoproduto-validacao-checkout', 'test');
    expect(result.ok).toBe(true);
    expect(result.declaration.previousMarketId).toBeUndefined();
    expect(svc.getDeclarationHistory()).toHaveLength(before);
  });
});

// =========================================================================
// SCENARIO 12 — spine emission
// =========================================================================
describe('MercadoEntradaDeclaratorService — spine emission', () => {
  it('16. declareMarket emits mercado_entrada.declared event via spine', () => {
    const spine = makeSpine();
    const svc = makeService(spine);
    svc.declareMarket('closer-tracao-whatsapp', 'spine-test');

    const mercadoEvents = spineEventsOfKind(spine, 'mercado_entrada.declared');
    expect(mercadoEvents.length).toBeGreaterThanOrEqual(2);

    const latest = mercadoEvents[mercadoEvents.length - 1]!;
    const payload = latest.payload ?? {};
    expect(payload['marketId']).toBe('closer-tracao-whatsapp');
    expect(payload['role']).toBe('closer');
    expect(payload['stage']).toBe('tracao');
    expect(payload['businessType']).toBe('servico');
    expect(payload['flagshipJourney']).toBe('whatsapp_vendas');
    expect(payload['declaredBy']).toBe('spine-test');
    expect(payload['previousMarketId']).toBe('produtor-infoproduto-validacao-checkout');
  });

  it('17. second declaration carries correct previousMarketId', () => {
    const spine = makeSpine();
    const svc = makeService(spine);
    svc.declareMarket('closer-tracao-whatsapp', 'step-1');
    svc.declareMarket('afiliado-tracao-afiliacao', 'step-2');

    const events = spineEventsOfKind(spine, 'mercado_entrada.declared');
    expect(events.length).toBeGreaterThanOrEqual(2);

    const second = events[events.length - 1]!;
    const payload = second.payload ?? {};
    expect(payload['marketId']).toBe('afiliado-tracao-afiliacao');
    expect(payload['previousMarketId']).toBe('closer-tracao-whatsapp');
  });

  it('18. service works without spine (no throw)', () => {
    const svc = makeService();
    const result = svc.declareMarket('closer-tracao-whatsapp', 'no-spine');
    expect(result.ok).toBe(true);
  });
});

// =========================================================================
// SCENARIO 13-14 — declaration history
// =========================================================================
describe('MercadoEntradaDeclaratorService — history', () => {
  it('19. getDeclarationHistory starts with 1 entry (initial declaration)', () => {
    const svc = makeService();
    const history = svc.getDeclarationHistory();
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0]!.active.marketId).toBe(
      'produtor-infoproduto-validacao-checkout',
    );
  });

  it('20. getDeclarationHistory grows after each unique declaration', () => {
    const svc = makeService();
    const before = svc.getDeclarationHistory().length;
    svc.declareMarket('closer-tracao-whatsapp', 'test-A');
    svc.declareMarket('afiliado-tracao-afiliacao', 'test-B');
    expect(svc.getDeclarationHistory()).toHaveLength(before + 2);
  });

  it('21. getDeclarationHistory is a copy (immutable view)', () => {
    const svc = makeService();
    const a = svc.getDeclarationHistory();
    const b = svc.getDeclarationHistory();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// =========================================================================
// SCENARIO 15-17 — buildRanking, findCandidateById, entryMarketFromCandidate
// =========================================================================
describe('MercadoEntradaDeclarator — pure helpers', () => {
  it('22. findCandidateById returns undefined for unknown id', () => {
    expect(findCandidateById('nao-existe')).toBeUndefined();
  });

  it('23. findCandidateById returns correct candidate', () => {
    const c = findCandidateById('closer-tracao-whatsapp');
    expect(c).toBeDefined();
    expect(c!.role).toBe('closer');
    expect(c!.stage).toBe('tracao');
    expect(c!.compositeScore).toBeGreaterThan(0.7);
  });

  it('24. entryMarketFromCandidate strips score fields', () => {
    const candidate = ENTRY_MARKET_CANDIDATES[0]!;
    const market = entryMarketFromCandidate(candidate);
    expect(market.marketId).toBe(candidate.marketId);
    expect(market.label).toBe(candidate.label);
    expect(market.role).toBe(candidate.role);
    expect(market.stage).toBe(candidate.stage);
    expect(market.businessType).toBe(candidate.businessType);
    expect(market.flagshipJourney).toBe(candidate.flagshipJourney);
    expect(market.rationale).toBe(candidate.rationale);
    expect((market as Record<string, unknown>)['payablePainSize']).toBeUndefined();
    expect((market as Record<string, unknown>)['compositeScore']).toBeUndefined();
  });

  it('25. buildRanking returns complete ranking with active market', () => {
    const svc = makeService();
    const ranking = svc.buildRanking();
    expect(ranking.candidates).toHaveLength(5);
    expect(ranking.active.marketId).toBe('produtor-infoproduto-validacao-checkout');
    expect(ranking.rankedAt).toBeTruthy();
  });
});

// =========================================================================
// SCENARIO — full cycle: declare all 5 candidates
// =========================================================================
describe('MercadoEntradaDeclaratorService — full cycle', () => {
  it('26. can cycle through all 5 candidates and back to active', () => {
    const spine = makeSpine();
    const svc = makeService(spine);

    const ids = ENTRY_MARKET_CANDIDATES.map((c) => c.marketId);
    for (const id of ids) {
      const result = svc.declareMarket(id, 'cycle-test');
      expect(result.ok).toBe(true);
    }

    expect(svc.getActiveMarket().marketId).toBe(ids[ids.length - 1]!);

    const final = svc.declareMarket('produtor-infoproduto-validacao-checkout', 'cycle-test');
    expect(final.ok).toBe(true);
    expect(svc.getActiveMarket().marketId).toBe('produtor-infoproduto-validacao-checkout');

    const marketEvents = spineEventsOfKind(spine, 'mercado_entrada.declared');
    expect(marketEvents.length).toBeGreaterThanOrEqual(5);
  });
});
