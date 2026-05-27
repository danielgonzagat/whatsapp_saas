import { Test } from '@nestjs/testing';

jest.mock('../../common/random-id', () => ({
  randomIdSegment: jest.fn().mockReturnValue('abc12345'),
}));

import {
  MercadoEntradaDeclaratorService,
  ACTIVE_ENTRY_MARKET,
  ENTRY_MARKET_CANDIDATES,
  findCandidateById,
  entryMarketFromCandidate,
  computeCompositeScore,
} from './mercado-entrada.declarator.service';

describe('MercadoEntradaDeclaratorService', () => {
  let service: MercadoEntradaDeclaratorService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [MercadoEntradaDeclaratorService],
    }).compile();

    service = module.get(MercadoEntradaDeclaratorService);
    await service.onModuleInit();
  });

  it('initialises with the first candidate as active market', () => {
    const active = service.getActiveMarket();
    expect(active.marketId).toBe(ACTIVE_ENTRY_MARKET.marketId);
    expect(active.role).toBe(ACTIVE_ENTRY_MARKET.role);
    expect(active.stage).toBe(ACTIVE_ENTRY_MARKET.stage);
  });

  it('getActiveDeclaration returns declaration with eventId', () => {
    const decl = service.getActiveDeclaration();
    expect(decl.active.marketId).toBe(ACTIVE_ENTRY_MARKET.marketId);
    expect(decl.declaredBy).toBe('MercadoEntradaDeclarator.onModuleInit');
    expect(decl.eventId).toMatch(/^me_/);
  });

  it('getCandidates returns all ranked candidates', () => {
    const candidates = service.getCandidates();
    expect(candidates.length).toBe(5);
    expect(candidates[0]!.rank).toBe(1);
    expect(candidates[4]!.rank).toBe(5);
  });

  it('getDeclarationHistory tracks declarations', () => {
    const history = service.getDeclarationHistory();
    expect(history.length).toBe(1);
    expect(history[0]!.active.marketId).toBe(ACTIVE_ENTRY_MARKET.marketId);
  });

  it('declareMarket returns error for unknown marketId', () => {
    const result = service.declareMarket('nonexistent', 'test');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unknown marketId');
  });

  it('declareMarket succeeds for a valid candidate', () => {
    const secondId = ENTRY_MARKET_CANDIDATES[1]!.marketId;
    const result = service.declareMarket(secondId, 'admin-test');

    expect(result.ok).toBe(true);
    expect(result.declaration.active.marketId).toBe(secondId);
    expect(result.declaration.declaredBy).toBe('admin-test');
    expect(result.declaration.previousMarketId).toBe(ACTIVE_ENTRY_MARKET.marketId);
  });

  it('declareMarket returns same declaration when re-declaring current', () => {
    const result = service.declareMarket(ACTIVE_ENTRY_MARKET.marketId, 'admin');
    expect(result.ok).toBe(true);
    expect(result.declaration.active.marketId).toBe(ACTIVE_ENTRY_MARKET.marketId);
    expect(result.declaration.previousMarketId).toBeUndefined();
  });

  it('buildRanking returns ranked snapshot with active market', () => {
    const ranking = service.buildRanking();
    expect(ranking.candidates.length).toBe(5);
    expect(ranking.active.marketId).toBe(service.getActiveMarket().marketId);
    expect(ranking.rankedAt).toBeDefined();
  });

  it('history grows after declareMarket', () => {
    const thirdId = ENTRY_MARKET_CANDIDATES[2]!.marketId;
    service.declareMarket(thirdId, 'admin');
    const history = service.getDeclarationHistory();
    expect(history.length).toBe(2);
    expect(history[1]!.active.marketId).toBe(thirdId);
  });
});

describe('computeCompositeScore (pure function)', () => {
  it('computes weighted composite score', () => {
    const score = computeCompositeScore(0.9, 0.95, 0.95, 0.85, 0.9);
    expect(score).toBeGreaterThan(0.8);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('returns zero for all-zero inputs', () => {
    expect(computeCompositeScore(0, 0, 0, 0, 0)).toBe(0);
  });
});

describe('findCandidateById (pure function)', () => {
  it('finds candidate by id', () => {
    const c = findCandidateById(ENTRY_MARKET_CANDIDATES[0]!.marketId);
    expect(c).toBeDefined();
    expect(c!.rank).toBe(1);
  });

  it('returns undefined for unknown id', () => {
    expect(findCandidateById('nope')).toBeUndefined();
  });
});

describe('entryMarketFromCandidate (pure function)', () => {
  it('strips scoring fields from candidate', () => {
    const candidate = ENTRY_MARKET_CANDIDATES[0]!;
    const market = entryMarketFromCandidate(candidate);
    expect(market.marketId).toBe(candidate.marketId);
    expect(market.label).toBe(candidate.label);
    expect((market as any).compositeScore).toBeUndefined();
    expect((market as any).rank).toBeUndefined();
  });
});
