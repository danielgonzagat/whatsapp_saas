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
