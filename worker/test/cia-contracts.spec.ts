import { describe, expect, it } from 'vitest';
import { evaluateCiaCandidate, planCiaActions } from '../processors/cia/brain';
import type { CiaDecisionBatch } from '../processors/cia/brain';
import {
  assertCiaExhaustion,
  assertCiaGuarantees,
  buildCiaExhaustionReport,
  buildCiaGuaranteeReport,
} from '../processors/cia/contracts';
import { buildSeedCognitiveState } from '../processors/cia/cognitive-state';
import type { CiaCandidate, CiaCluster, CiaWorkspaceState } from '../processors/cia/build-state';
import type { DemandStrategy } from '../providers/commercial-intelligence.types';

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRandomState(seed: number, candidateCount: number): CiaWorkspaceState {
  const rand = mulberry32(seed);
  const candidates: CiaCandidate[] = [];
  const clusters: Record<CiaCluster, CiaCandidate[]> = {
    HOT: [],
    PAYMENT: [],
    WARM: [],
    COLD: [],
  };

  for (let index = 0; index < candidateCount; index += 1) {
    const roll = rand();
    const cluster: CiaCluster =
      roll < 0.2 ? 'PAYMENT' : roll < 0.45 ? 'HOT' : roll < 0.7 ? 'WARM' : 'COLD';
    const type =
      cluster === 'PAYMENT' ? 'PAYMENT_RECOVERY' : roll < 0.6 ? 'RESPOND' : 'FOLLOWUP_SOFT';
    const lastMessageText =
      cluster === 'PAYMENT'
        ? 'me manda o pix novamente'
        : cluster === 'HOT'
          ? 'quanto custa isso?'
          : 'ainda estou pensando';
    const demandLane: 'HOT' | 'WARM' | 'COLD' =
      cluster === 'COLD' ? 'COLD' : cluster === 'WARM' ? 'WARM' : 'HOT';
    const demandStrategy: DemandStrategy =
      cluster === 'PAYMENT' ? 'RECOVER_PAYMENT' : cluster === 'HOT' ? 'PUSH' : 'NURTURE';
    const unreadCount = Math.floor(rand() * 4);
    const silenceMinutes = Math.floor(rand() * 2000);
    const priority = Number((rand() * 100 + (cluster === 'PAYMENT' ? 50 : 0)).toFixed(3));
    const contactId = `contact-${seed}-${index}`;
    const conversationId = `conv-${seed}-${index}`;
    const phone = `55${seed}${index}`.slice(0, 13);

    const candidate: CiaCandidate = {
      conversationId,
      contactId,
      phone,
      contactName: `Contato ${index}`,
      unreadCount,
      pending: false,
      lastMessageText,
      priority,
      cluster,
      suggestedAction: type,
      demandState: {
        heatScore: rand(),
        fatigueScore: rand() * 0.3,
        conversionOdds: rand(),
        abandonmentRisk: rand() * 0.2,
        lane: demandLane,
        strategy: demandStrategy,
        attentionScore: rand(),
      },
      silenceMinutes,
      cognitiveState: buildSeedCognitiveState({
        conversationId,
        contactId,
        phone,
        lastMessageText,
        unreadCount,
        lastMessageAt: new Date(Date.now() - silenceMinutes * 60_000),
        leadScore: Math.floor(rand() * 100),
      }),
    };
    candidates.push(candidate);
    clusters[cluster].push(candidate);
  }

  return {
    workspaceId: `ws-${seed}`,
    generatedAt: new Date().toISOString(),
    snapshot: {
      openBacklog: candidateCount,
      hotLeadCount: clusters.HOT.length,
      pendingPaymentCount: clusters.PAYMENT.length,
      approvedSalesCount: 0,
      approvedSalesAmount: 0,
      avgResponseMinutes: 0,
      dominantObjection: null,
      topProductKey: null,
      growthRiskLevel: 'MEDIUM' as const,
      attentionBudget: {
        hot: clusters.HOT.length,
        pendingPayments: clusters.PAYMENT.length,
        support: 0,
        nurture: 0,
        cold: 0,
      },
      generatedAt: new Date().toISOString(),
    },
    marketSignals: [],
    candidates: candidates.sort((a, b) => b.priority - a.priority),
    clusters,
  };
}

describe('cia-contracts', () => {
  it('proves core invariants across many deterministic random cycles', { timeout: 20000 }, () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const state = buildRandomState(seed, 120);
      const batch = planCiaActions(state, { maxActionsPerCycle: 5 });
      const report = buildCiaGuaranteeReport(state, batch, 5);
      const exhaustionReport = buildCiaExhaustionReport(state, batch, 5);

      expect(() => assertCiaGuarantees(report)).not.toThrow();
      expect(() => assertCiaExhaustion(exhaustionReport)).not.toThrow();
      expect(report.guaranteed).toBe(true);
      expect(exhaustionReport.exhaustive).toBe(true);
      expect(exhaustionReport.silentCount).toBe(0);
    }
  });

  it('keeps guarantees under scale with 1000 simulated contacts', () => {
    const state = buildRandomState(999, 1000);
    const batch = planCiaActions(state, { maxActionsPerCycle: 5 });
    const report = buildCiaGuaranteeReport(state, batch, 5);
    const exhaustionReport = buildCiaExhaustionReport(state, batch, 5);

    expect(report.details.candidateCount).toBe(1000);
    expect(report.details.selectedCount).toBeLessThanOrEqual(5);
    expect(report.guaranteed).toBe(true);
    expect(exhaustionReport.details.candidateCount).toBe(1000);
    expect(exhaustionReport.exhaustive).toBe(true);
  });

  it('fails loudly when a malformed batch violates the contract', () => {
    const state = buildRandomState(7, 10);
    const batch = {
      actions: [
        {
          type: 'RESPOND',
          cluster: 'HOT',
          contactId: 'dup',
          conversationId: 'conv-1',
          priority: 1,
          reason: 'x',
          lastMessageText: 'x',
        },
        {
          type: 'RESPOND',
          cluster: 'HOT',
          contactId: 'dup',
          conversationId: 'conv-2',
          priority: 2,
          reason: 'y',
          lastMessageText: 'y',
        },
      ],
      ignoredCount: 0,
      summary: '',
    };

    const report = buildCiaGuaranteeReport(state, batch as unknown as CiaDecisionBatch, 5);

    expect(report.guaranteed).toBe(false);
    expect(() => assertCiaGuarantees(report)).toThrow(/cia_contract_violation/);
  });

  it('fails loudly when a selected action does not belong to the candidate universe', () => {
    const state = buildRandomState(17, 20);
    const batch = {
      actions: [
        {
          type: 'RESPOND',
          cluster: 'HOT',
          contactId: 'ghost-contact',
          conversationId: 'ghost-conversation',
          priority: 0.99,
          reason: 'ghost',
          lastMessageText: 'ghost',
          confidence: 0.9,
          riskScore: 0.1,
          rewardScore: 0.8,
          governor: 'EXECUTE',
          cognitiveState: state.candidates[0].cognitiveState,
          demandState: state.candidates[0].demandState,
          recommendedBy: 'nba_engine',
        },
      ],
      ignoredCount: 0,
      summary: 'Vou agir em um fantasma.',
    };

    const exhaustionReport = buildCiaExhaustionReport(
      state,
      batch as unknown as CiaDecisionBatch,
      5,
    );

    expect(exhaustionReport.exhaustive).toBe(false);
    expect(exhaustionReport.orphanSelectedCount).toBe(1);
    expect(() => assertCiaExhaustion(exhaustionReport)).toThrow(/cia_exhaustion_violation/);
  });

  it('keeps selected conversation action and tactic optimal for 50 deterministic cycles of the current formal universe', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const state = buildRandomState(seed * 17, 25);

      for (const candidate of state.candidates) {
        const decision = evaluateCiaCandidate(candidate, null);

        expect(decision.selectedActionRank).toBe(1);
        expect(decision.betterActionCount).toBe(0);
        expect(decision.conversationActionUniverse[0]?.selected).toBe(true);
        expect(decision.conversationActionUniverse[0]?.type).toBe(decision.type);

        if (decision.conversationTactic) {
          expect(decision.selectedTacticRank).toBe(1);
          expect(decision.betterTacticCount).toBe(0);
          expect(decision.conversationTacticUniverse[0]?.tactic).toBe(decision.conversationTactic);
        }
      }
    }
  });
});
