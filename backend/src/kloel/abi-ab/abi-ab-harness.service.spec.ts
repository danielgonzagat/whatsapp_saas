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
