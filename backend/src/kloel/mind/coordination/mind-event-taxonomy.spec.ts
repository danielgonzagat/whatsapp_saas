import type { BrainEventName, MindEventName } from './mind-event-taxonomy';
import {
  BRAIN_EVENT_TAXONOMY,
  MIND_EVENT_ALIASES,
  expandEventNameAliases,
  expandEventNameAliasesAll,
  resolveCanonicalEventName,
} from './mind-event-taxonomy';

describe('mind-event-taxonomy — MIND_EVENT_ALIASES helpers', () => {
  describe('MIND_EVENT_ALIASES table integrity', () => {
    it('exposes the four ADR-0013 §4 legacy→canonical mappings', () => {
      expect(MIND_EVENT_ALIASES).toEqual({
        'message.received': 'mind.message.received',
        'capability.executed': 'mind.action.executed',
        'product.created': 'mind.product.observed',
        'plan.created': 'mind.plan.observed',
      });
    });

    it('canonical names are members of BRAIN_EVENT_TAXONOMY', () => {
      for (const canonical of Object.values(MIND_EVENT_ALIASES)) {
        expect(BRAIN_EVENT_TAXONOMY).toContain(canonical);
      }
    });

    it('legacy names are also still members of BRAIN_EVENT_TAXONOMY during cutover', () => {
      for (const legacy of Object.keys(MIND_EVENT_ALIASES)) {
        expect(BRAIN_EVENT_TAXONOMY).toContain(legacy);
      }
    });
  });

  describe('resolveCanonicalEventName', () => {
    it('returns the canonical mind.* name for each legacy key', () => {
      expect(resolveCanonicalEventName('product.created')).toBe('mind.product.observed');
      expect(resolveCanonicalEventName('plan.created')).toBe('mind.plan.observed');
      expect(resolveCanonicalEventName('message.received')).toBe('mind.message.received');
      expect(resolveCanonicalEventName('capability.executed')).toBe('mind.action.executed');
    });

    it('is idempotent on the canonical name itself', () => {
      expect(resolveCanonicalEventName('mind.product.observed')).toBe('mind.product.observed');
      expect(resolveCanonicalEventName('mind.plan.observed')).toBe('mind.plan.observed');
    });

    it('returns unrelated event names unchanged', () => {
      expect(resolveCanonicalEventName('sale.created')).toBe('sale.created');
      expect(resolveCanonicalEventName('checkout.paid')).toBe('checkout.paid');
    });
  });

  describe('expandEventNameAliases', () => {
    it('expands a legacy name to [legacy, canonical]', () => {
      expect(expandEventNameAliases('product.created')).toEqual([
        'product.created',
        'mind.product.observed',
      ]);
      expect(expandEventNameAliases('plan.created')).toEqual([
        'plan.created',
        'mind.plan.observed',
      ]);
    });

    it('expands a canonical name to [canonical, legacy]', () => {
      expect(expandEventNameAliases('mind.product.observed')).toEqual([
        'mind.product.observed',
        'product.created',
      ]);
      expect(expandEventNameAliases('mind.plan.observed')).toEqual([
        'mind.plan.observed',
        'plan.created',
      ]);
    });

    it('returns the input as the only entry for unrelated names', () => {
      expect(expandEventNameAliases('sale.created')).toEqual(['sale.created']);
      expect(expandEventNameAliases('checkout.paid')).toEqual(['checkout.paid']);
    });

    it('preserves the input at index 0 for ordering invariants', () => {
      expect(expandEventNameAliases('product.created')[0]).toBe('product.created');
      expect(expandEventNameAliases('mind.product.observed')[0]).toBe('mind.product.observed');
      expect(expandEventNameAliases('sale.created')[0]).toBe('sale.created');
    });
  });

  describe('expandEventNameAliasesAll', () => {
    it('expands every legacy name to its dual-spelling form', () => {
      const result = expandEventNameAliasesAll(['product.created', 'plan.created']);
      expect(result).toEqual([
        'product.created',
        'mind.product.observed',
        'plan.created',
        'mind.plan.observed',
      ]);
    });

    it('expands canonical names to include their legacy counterpart', () => {
      const result = expandEventNameAliasesAll(['mind.product.observed']);
      expect(result).toEqual(['mind.product.observed', 'product.created']);
    });

    it('does not double-emit when input already contains both spellings', () => {
      const result = expandEventNameAliasesAll(['product.created', 'mind.product.observed']);
      expect(result).toEqual(['product.created', 'mind.product.observed']);
    });

    it('preserves unrelated names alongside expansions', () => {
      const result = expandEventNameAliasesAll(['sale.created', 'product.created']);
      expect(result).toEqual(['sale.created', 'product.created', 'mind.product.observed']);
    });

    it('is stable for an empty input array', () => {
      expect(expandEventNameAliasesAll([])).toEqual([]);
    });
  });

  describe('MindEventName ↔ BrainEventName equivalence (ADR-0013 brain → mind sweep)', () => {
    it('MindEventName and BrainEventName are the same union type', () => {
      // Compile-time proof: assign both ways without type errors.
      // If this file compiles, BrainEventName = MindEventName is a true alias.
      const a: MindEventName = 'sale.created';
      const b: BrainEventName = a;
      const c: MindEventName = b;
      expect(c).toBe('sale.created');
    });

    it('both accept every member of BRAIN_EVENT_TAXONOMY', () => {
      const member = BRAIN_EVENT_TAXONOMY[0];
      const a: MindEventName = member;
      const b: BrainEventName = member;
      const c: BrainEventName = a;
      const d: MindEventName = b;
      expect(c).toBe(member);
      expect(d).toBe(member);
    });
  });
});
