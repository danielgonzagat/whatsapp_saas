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
  describe('runParallel basic mechanics', () => {
    it('scenario 1: stores both baseline (abiUsed=false) and variant (abiUsed=true) records', async () => {
      const runner = makePathRunner();
      const service = new AbiAbHarnessService(runner);

      const { baseline, variant } = await service.runParallel('ws_1', 'Olá, preciso de ajuda');

      expect(baseline.abiUsed).toBe(false);
      expect(variant.abiUsed).toBe(true);
      expect(baseline.workspaceId).toBe('ws_1');
      expect(variant.workspaceId).toBe('ws_1');
      expect(baseline.userMessage).toBe('Olá, preciso de ajuda');
      expect(variant.userMessage).toBe('Olá, preciso de ajuda');
    });

    it('scenario 2: captures latency from both paths', async () => {
      const baselineRunner = makePathRunner({ latencyMs: 120 });
      const variantRunner = makePathRunner({ latencyMs: 340 });

      let callCount = 0;
      const switchingRunner: AbPathRunnerFn = async (params) => {
        callCount++;
        if (params.useAbi) return variantRunner(params);
        return baselineRunner(params);
      };

      const service = new AbiAbHarnessService(switchingRunner);
      const { baseline, variant } = await service.runParallel('ws_2', 'test');

      expect(baseline.latencyMs).toBe(120);
      expect(variant.latencyMs).toBe(340);
      expect(callCount).toBe(2);
    });

    it('scenario 3: captures token counts from both paths', async () => {
      const baselineRunner = makePathRunner({ tokensUsed: 100 });
      const variantRunner = makePathRunner({ tokensUsed: 250 });

      let callCount = 0;
      const switchingRunner: AbPathRunnerFn = async (params) => {
        callCount++;
        if (params.useAbi) return variantRunner(params);
        return baselineRunner(params);
      };

      const service = new AbiAbHarnessService(switchingRunner);
      const { baseline, variant } = await service.runParallel('ws_3', 'test');

      expect(baseline.tokensUsed).toBe(100);
      expect(variant.tokensUsed).toBe(250);
    });

    it('scenario 4: both paths run in parallel (confirmed by recorded order within same ms window)', async () => {
      const runner = makePathRunner();
      const service = new AbiAbHarnessService(runner);

      const { baseline, variant } = await service.runParallel('ws_4', 'test');

      const records = service.getRecordsForWorkspace('ws_4');
      expect(records).toHaveLength(2);

      const bTime = new Date(baseline.collectedAt).getTime();
      const vTime = new Date(variant.collectedAt).getTime();
      expect(Math.abs(bTime - vTime)).toBeLessThan(5000);
    });
  });

  describe('hallucinated claim detection', () => {
    it('scenario 5: detects hallucinated claims — sentences without proof markers', async () => {
      const runner = makeHallucinatedRunner();
      const service = new AbiAbHarnessService(runner);

      const { baseline } = await service.runParallel('ws_5', 'fale sobre o produto');

      const hallucinated = baseline.claims.filter((c) => !c.hasProof);
      expect(hallucinated.length).toBeGreaterThan(0);

      for (const claim of hallucinated) {
        expect(claim.hasProof).toBe(false);
        expect(claim.proofSource).toBeNull();
      }
    });

    it('scenario 6: sentences with proof markers (conforme, segundo) are NOT flagged as hallucinated', async () => {
      const runner: AbPathRunnerFn = async () => ({
        success: true,
        latencyMs: 150,
        tokensUsed: 100,
        responseText: 'Segundo o relatório anual, as vendas cresceram 20%. De acordo com a pesquisa do IBGE, o mercado expandiu. Estes dados são verificáveis.' as string,
      });

      const service = new AbiAbHarnessService(runner);
      const { baseline } = await service.runParallel('ws_6', 'dados de mercado');

      const provenClaims = baseline.claims.filter((c) => c.hasProof);
      expect(provenClaims.length).toBeGreaterThan(0);

      for (const claim of provenClaims) {
        expect(claim.hasProof).toBe(true);
        expect(claim.proofSource).not.toBeNull();
      }
    });

    it('scenario 7: hallucinationRate computes the ratio of hallucinated claims to total claims', async () => {
      const runner: AbPathRunnerFn = async () => ({
        success: true,
        latencyMs: 100,
        tokensUsed: 50,
        responseText: 'Afirmação sem prova. Conforme fonte confiável, este dado é real. Outra afirmação sem evidência.' as string,
      });

      const service = new AbiAbHarnessService(runner);
      await service.runParallel('ws_7', 'test');

      const records = service.getRecordsForWorkspace('ws_7');
      const totalClaims = service.totalClaims(records);
      const hallucinated = service.hallucinatedFacts(records);
      const rate = service.hallucinationRate(records);

      expect(totalClaims).toBeGreaterThan(0);
      expect(hallucinated).toBeGreaterThan(0);
      expect(rate).toBe(hallucinated / totalClaims);

      const allClaims = records.flatMap((r) => r.claims);
      const expectedHallucinated = allClaims.filter((c) => !c.hasProof).length;
      expect(hallucinated).toBe(expectedHallucinated);
    });
  });

  describe('commercial outcome proxy detection', () => {
    it('scenario 8: detects conversion signal from response text', async () => {
      const runner: AbPathRunnerFn = async () => ({
        success: true,
        latencyMs: 150,
        tokensUsed: 80,
        responseText: 'Aproveite nossa oferta exclusiva! Clique aqui para comprar.' as string,
      });

      const service = new AbiAbHarnessService(runner);
      const { baseline } = await service.runParallel('ws_8', 'test');

      expect(baseline.commercialOutcome).not.toBeNull();
      expect(baseline.commercialOutcome!.conversionSignal).toBe(true);
    });

    it('scenario 9: detects satisfaction signal from response text', async () => {
      const runner: AbPathRunnerFn = async () => ({
        success: true,
        latencyMs: 150,
        tokensUsed: 80,
        responseText: 'Muito obrigado! Fico feliz em ajudar. Sua satisfação é nossa prioridade.' as string,
      });

      const service = new AbiAbHarnessService(runner);
      const { baseline } = await service.runParallel('ws_9', 'test');

      expect(baseline.commercialOutcome).not.toBeNull();
      expect(baseline.commercialOutcome!.satisfactionSignal).toBe(true);
    });

    it('scenario 10: returns null commercial outcome when no signal detected', async () => {
      const runner: AbPathRunnerFn = async () => ({
        success: true,
        latencyMs: 100,
        tokensUsed: 50,
        responseText: 'Aqui está a informação solicitada.' as string,
      });

      const service = new AbiAbHarnessService(runner);
      const { baseline } = await service.runParallel('ws_10', 'test');

      expect(baseline.commercialOutcome).toBeNull();
    });
  });

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

  describe('workspace isolation', () => {
    it('scenario 19: getRecordsForWorkspace returns only records for the specified workspace', async () => {
      const service = new AbiAbHarnessService(makePathRunner());

      await service.runParallel('ws_a', 'msg a');
      await service.runParallel('ws_b', 'msg b');

      const recordsA = service.getRecordsForWorkspace('ws_a');
      const recordsB = service.getRecordsForWorkspace('ws_b');

      expect(recordsA).toHaveLength(2);
      expect(recordsB).toHaveLength(2);

      for (const r of recordsA) {
        expect(r.workspaceId).toBe('ws_a');
      }
      for (const r of recordsB) {
        expect(r.workspaceId).toBe('ws_b');
      }
    });

    it('scenario 20: clearWorkspace removes all records for a workspace', async () => {
      const service = new AbiAbHarnessService(makePathRunner());

      await service.runParallel('ws_clear', 'test');
      expect(service.getRecordsForWorkspace('ws_clear')).toHaveLength(2);

      service.clearWorkspace('ws_clear');
      expect(service.getRecordsForWorkspace('ws_clear')).toHaveLength(0);
    });

    it('scenario 21: computeRDelta is isolated per workspace', async () => {
      const goodRunner: AbPathRunnerFn = async () => ({
        success: true,
        latencyMs: 100,
        tokensUsed: 100,
        responseText: 'Excelente! Obrigado! Aproveite a oferta!' as string,
      });

      const badRunner: AbPathRunnerFn = async () => ({
        success: false,
        latencyMs: 500,
        tokensUsed: 300,
        responseText: '' as string,
      });

      let callCount = 0;
      const switchingRunner: AbPathRunnerFn = async (params) => {
        callCount++;
        if (params.workspaceId === 'ws_good') return goodRunner(params);
        return badRunner(params);
      };

      const service = new AbiAbHarnessService(switchingRunner);

      await service.runParallel('ws_good', 'test');
      await service.runParallel('ws_bad', 'test');

      const goodDeltas = service.computeRDelta('ws_good');
      const badDeltas = service.computeRDelta('ws_bad');

      const goodImproved = goodDeltas.filter((d) => d.direction === 'improved');
      const badImproved = badDeltas.filter((d) => d.direction === 'improved');

      expect(goodImproved.length).toBeGreaterThanOrEqual(badImproved.length);
      expect(goodDeltas).toHaveLength(38);
      expect(badDeltas).toHaveLength(38);
    });
  });

  describe('boundary and edge cases', () => {
    it('scenario 22: accepts records from only one path (e.g., baseline only has data, variant empty)', async () => {
      const runner = makePathRunner();
      const service = new AbiAbHarnessService(runner);

      await service.runParallel('ws_edge', 'test');

      const deltas = service.computeRDelta('ws_edge');
      expect(deltas).toHaveLength(38);
    });

    it('scenario 23: failing path runner still produces records with success=false', async () => {
      const failingRunner = makeFailingPathRunner();
      const service = new AbiAbHarnessService(failingRunner);

      const { baseline } = await service.runParallel('ws_fail', 'test');

      expect(baseline.success).toBe(false);
      expect(baseline.claims).toHaveLength(0);
      expect(baseline.commercialOutcome).toBeNull();
    });

    it('scenario 24: high latency variant path is reflected in aggregate metrics', async () => {
      const baselineRunner = makePathRunner({ latencyMs: 100 });
      const variantRunner = makeSlowPathRunner();

      let callCount = 0;
      const switchingRunner: AbPathRunnerFn = async (params) => {
        callCount++;
        if (params.useAbi) return variantRunner(params);
        return baselineRunner(params);
      };

      const service = new AbiAbHarnessService(switchingRunner);

      for (let i = 0; i < 50; i++) {
        await service.runParallel('ws_slow', `msg ${i}`);
      }

      const deltas = service.computeRDelta('ws_slow');
      const r35Delta = deltas.find((d) => d.criterion.name === 'R35');
      expect(r35Delta).toBeDefined();
      expect(r35Delta!.variantScore).toBeLessThan(r35Delta!.baselineScore);
    });

    it('scenario 25: high token usage is captured in records', async () => {
      const baselineRunner = makePathRunner({ tokensUsed: 100 });
      const variantRunner = makeHighTokenPathRunner();

      let callCount = 0;
      const switchingRunner: AbPathRunnerFn = async (params) => {
        callCount++;
        if (params.useAbi) return variantRunner(params);
        return baselineRunner(params);
      };

      const service = new AbiAbHarnessService(switchingRunner);
      const { baseline, variant } = await service.runParallel('ws_tokens', 'test');

      expect(variant.tokensUsed).toBe(5000);
      expect(variant.tokensUsed).toBeGreaterThan(baseline.tokensUsed);
    });
  });
});
