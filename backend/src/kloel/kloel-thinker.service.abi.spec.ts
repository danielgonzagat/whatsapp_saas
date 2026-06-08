import {
  ForbiddenException,
  KloelStreamWriter,
  runComposerCapabilityBranch,
  service,
  wsId,
  replyEngine,
  llmBudget,
  abiBuilder,
  capabilityExecutor,
  memoryGraph,
  manifestInjection,
} from './kloel-thinker.service.spec.helpers';
import type { LocalToolExecutor, Response } from './kloel-thinker.service.spec.helpers';

describe('KloelThinkerService', () => {
  describe('think (SSE)', () => {
    it('builds conversational ABI by default and sends cognitive state to model messages', async () => {
      const previousFlag = process.env['KLOEL_THINKER_USE_ABI'];
      delete process.env['KLOEL_THINKER_USE_ABI'];
      const cognitiveState = {
        abiVersion: '1.1.0',
        lineage: {
          canonicalName: 'Kloel',
          genesisEventId: 'genesis-1',
          lineageStatus: 'intact',
          operationalAge: { days: 1 },
          capabilities: ['list_products'],
        },
        identityProjection: {
          audience: 'public',
          currentMaturity: 'developing',
          truthMode: 'observed',
        },
        perception: { currentSnapshot: { channel: 'web' }, recentSalientEvents: [] },
        beliefs: [],
        predictions: { active: [], recentSurprises: [] },
        attention: { candidates: [] },
        memory: { workingMemory: [], episodicRefs: [], consolidatedRefs: [] },
        capabilities: {
          available: [
            { capabilityId: 'list_products', maturity: 'developing', runtimeEvidencePct: 1 },
          ],
          restricted: [],
        },
        valence: {
          recentTrace: [],
          aggregatedMood: { positive: 0, negative: 0, neutral: 1, ambiguous: 0, windowHours: 24 },
        },
        readinessTruth: {
          noOverclaimStatus: 'PASS',
          capabilityHealthScore: 1,
          gates: [],
          certificationVerdict: {
            verdict: 'DEVELOPING',
            score: 1,
            measuredAt: '2026-05-27T00:00:00.000Z',
          },
          overclaimRisk: 0,
        },
        currentInput: {
          raw: 'Liste meus produtos ativos',
          channel: 'web',
          arrivalTimestamp: '2026-05-27T00:00:00.000Z',
        },
      };
      abiBuilder.build = jest.fn().mockResolvedValue({ status: 'ok', abi: cognitiveState });

      try {
        await service.think(
          { message: 'Liste meus produtos ativos', workspaceId: wsId },
          {} as Response,
          null,
          undefined,
          undefined,
          jest.fn() as LocalToolExecutor,
        );
      } finally {
        if (previousFlag === undefined) {
          delete process.env['KLOEL_THINKER_USE_ABI'];
        } else {
          process.env['KLOEL_THINKER_USE_ABI'] = previousFlag;
        }
      }

      expect(capabilityExecutor.buildCognitiveSubstrate).toHaveBeenCalledWith(wsId);
      const buildMock = jest.mocked(abiBuilder.build);
      const abiBuildParams = buildMock.mock.calls[0]?.[0];
      expect(abiBuildParams?.cognitiveSubstrate).toEqual(
        expect.objectContaining({ workingMemory: ['memória operacional'] }),
      );
      expect(abiBuildParams?.capabilityIds).toEqual(expect.arrayContaining(['list_products']));
      expect(replyEngine.buildChatModelMessages).toHaveBeenCalledWith(
        expect.objectContaining({ prebuiltCognitiveState: cognitiveState }),
      );
    });

    it('injects the per-user memory + capability manifest into the hidden runtime context', async () => {
      (memoryGraph.buildMemoryContextForModel as jest.Mock).mockResolvedValueOnce({
        userProfileStatic: ['O usuário se chama Daniel'],
        userProfileDynamic: [],
        relevantMemories: [],
        preferences: [],
        constraints: [],
        text: 'MEMÓRIA DO USUÁRIO (aprendida em conversas anteriores):\n\nPERFIL DO USUÁRIO (estável):\n- O usuário se chama Daniel',
      });
      (manifestInjection.assemble as jest.Mock).mockReturnValueOnce({
        text: '<<<KLOEL_CAPABILITY_MANIFEST>>>\nCAPACIDADES DISPONÍVEIS (opcionais, selecionadas para este turno):\n- products.create: Cria um produto\n<<<END_KLOEL_CAPABILITY_MANIFEST>>>',
        internalNames: ['products.create'],
      });

      await service.think(
        { message: 'crie um produto', workspaceId: wsId, userId: 'agent-1' },
        {} as Response,
        null,
        undefined,
        undefined,
        jest.fn() as LocalToolExecutor,
      );

      expect(memoryGraph.buildMemoryContextForModel).toHaveBeenCalledWith(
        wsId,
        'agent-1',
        'crie um produto',
      );
      expect(manifestInjection.assemble).toHaveBeenCalledWith(
        'crie um produto',
        expect.objectContaining({ surface: 'dashboard-chat' }),
      );
      // The injected blocks reach the model via the hidden `dynamicContext`
      // channel of buildChatModelMessages — never the user-visible answer.
      const buildChatMessagesMock = jest.mocked(replyEngine.buildChatModelMessages);
      const [lastBuild] = buildChatMessagesMock.mock.calls.at(-1) ?? [];
      expect(typeof lastBuild?.dynamicContext).toBe('string');
      expect(lastBuild?.dynamicContext as string).toContain('O usuário se chama Daniel');
      expect(lastBuild?.dynamicContext as string).toContain('CAPACIDADES DISPONÍVEIS');
    });

    it('still completes the turn when the memory + manifest services throw (degrades to empty)', async () => {
      (memoryGraph.buildMemoryContextForModel as jest.Mock).mockRejectedValueOnce(
        new Error('memory db down'),
      );
      (manifestInjection.assemble as jest.Mock).mockImplementationOnce(() => {
        throw new Error('router boom');
      });

      await expect(
        service.think(
          { message: 'oi tudo bem', workspaceId: wsId, userId: 'agent-1' },
          {} as Response,
          null,
          undefined,
          undefined,
          jest.fn() as LocalToolExecutor,
        ),
      ).resolves.toBeUndefined();

      // The turn still reached the model-message build with the legacy
      // (un-augmented) dynamicContext — neither failure broke the turn.
      expect(replyEngine.buildChatModelMessages).toHaveBeenCalled();
      const buildChatMessagesMock = jest.mocked(replyEngine.buildChatModelMessages);
      const [lastBuild] = buildChatMessagesMock.mock.calls.at(-1) ?? [];
      expect(lastBuild?.dynamicContext as string).not.toContain('CAPACIDADES DISPONÍVEIS');
    });

    it('does not throw when request is aborted before start', async () => {
      const signal = AbortSignal.abort();

      await expect(
        service.think(
          { message: 'hello', workspaceId: wsId },
          {} as Response,
          null,
          undefined,
          undefined,
          jest.fn() as LocalToolExecutor,
          { signal },
        ),
      ).resolves.toBeUndefined();
    });

    it('blocks the composer capability branch for an over-budget workspace (budget preflight)', async () => {
      // assertBudget rejects → the composer provider must NOT run, so an
      // over-budget workspace can't keep triggering paid create-site calls.
      (llmBudget.assertBudget as jest.Mock).mockRejectedValueOnce(
        new ForbiddenException({ code: 'llm_budget_exceeded' }),
      );
      jest.mocked(runComposerCapabilityBranch).mockClear();

      await service.think(
        {
          message: 'crie uma landing page curta',
          workspaceId: wsId,
          userId: 'agent-1',
          metadata: { capability: 'create_site' },
        },
        {} as Response,
        'create_site',
        undefined,
        undefined,
        jest.fn() as LocalToolExecutor,
      );

      expect(llmBudget.assertBudget).toHaveBeenCalledTimes(1);
      // The paid composer provider must never be reached when over budget.
      expect(runComposerCapabilityBranch).not.toHaveBeenCalled();
      // A terminal error event is surfaced (same behavior as the normal path).
      const streamWriter = (KloelStreamWriter as jest.Mock).mock.results.at(-1)?.value as {
        write: jest.Mock<void, [unknown]>;
        close: jest.Mock;
      };
      expect(
        streamWriter.write.mock.calls.some(([event]) => {
          if (event === null || typeof event !== 'object' || Array.isArray(event)) {
            return false;
          }
          const maybeEvent = event as { type?: unknown; done?: unknown };
          return maybeEvent.type === 'error' && maybeEvent.done === true;
        }),
      ).toBe(true);
    });
  });
});
