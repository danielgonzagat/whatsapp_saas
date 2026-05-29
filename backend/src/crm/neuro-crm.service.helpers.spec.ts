import type { AnalysisResult } from './neuro-crm.types';
import {
  assignClusters,
  buildClusterPoints,
  clusterContactProjections,
  decideNextBestAction,
  deriveSentimentChangeInsight,
  detectObjectionKind,
  hoursSinceLastMessage,
  mergeNeuroCrmCustomFields,
  runKMeans,
  sanitizeCustomFieldsBase,
  type ContactProjection,
  type NeuroCrmCustomFieldsPatch,
} from './neuro-crm.service.helpers';

const NOW = new Date('2026-05-28T12:00:00.000Z').getTime();

describe('neuro-crm.service.helpers', () => {
  describe('hoursSinceLastMessage', () => {
    it('returns 999 when no message exists', () => {
      expect(hoursSinceLastMessage(null, NOW)).toBe(999);
      expect(hoursSinceLastMessage(undefined, NOW)).toBe(999);
    });

    it('computes hours between message and reference', () => {
      const two = new Date(NOW - 2 * 3_600_000);
      expect(hoursSinceLastMessage(two, NOW)).toBeCloseTo(2, 5);
    });
  });

  describe('decideNextBestAction', () => {
    it('returns CTA_PRECO for a hot lead with recent activity', () => {
      const result = decideNextBestAction({
        leadScore: 90,
        sentiment: 'POSITIVE',
        purchaseProbability: 'HIGH',
        lastMessageAt: new Date(NOW - 2 * 3_600_000),
        now: NOW,
      });
      expect(result.action).toBe('CTA_PRECO');
      expect(result.reason).toBe('lead quente');
      expect(result.lastMessageAtHours).toBe(2);
    });

    it('returns CLOSE_NOW for a hot lead that went silent', () => {
      const result = decideNextBestAction({
        leadScore: 50,
        sentiment: 'NEUTRAL',
        purchaseProbability: 'VERY_HIGH',
        lastMessageAt: new Date(NOW - 13 * 3_600_000),
        now: NOW,
      });
      expect(result.action).toBe('CLOSE_NOW');
      expect(result.reason).toBe('lead quente');
    });

    it('handles a negative sentiment lead with objection action', () => {
      const result = decideNextBestAction({
        leadScore: 40,
        sentiment: 'NEGATIVE',
        purchaseProbability: 'LOW',
        lastMessageAt: new Date(NOW - 1 * 3_600_000),
        now: NOW,
      });
      expect(result.action).toBe('TRATAR_OBJECAO');
      expect(result.reason).toBe('sentimento negativo');
    });

    it('returns REATIVAR after 48 hours of silence', () => {
      const result = decideNextBestAction({
        leadScore: 30,
        sentiment: 'NEUTRAL',
        purchaseProbability: 'LOW',
        lastMessageAt: new Date(NOW - 60 * 3_600_000),
        now: NOW,
      });
      expect(result.action).toBe('REATIVAR');
      expect(result.reason).toBe('silêncio longo');
    });

    it('defaults to FOLLOW_UP_SOFT for cold contacts without recent activity', () => {
      const result = decideNextBestAction({
        leadScore: 10,
        sentiment: 'NEUTRAL',
        purchaseProbability: 'LOW',
        lastMessageAt: new Date(NOW - 5 * 3_600_000),
        now: NOW,
      });
      expect(result.action).toBe('FOLLOW_UP_SOFT');
      expect(result.reason).toBe('contato sem atividade recente');
    });

    it('treats null leadScore as 0 when probability is also low', () => {
      const result = decideNextBestAction({
        leadScore: null,
        sentiment: null,
        purchaseProbability: null,
        lastMessageAt: null,
        now: NOW,
      });
      expect(result.action).toBe('REATIVAR');
      expect(result.lastMessageAtHours).toBe(999);
    });
  });

  describe('buildClusterPoints', () => {
    it('projects contacts onto (leadScore, hours-since-update)', () => {
      const contacts: ContactProjection[] = [
        {
          id: 'c1',
          name: 'Alice',
          phone: '5511',
          leadScore: 80,
          updatedAt: new Date(NOW - 4 * 3_600_000),
        },
        {
          id: 'c2',
          name: null,
          phone: '5512',
          leadScore: null,
          updatedAt: new Date(NOW),
        },
      ];
      const points = buildClusterPoints(contacts, NOW);
      expect(points).toHaveLength(2);
      const first = points[0];
      const second = points[1];
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      if (!first || !second) {
        return;
      }
      expect(first.x).toBe(80);
      expect(first.y).toBeCloseTo(4, 5);
      expect(first.contact.leadScore).toBe(80);
      expect(second.x).toBe(0);
      expect(second.y).toBeCloseTo(0, 5);
      expect(second.contact.leadScore).toBe(0);
    });
  });

  describe('runKMeans', () => {
    it('returns no centroids when there are no points', () => {
      expect(runKMeans([])).toEqual([]);
    });

    it('clamps k to the number of points when fewer than desired', () => {
      const contacts: ContactProjection[] = [
        {
          id: 'c1',
          name: null,
          phone: '1',
          leadScore: 90,
          updatedAt: new Date(NOW),
        },
      ];
      const points = buildClusterPoints(contacts, NOW);
      const centroids = runKMeans(points, 5);
      expect(centroids).toHaveLength(1);
      expect(centroids[0]?.x).toBe(90);
    });

    it('converges to distinct centroids for well-separated points', () => {
      const points = buildClusterPoints(
        [
          { id: 'a', name: null, phone: '1', leadScore: 10, updatedAt: new Date(NOW) },
          { id: 'b', name: null, phone: '2', leadScore: 12, updatedAt: new Date(NOW) },
          { id: 'c', name: null, phone: '3', leadScore: 80, updatedAt: new Date(NOW) },
          { id: 'd', name: null, phone: '4', leadScore: 82, updatedAt: new Date(NOW) },
        ],
        NOW,
      );
      const centroids = runKMeans(points, 2, 20);
      expect(centroids).toHaveLength(2);
      const xs = centroids.map((c) => c.x).sort((a, b) => a - b);
      expect(xs[0]).toBeLessThan(20);
      expect(xs[1]).toBeGreaterThan(70);
    });
  });

  describe('assignClusters', () => {
    it('maps points to the nearest centroid index', () => {
      const points = buildClusterPoints(
        [
          { id: 'a', name: null, phone: '1', leadScore: 5, updatedAt: new Date(NOW) },
          { id: 'b', name: null, phone: '2', leadScore: 95, updatedAt: new Date(NOW) },
        ],
        NOW,
      );
      const centroids = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ];
      const assignments = assignClusters(points, centroids);
      expect(assignments[0]?.cluster).toBe(0);
      expect(assignments[1]?.cluster).toBe(1);
    });
  });

  describe('clusterContactProjections', () => {
    it('produces a centroids+clusters envelope from raw contact rows', () => {
      const contacts: ContactProjection[] = [
        { id: 'a', name: null, phone: '1', leadScore: 5, updatedAt: new Date(NOW) },
        { id: 'b', name: null, phone: '2', leadScore: 95, updatedAt: new Date(NOW) },
      ];
      const result = clusterContactProjections(contacts, 2, 10, NOW);
      expect(result.centroids).toHaveLength(2);
      expect(result.clusters).toHaveLength(2);
      expect(result.clusters.map((c) => c.contact.id).sort()).toEqual(['a', 'b']);
    });
  });

  describe('sanitizeCustomFieldsBase', () => {
    it('passes through objects', () => {
      expect(sanitizeCustomFieldsBase({ existing: true })).toEqual({ existing: true });
    });

    it('rejects arrays', () => {
      expect(sanitizeCustomFieldsBase([1, 2, 3])).toEqual({});
    });

    it('rejects primitives and null', () => {
      expect(sanitizeCustomFieldsBase(null)).toEqual({});
      expect(sanitizeCustomFieldsBase(undefined)).toEqual({});
      expect(sanitizeCustomFieldsBase('str')).toEqual({});
      expect(sanitizeCustomFieldsBase(42)).toEqual({});
    });
  });

  describe('mergeNeuroCrmCustomFields', () => {
    const patch: NeuroCrmCustomFieldsPatch = {
      leadScore: 80,
      purchaseProbability: 'HIGH',
      purchaseProbabilityScore: 0.85,
      sentiment: 'POSITIVE',
      intent: 'BUY',
      summary: 's',
      nextBestAction: 'CTA_PRECO',
      cluster: 'VIP',
      reasons: ['buying_signal_detected'],
    };
    const FROZEN = new Date('2026-05-28T15:30:00.000Z');

    it('preserves unrelated existing fields and stamps an ISO timestamp', () => {
      const merged = mergeNeuroCrmCustomFields(
        { manualNote: 'keep me', oldCluster: 'Lost' },
        patch,
        FROZEN,
      );
      expect(merged).toEqual({
        manualNote: 'keep me',
        oldCluster: 'Lost',
        purchaseProbabilityScore: 0.85,
        probabilityReasons: ['buying_signal_detected'],
        intent: 'BUY',
        cluster: 'VIP',
        lastNeuroCrmAnalysisAt: FROZEN.toISOString(),
      });
    });

    it('falls back to defaults when reasons/cluster missing', () => {
      const lean: NeuroCrmCustomFieldsPatch = {
        leadScore: 30,
        purchaseProbability: 'LOW',
        purchaseProbabilityScore: 0.1,
        sentiment: 'NEUTRAL',
        intent: 'INFO',
        summary: 's',
        nextBestAction: 'FOLLOW_UP_SOFT',
      };
      const merged = mergeNeuroCrmCustomFields(null, lean, FROZEN);
      expect(merged).toMatchObject({
        probabilityReasons: [],
        cluster: null,
        intent: 'INFO',
        lastNeuroCrmAnalysisAt: FROZEN.toISOString(),
      });
    });

    it('discards non-object existing customFields', () => {
      const merged = mergeNeuroCrmCustomFields([1, 2, 3], patch, FROZEN);
      expect(merged).not.toHaveProperty('0');
      expect(merged).toMatchObject({ intent: 'BUY' });
    });
  });

  describe('deriveSentimentChangeInsight', () => {
    const baseResult = (
      sentiment: AnalysisResult['sentiment'],
    ): Pick<AnalysisResult, 'sentiment'> => ({
      sentiment,
    });

    it('returns null when sentiment did not change', () => {
      expect(deriveSentimentChangeInsight('POSITIVE', baseResult('POSITIVE'))).toBeNull();
    });

    it('treats missing previous sentiment as NEUTRAL', () => {
      const insight = deriveSentimentChangeInsight(null, baseResult('POSITIVE'));
      expect(insight).toEqual({
        description: 'Sentimento melhorou de NEUTRAL para POSITIVE',
        scoreChange: 5,
      });
    });

    it('reports an improvement to POSITIVE with +5 score', () => {
      const insight = deriveSentimentChangeInsight('NEUTRAL', baseResult('POSITIVE'));
      expect(insight).toEqual({
        description: 'Sentimento melhorou de NEUTRAL para POSITIVE',
        scoreChange: 5,
      });
    });

    it('reports a degradation to NEGATIVE with -5 score', () => {
      const insight = deriveSentimentChangeInsight('POSITIVE', baseResult('NEGATIVE'));
      expect(insight).toEqual({
        description: 'Sentimento piorou de POSITIVE para NEGATIVE',
        scoreChange: -5,
      });
    });

    it('reports a neutralisation with zero score change', () => {
      const insight = deriveSentimentChangeInsight('NEGATIVE', baseResult('NEUTRAL'));
      expect(insight).toEqual({
        description: 'Sentimento neutralizou para NEUTRAL',
        scoreChange: 0,
      });
    });
  });

  describe('detectObjectionKind', () => {
    it('returns complaint for COMPLAINT intent regardless of sentiment', () => {
      expect(detectObjectionKind({ intent: 'COMPLAINT', sentiment: 'POSITIVE' })).toBe('complaint');
    });

    it('returns negative_sentiment for non-complaint negative sentiment', () => {
      expect(detectObjectionKind({ intent: 'INFO', sentiment: 'NEGATIVE' })).toBe(
        'negative_sentiment',
      );
    });

    it('returns null when neither signal is present', () => {
      expect(detectObjectionKind({ intent: 'BUY', sentiment: 'POSITIVE' })).toBeNull();
    });
  });
});
