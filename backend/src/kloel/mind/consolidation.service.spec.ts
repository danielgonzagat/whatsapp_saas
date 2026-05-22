import { ConsolidationService, WorkingMemoryItem } from './consolidation.service';
import { SpineEventRef } from './mind.types';

function makeEvent(overrides: Partial<SpineEventRef> = {}): SpineEventRef {
  return {
    eventId: 'evt_001',
    eventName: 'commerce.payment.approved',
    occurredAt: new Date().toISOString(),
    truthMode: 'observed',
    ...overrides,
  };
}

function makeWorkingItem(overrides: Partial<WorkingMemoryItem> = {}): WorkingMemoryItem {
  return {
    itemId: 'wm_001',
    kind: 'fact',
    content: 'Lead responded positively to offer',
    addedAt: new Date().toISOString(),
    relatedEventIds: ['evt_001', 'evt_002'],
    ...overrides,
  };
}

describe('ConsolidationService', () => {
  let service: ConsolidationService;

  beforeEach(() => {
    service = new ConsolidationService();
  });

  describe('runCycle', () => {
    it('returns empty cycle for empty working memory', () => {
      const result = service.runCycle({
        workingMemory: [],
        recentEvents: [],
      });
      expect(result.mode).toBe('dry_run');
      expect(result.workingItemsConsidered).toBe(0);
      expect(result.episodicProposals).toEqual([]);
      expect(result.consolidatedProposals).toEqual([]);
    });

    it('produces episodic proposals from working memory items with related events', () => {
      const events = [
        makeEvent({
          eventId: 'evt_001',
          eventName: 'commerce.payment.approved',
          valence: 'positive',
        }),
        makeEvent({
          eventId: 'evt_002',
          eventName: 'commerce.payment.approved',
          valence: 'positive',
        }),
      ];
      const wm = [
        makeWorkingItem({
          itemId: 'wm_1',
          content: 'Payment approved for lead X',
          relatedEventIds: ['evt_001', 'evt_002'],
        }),
      ];
      const result = service.runCycle({
        workingMemory: wm,
        recentEvents: events,
      });
      expect(result.episodicProposals).toHaveLength(1);
      expect(result.episodicProposals[0]!.summary).toBe('Payment approved for lead X');
      expect(result.episodicProposals[0]!.valenceMix.positive).toBe(2);
    });

    it('skips working memory items with fewer than 2 related event IDs', () => {
      const events = [makeEvent({ eventId: 'evt_001', eventName: 'commerce.payment.approved' })];
      const wm = [
        makeWorkingItem({
          itemId: 'wm_1',
          content: 'Single event item',
          relatedEventIds: ['evt_001'],
        }),
      ];
      const result = service.runCycle({
        workingMemory: wm,
        recentEvents: events,
      });
      expect(result.episodicProposals).toHaveLength(0);
    });

    it('skips working memory items whose related events are not in the event list', () => {
      const wm = [
        makeWorkingItem({
          itemId: 'wm_1',
          content: 'Orphan item',
          relatedEventIds: ['evt_missing_1', 'evt_missing_2'],
        }),
      ];
      const result = service.runCycle({
        workingMemory: wm,
        recentEvents: [],
      });
      // relatedEventIds.length >= 2 but none matched → filtered out
      expect(result.workingItemsConsidered).toBe(1);
      expect(result.episodicProposals).toHaveLength(0);
    });

    it('produces consolidated proposals when 3+ episodes share a pattern', () => {
      const events = [
        makeEvent({
          eventId: 'evt_1',
          eventName: 'commerce.payment.approved',
          valence: 'positive',
        }),
        makeEvent({
          eventId: 'evt_2',
          eventName: 'commerce.payment.approved',
          valence: 'positive',
        }),
        makeEvent({
          eventId: 'evt_3',
          eventName: 'commerce.payment.declined',
          valence: 'negative',
        }),
        makeEvent({
          eventId: 'evt_4',
          eventName: 'commerce.payment.declined',
          valence: 'negative',
        }),
        makeEvent({
          eventId: 'evt_5',
          eventName: 'commerce.payment.approved',
          valence: 'positive',
        }),
        makeEvent({
          eventId: 'evt_6',
          eventName: 'commerce.payment.approved',
          valence: 'positive',
        }),
      ];
      const wm = [
        makeWorkingItem({
          itemId: 'wm_1',
          content: 'Payment processed for customer A',
          relatedEventIds: ['evt_1', 'evt_2'],
        }),
        makeWorkingItem({
          itemId: 'wm_2',
          content: 'Payment processed for customer B',
          relatedEventIds: ['evt_3', 'evt_4'],
        }),
        makeWorkingItem({
          itemId: 'wm_3',
          content: 'Payment processed for customer C',
          relatedEventIds: ['evt_5', 'evt_6'],
        }),
      ];
      const result = service.runCycle({
        workingMemory: wm,
        recentEvents: events,
      });
      // All three have pattern "payment_processed_for" → consolidated
      expect(result.episodicProposals).toHaveLength(3);
      expect(result.consolidatedProposals).toHaveLength(1);
      expect(result.consolidatedProposals[0]!.summary).toContain('payment_processed_for');
    });

    it('does not produce consolidated proposals when fewer than 3 episodes share a pattern', () => {
      const events = [
        makeEvent({
          eventId: 'evt_1',
          eventName: 'commerce.payment.approved',
          valence: 'positive',
        }),
        makeEvent({
          eventId: 'evt_2',
          eventName: 'commerce.payment.approved',
          valence: 'positive',
        }),
        makeEvent({
          eventId: 'evt_3',
          eventName: 'commerce.payment.approved',
          valence: 'positive',
        }),
        makeEvent({
          eventId: 'evt_4',
          eventName: 'commerce.payment.approved',
          valence: 'positive',
        }),
      ];
      const wm = [
        makeWorkingItem({
          itemId: 'wm_1',
          content: 'Payment processed for A',
          relatedEventIds: ['evt_1', 'evt_2'],
        }),
        makeWorkingItem({
          itemId: 'wm_2',
          content: 'Different summary text here',
          relatedEventIds: ['evt_3', 'evt_4'],
        }),
      ];
      const result = service.runCycle({
        workingMemory: wm,
        recentEvents: events,
      });
      expect(result.episodicProposals).toHaveLength(2);
      expect(result.consolidatedProposals).toHaveLength(0);
    });

    it('uses dry_run mode by default', () => {
      const result = service.runCycle({
        workingMemory: [],
        recentEvents: [],
      });
      expect(result.mode).toBe('dry_run');
    });

    it('accepts real mode', () => {
      const events = [
        makeEvent({ eventId: 'evt_1', valence: 'positive' }),
        makeEvent({ eventId: 'evt_2', valence: 'positive' }),
      ];
      const wm = [
        makeWorkingItem({
          itemId: 'wm_1',
          content: 'Test item',
          relatedEventIds: ['evt_1', 'evt_2'],
        }),
      ];
      const result = service.runCycle({
        workingMemory: wm,
        recentEvents: events,
        mode: 'real',
      });
      expect(result.mode).toBe('real');
      expect(result.episodicProposals).toHaveLength(1);
    });

    it('uses custom nowIso for cycleAt', () => {
      const customIso = '2025-01-15T12:00:00.000Z';
      const result = service.runCycle({
        workingMemory: [],
        recentEvents: [],
        nowIso: customIso,
      });
      expect(result.cycleAt).toBe(customIso);
    });

    it('defaults nowIso to current time', () => {
      const before = new Date().toISOString();
      const result = service.runCycle({
        workingMemory: [],
        recentEvents: [],
      });
      expect(result.cycleAt).toBeDefined();
      expect(result.cycleAt >= before).toBe(true);
    });

    it('computes valenceMix correctly for mixed-valence events', () => {
      const events = [
        makeEvent({ eventId: 'evt_1', valence: 'positive' }),
        makeEvent({ eventId: 'evt_2', valence: 'negative' }),
        makeEvent({ eventId: 'evt_3', valence: 'neutral' }),
        makeEvent({ eventId: 'evt_4', valence: 'ambiguous' }),
      ];
      const wm = [
        makeWorkingItem({
          itemId: 'wm_1',
          content: 'Mixed valence item',
          relatedEventIds: ['evt_1', 'evt_2', 'evt_3', 'evt_4'],
        }),
      ];
      const result = service.runCycle({
        workingMemory: wm,
        recentEvents: events,
      });
      const mix = result.episodicProposals[0]!.valenceMix;
      expect(mix.positive).toBe(1);
      expect(mix.negative).toBe(1);
      expect(mix.neutral).toBe(1);
      expect(mix.ambiguous).toBe(1);
    });

    it('defaults missing valence to neutral', () => {
      const events = [
        makeEvent({ eventId: 'evt_1', valence: undefined }),
        makeEvent({ eventId: 'evt_2', valence: undefined }),
      ];
      const wm = [
        makeWorkingItem({
          itemId: 'wm_1',
          content: 'Unknown valence item',
          relatedEventIds: ['evt_1', 'evt_2'],
        }),
      ];
      const result = service.runCycle({
        workingMemory: wm,
        recentEvents: events,
      });
      expect(result.episodicProposals[0]!.valenceMix.neutral).toBe(2);
    });

    it('counts workingItemsConsidered correctly', () => {
      const wm = [
        makeWorkingItem({ itemId: 'wm_1', relatedEventIds: ['evt_1'] }),
        makeWorkingItem({ itemId: 'wm_2', relatedEventIds: ['evt_2'] }),
        makeWorkingItem({ itemId: 'wm_3', relatedEventIds: ['evt_1', 'evt_2'] }),
      ];
      const result = service.runCycle({
        workingMemory: wm,
        recentEvents: [makeEvent({ eventId: 'evt_1' }), makeEvent({ eventId: 'evt_2' })],
      });
      expect(result.workingItemsConsidered).toBe(3);
    });
  });
});
