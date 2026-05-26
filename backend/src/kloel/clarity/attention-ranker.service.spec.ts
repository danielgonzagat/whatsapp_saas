import { AttentionRankerService } from './attention-ranker.service';
import type { AttentionItem } from './clarity.types';

describe('AttentionRankerService (UTP-CLARITY-001)', () => {
  const svc = new AttentionRankerService();

  /** ── silence / empty ── */

  it('returns silent when input is empty', () => {
    const result = svc.rank([]);
    expect(result.silent).toBe(true);
    expect(result.ranked).toHaveLength(0);
    expect(result.dominatedTier).toBeNull();
  });

  it('returns silent when all items have zero urgency', () => {
    const items: AttentionItem[] = [
      { id: 'a', urgency: 0, impact: 0.9, reversibility: 0.1, evidenceLevel: 0.8 },
      { id: 'b', urgency: 0, impact: 1.0, reversibility: 0, evidenceLevel: 0.5 },
    ];
    const result = svc.rank(items);
    expect(result.silent).toBe(true);
    expect(result.ranked).toHaveLength(0);
  });

  it('returns silent when all items have zero impact', () => {
    const items: AttentionItem[] = [
      { id: 'a', urgency: 0.9, impact: 0, reversibility: 0.1, evidenceLevel: 0.8 },
      { id: 'b', urgency: 1.0, impact: 0, reversibility: 0, evidenceLevel: 0.5 },
    ];
    const result = svc.rank(items);
    expect(result.silent).toBe(true);
  });

  it('returns silent when reversibility fully cancels (1 - reversibility = 0)', () => {
    const items: AttentionItem[] = [
      { id: 'x', urgency: 0.9, impact: 0.9, reversibility: 1.0, evidenceLevel: 0.7 },
    ];
    const result = svc.rank(items);
    expect(result.silent).toBe(true);
  });

  it('returns silent when all values are zero', () => {
    const items: AttentionItem[] = [
      { id: 'z', urgency: 0, impact: 0, reversibility: 0, evidenceLevel: 0 },
    ];
    const result = svc.rank(items);
    expect(result.silent).toBe(true);
  });

  /** ── single-item classification ── */

  it('classifies high urgency high impact low reversibility as AGORA', () => {
    const items: AttentionItem[] = [
      { id: 'crisis', urgency: 1.0, impact: 1.0, reversibility: 0.0, evidenceLevel: 0.9 },
    ];
    const result = svc.rank(items);
    expect(result.silent).toBe(false);
    expect(result.ranked[0]?.tier).toBe('AGORA');
    expect(result.ranked[0]?.score).toBe(1.0);
  });

  it('classifies medium-high score as ESTA_SEMANA (boundary check)', () => {
    const items: AttentionItem[] = [
      { id: 'week', urgency: 0.8, impact: 0.7, reversibility: 0.2, evidenceLevel: 0.6 },
    ];
    const result = svc.rank(items);
    const score = 0.8 * 0.7 * (1 - 0.2);
    expect(score).toBeCloseTo(0.448);
    expect(result.ranked[0]?.tier).toBe('ESTA_SEMANA');
  });

  it('classifies moderate score as PARA_SABER', () => {
    const items: AttentionItem[] = [
      { id: 'info', urgency: 0.5, impact: 0.5, reversibility: 0.3, evidenceLevel: 0.5 },
    ];
    const result = svc.rank(items);
    const score = 0.5 * 0.5 * (1 - 0.3);
    expect(score).toBeCloseTo(0.175);
    expect(result.ranked[0]?.tier).toBe('PARA_SABER');
  });

  it('classifies very low score as ARQUIVO', () => {
    const items: AttentionItem[] = [
      { id: 'dust', urgency: 0.3, impact: 0.2, reversibility: 0.5, evidenceLevel: 0.1 },
    ];
    const result = svc.rank(items);
    const score = 0.3 * 0.2 * (1 - 0.5);
    expect(score).toBeCloseTo(0.03);
    expect(result.ranked[0]?.tier).toBe('ARQUIVO');
  });

  /** ── tier boundary precision ── */

  it('places item exactly at AGORA threshold (0.70) in AGORA', () => {
    const items: AttentionItem[] = [
      { id: 'edge', urgency: 1.0, impact: 0.7, reversibility: 0.0, evidenceLevel: 1.0 },
    ];
    const result = svc.rank(items);
    expect(result.ranked[0]?.score).toBeCloseTo(0.7);
    expect(result.ranked[0]?.tier).toBe('AGORA');
  });

  it('places item just below AGORA threshold at ESTA_SEMANA', () => {
    const items: AttentionItem[] = [
      { id: 'near', urgency: 1.0, impact: 0.7, reversibility: 0.01, evidenceLevel: 1.0 },
    ];
    const result = svc.rank(items);
    expect(result.ranked[0]?.score).toBeCloseTo(0.693);
    expect(result.ranked[0]?.tier).toBe('ESTA_SEMANA');
  });

  it('places item exactly at ESTA_SEMANA threshold (0.40) in ESTA_SEMANA', () => {
    const items: AttentionItem[] = [
      { id: 'es-edge', urgency: 0.8, impact: 0.5, reversibility: 0.0, evidenceLevel: 0.5 },
    ];
    const result = svc.rank(items);
    expect(result.ranked[0]?.score).toBeCloseTo(0.4);
    expect(result.ranked[0]?.tier).toBe('ESTA_SEMANA');
  });

  it('places item exactly at PARA_SABER threshold (0.15) in PARA_SABER', () => {
    const items: AttentionItem[] = [
      { id: 'ps-edge', urgency: 0.5, impact: 0.3, reversibility: 0.0, evidenceLevel: 0.5 },
    ];
    const result = svc.rank(items);
    expect(result.ranked[0]?.score).toBeCloseTo(0.15);
    expect(result.ranked[0]?.tier).toBe('PARA_SABER');
  });

  /** ── multi-item ranking and sort stability ── */

  it('ranks multiple items in descending score order', () => {
    const items: AttentionItem[] = [
      { id: 'low', urgency: 0.5, impact: 0.3, reversibility: 0.5, evidenceLevel: 0.2 },
      { id: 'high', urgency: 1.0, impact: 1.0, reversibility: 0.0, evidenceLevel: 0.9 },
      { id: 'mid', urgency: 0.7, impact: 0.8, reversibility: 0.3, evidenceLevel: 0.6 },
    ];
    const result = svc.rank(items);
    expect(result.ranked).toHaveLength(3);
    expect(result.ranked[0]!.id).toBe('high');
    expect(result.ranked[1]!.id).toBe('mid');
    expect(result.ranked[2]!.id).toBe('low');
  });

  it('maintains stable order for equal scores via id sort', () => {
    const items: AttentionItem[] = [
      { id: 'b', urgency: 1.0, impact: 0.5, reversibility: 0.0, evidenceLevel: 0.5 },
      { id: 'a', urgency: 1.0, impact: 0.5, reversibility: 0.0, evidenceLevel: 0.5 },
    ];
    const result = svc.rank(items);
    expect(result.ranked[0]!.id).toBe('a');
    expect(result.ranked[1]!.id).toBe('b');
  });

  /** ── dominatedTier ── */

  it('reports dominatedTier as the tier with most items', () => {
    const items: AttentionItem[] = [
      { id: '1', urgency: 0.9, impact: 0.5, reversibility: 0.0, evidenceLevel: 0.5 },
      { id: '2', urgency: 0.8, impact: 0.5, reversibility: 0.0, evidenceLevel: 0.4 },
      { id: '3', urgency: 0.2, impact: 0.2, reversibility: 0.0, evidenceLevel: 0.3 },
    ];
    const result = svc.rank(items);
    expect(result.ranked[0]!.tier).toBe('ESTA_SEMANA');
    expect(result.dominatedTier).toBe('ESTA_SEMANA');
  });

  it('reports null dominatedTier when silent', () => {
    const result = svc.rank([]);
    expect(result.dominatedTier).toBeNull();
  });

  /** ── input immutability ── */

  it('does not mutate the input array', () => {
    const items: AttentionItem[] = [
      { id: 'a', urgency: 0.9, impact: 0.9, reversibility: 0.1, evidenceLevel: 0.8 },
    ];
    const frozen = Object.freeze([...items]);
    const result = svc.rank(frozen);
    expect(result.ranked).toHaveLength(1);
    expect(items[0]!.urgency).toBe(0.9);
  });

  /** ── clamp behavior ── */

  it('clamps negative urgency to 0', () => {
    const items: AttentionItem[] = [
      { id: 'neg', urgency: -0.5, impact: 0.9, reversibility: 0.1, evidenceLevel: 0.5 },
    ];
    const result = svc.rank(items);
    expect(result.silent).toBe(true);
  });

  it('clamps impact above 1 to 1', () => {
    const items: AttentionItem[] = [
      { id: 'over', urgency: 0.9, impact: 1.5, reversibility: 0.0, evidenceLevel: 0.5 },
    ];
    const result = svc.rank(items);
    expect(result.ranked[0]?.score).toBeCloseTo(0.9);
  });

  /** ── mixed tiers batch ── */

  it('handles a batch spanning all four tiers', () => {
    const items: AttentionItem[] = [
      { id: 'urgent', urgency: 1.0, impact: 1.0, reversibility: 0.0, evidenceLevel: 0.9 },
      { id: 'week', urgency: 0.8, impact: 0.7, reversibility: 0.2, evidenceLevel: 0.7 },
      { id: 'know', urgency: 0.5, impact: 0.5, reversibility: 0.3, evidenceLevel: 0.5 },
      { id: 'archive', urgency: 0.2, impact: 0.3, reversibility: 0.4, evidenceLevel: 0.2 },
    ];
    const result = svc.rank(items);
    expect(result.ranked).toHaveLength(4);
    expect(result.ranked[0]!.tier).toBe('AGORA');
    expect(result.ranked[1]!.tier).toBe('ESTA_SEMANA');
    expect(result.ranked[2]!.tier).toBe('PARA_SABER');
    expect(result.ranked[3]!.tier).toBe('ARQUIVO');
  });

  /** ── evidenceLevel is preserved but does not affect score ── */

  it('preserves evidenceLevel as metadata without affecting score', () => {
    const high: AttentionItem[] = [
      { id: 'he', urgency: 0.9, impact: 0.9, reversibility: 0.0, evidenceLevel: 1.0 },
    ];
    const low: AttentionItem[] = [
      { id: 'le', urgency: 0.9, impact: 0.9, reversibility: 0.0, evidenceLevel: 0.1 },
    ];
    const r1 = svc.rank(high);
    const r2 = svc.rank(low);
    expect(r1.ranked[0]!.score).toBe(r2.ranked[0]!.score);
    expect(r1.ranked[0]!.evidenceLevel).toBe(1.0);
    expect(r2.ranked[0]!.evidenceLevel).toBe(0.1);
  });
});
