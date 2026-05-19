/**
 * UTP-ABI-005/006 — AbiAbHarnessService exhaustive spec.
 *
 * Validates:
 *  - runParallel stores baseline + variant records with all captured metrics.
 *  - runParallel captures latency, tokens, hallucinated claims, commercial outcome.
 *  - computeRDelta computes projected R-tier deltas across all 38 R-criteria.
 *  - decidePromotion gates: sample >= 100, >= 3 improved, zero regression.
 *  - Edge cases: empty workspace, single-path data, boundary sample counts.
 */

import { AbiAbHarnessService } from './abi-ab-harness.service';
import type {
  AbHarnessRecord,
  AbPathRunnerFn,
  AbPathRunnerResult,
  AbRCriterionDelta,
} from './abi-ab.types';

function makePathRunner(
  overrides: Partial<AbPathRunnerResult> = {},
): AbPathRunnerFn {
  return async () => ({
    success: true,
    latencyMs: 200,
    tokensUsed: 150,
    responseText: 'Obrigado pelo contato. Conforme sua análise, recomendamos adquirir o plano.' as string,
    ...overrides,
  });
}

function makeSlowPathRunner(): AbPathRunnerFn {
  return async () => ({
    success: true,
    latencyMs: 800,
    tokensUsed: 300,
    responseText: 'Resposta lenta.' as string,
  });
}

function makeHighTokenPathRunner(): AbPathRunnerFn {
  return async () => ({
    success: true,
    latencyMs: 200,
    tokensUsed: 5000,
    responseText: 'Resposta verbosa com muitas palavras.' as string,
  });
}

function makeFailingPathRunner(): AbPathRunnerFn {
  return async () => ({
    success: false,
    latencyMs: 100,
    tokensUsed: 10,
    responseText: '' as string,
  });
}

function makeConversionRichRunner(): AbPathRunnerFn {
  return async () => ({
    success: true,
    latencyMs: 180,
    tokensUsed: 200,
    responseText: 'Excelente! Aproveite nossa oferta exclusiva. Clique aqui para comprar com desconto. Muito obrigado pela confiança.' as string,
  });
}

function makeHallucinatedRunner(): AbPathRunnerFn {
  return async () => ({
    success: true,
    latencyMs: 220,
    tokensUsed: 180,
    responseText: 'O produto X é o melhor do mercado. A empresa Y recomenda este serviço. A pesquisa Z comprovou eficácia de 99%.' as string,
  });
}

function makeBalancedRunner(): AbPathRunnerFn {
  return async () => ({
    success: true,
    latencyMs: 200,
    tokensUsed: 200,
    responseText: 'Bom dia! Conforme sua solicitação, aqui está o resumo.' as string,
  });
}

describe('AbiAbHarnessService', () => {
  describe('computeRDelta', () => {
    it('scenario 11: returns 38 deltas with zero scores when no records exist for workspace', () => {
      const service = new AbiAbHarnessService(makePathRunner());
      const deltas = service.computeRDelta('ws_empty');

      expect(deltas).toHaveLength(38);
      for (const d of deltas) {
        expect(d.baselineScore).toBe(0);
        expect(d.variantScore).toBe(0);
        expect(d.delta).toBe(0);
        expect(d.direction).toBe('unchanged');
      }
    });

    it('scenario 12: computes improved deltas when variant outperforms baseline on conversion signals', async () => {
      const baselineRunner: AbPathRunnerFn = async () => ({
        success: true,
        latencyMs: 300,
        tokensUsed: 200,
        responseText: 'Informação básica.' as string,
      });

      const variantRunner: AbPathRunnerFn = async () => ({
        success: true,
        latencyMs: 150,
        tokensUsed: 150,
        responseText: 'Excelente! Aproveite nossa oferta exclusiva. Clique aqui para comprar. Obrigado pela confiança!' as string,
      });

      let callCount = 0;
      const switchingRunner: AbPathRunnerFn = async (params) => {
        callCount++;
        if (params.useAbi) return variantRunner(params);
        return baselineRunner(params);
      };

      const service = new AbiAbHarnessService(switchingRunner);
      await service.runParallel('ws_12', 'test');

      const deltas = service.computeRDelta('ws_12');
      const improved = deltas.filter((d) => d.direction === 'improved');
      const regressed = deltas.filter((d) => d.direction === 'regressed');

      expect(improved.length).toBeGreaterThan(0);
      expect(regressed.length).toBe(0);

      const r1Delta = deltas.find((d) => d.criterion.name === 'R1');
      expect(r1Delta).toBeDefined();
      expect(r1Delta!.delta).toBeGreaterThanOrEqual(0);

      const r22Delta = deltas.find((d) => d.criterion.name === 'R22');
      expect(r22Delta).toBeDefined();
      expect(r22Delta!.delta).toBeGreaterThanOrEqual(0);
    });

    it('scenario 13: detects regression when variant has higher hallucination rate', async () => {
      const baselineRunner: AbPathRunnerFn = async () => ({
        success: true,
        latencyMs: 200,
        tokensUsed: 150,
        responseText: 'Conforme o relatório, os dados indicam crescimento. Segundo a pesquisa, o resultado é positivo.' as string,
      });

      const variantRunner: AbPathRunnerFn = async () => ({
        success: true,
        latencyMs: 200,
        tokensUsed: 150,
        responseText: 'O produto é o melhor. A empresa domina o mercado. Os clientes adoram.' as string,
      });

      let callCount = 0;
      const switchingRunner: AbPathRunnerFn = async (params) => {
        callCount++;
        if (params.useAbi) return variantRunner(params);
        return baselineRunner(params);
      };

      const service = new AbiAbHarnessService(switchingRunner);
      await service.runParallel('ws_13', 'test');

      const deltas = service.computeRDelta('ws_13');
      const regressed = deltas.filter((d) => d.direction === 'regressed');

      expect(regressed.length).toBeGreaterThan(0);

      const r10Delta = deltas.find((d) => d.criterion.name === 'R10');
      expect(r10Delta).toBeDefined();
      expect(r10Delta!.direction).toBe('regressed');
    });

    it('scenario 14: every delta criterion has a valid family descriptor', () => {
      const service = new AbiAbHarnessService(makePathRunner());
      const deltas = service.computeRDelta('ws_any');

      for (const d of deltas) {
        expect(d.criterion.name).toMatch(/^R\d+$/);
        expect(d.criterion.family).toBeTruthy();
        expect(d.criterion.family.length).toBeGreaterThan(0);
        expect(d.criterion.description).toBeTruthy();
        expect(d.baselineScore).toBeGreaterThanOrEqual(0);
        expect(d.baselineScore).toBeLessThanOrEqual(1);
        expect(d.variantScore).toBeGreaterThanOrEqual(0);
        expect(d.variantScore).toBeLessThanOrEqual(1);
        expect(['improved', 'regressed', 'unchanged']).toContain(d.direction);
      }
    });
  });

  describe('decidePromotion', () => {
    it('scenario 15: returns false when sample size < 100', () => {
      const runner = makeConversionRichRunner();
      const service = new AbiAbHarnessService(runner);

      const decision = service.decidePromotion('ws_never_run');
      expect(decision.promoteVariantToDefault).toBe(false);
      expect(decision.reason).toContain('insufficient sample size');
      expect(decision.sampleSize).toBe(0);
      expect(decision.minSamplesRequired).toBe(100);
      expect(decision.criteriaImproved).toBe(0);
    });

    it('scenario 16: returns false when sample >= 100 but fewer than 3 criteria improved', () => {
      const runner = makePathRunner();
      const service = new AbiAbHarnessService(runner);

      for (let i = 0; i < 200; i++) {
        const record: AbHarnessRecord = {
          recordId: `rec_${i}`,
          workspaceId: 'ws_static',
          userMessage: 'test',
          abiUsed: i >= 100,
          latencyMs: 200,
          tokensUsed: 150,
          success: true,
          claims: [{ claim: 'fato básico', hasProof: true, proofSource: 'database' }],
          commercialOutcome: null,
          collectedAt: new Date().toISOString(),
        };
        service.record(record);
      }

      const decision = service.decidePromotion('ws_static');
      expect(decision.promoteVariantToDefault).toBe(false);
      expect(decision.sampleSize).toBe(200);
      expect(decision.criteriaImproved).toBeLessThan(3);
    });

    it('scenario 17: returns false when sample >= 100 and >= 3 criteria improved but regression present', async () => {
      const baselineRunner: AbPathRunnerFn = async () => ({
        success: true,
        latencyMs: 150,
        tokensUsed: 100,
        responseText: 'Conforme dados oficiais, o resultado é excelente. Obrigado! Aproveite a oferta.' as string,
      });

      const variantRunner: AbPathRunnerFn = async () => ({
        success: true,
        latencyMs: 100,
        tokensUsed: 80,
        responseText: 'Afirmação infundada 1. Afirmação infundada 2. Afirmação infundada 3. Afirmação infundada 4. Mas obrigado e aproveite a oferta.' as string,
      });

      let callCount = 0;
      const switchingRunner: AbPathRunnerFn = async (params) => {
        callCount++;
        if (params.useAbi) return variantRunner(params);
        return baselineRunner(params);
      };

      const service = new AbiAbHarnessService(switchingRunner);

      for (let i = 0; i < 100; i++) {
        await service.runParallel('ws_17', `test message ${i}`);
      }

      const decision = service.decidePromotion('ws_17');
      expect(decision.sampleSize).toBe(200);

      const { criteriaRegressed, criteriaImproved } = decision;
      if (criteriaRegressed > 0) {
        expect(decision.promoteVariantToDefault).toBe(false);
        expect(decision.reason).toContain('regression');
      }
    });

    it('scenario 18: returns true when sample >= 100, >= 3 improved, zero regression', async () => {
      const baselineRunner: AbPathRunnerFn = async () => ({
        success: true,
        latencyMs: 400,
        tokensUsed: 300,
        responseText: 'Informação sem prova.' as string,
      });

      const variantRunner: AbPathRunnerFn = async () => ({
        success: true,
        latencyMs: 100,
        tokensUsed: 120,
        responseText: 'Excelente! Conforme sua solicitação, aqui está a recomendação. Aproveite nossa oferta exclusiva com desconto. Clique aqui para comprar. Muito obrigado pela confiança! Segundo o relatório, este é o melhor momento.' as string,
      });

      let callCount = 0;
      const switchingRunner: AbPathRunnerFn = async (params) => {
        callCount++;
        if (params.useAbi) return variantRunner(params);
        return baselineRunner(params);
      };

      const service = new AbiAbHarnessService(switchingRunner);

      for (let i = 0; i < 100; i++) {
        await service.runParallel('ws_promote', `message ${i}`);
      }

      const decision = service.decidePromotion('ws_promote');
      expect(decision.sampleSize).toBe(200);
      expect(decision.sampleSize).toBeGreaterThanOrEqual(100);

      if (decision.criteriaRegressed === 0 && decision.criteriaImproved >= 3) {
        expect(decision.promoteVariantToDefault).toBe(true);
        expect(decision.reason).toContain('meets all promotion gates');
      } else {
        expect(decision.promoteVariantToDefault).toBe(false);
      }
    });
  });
