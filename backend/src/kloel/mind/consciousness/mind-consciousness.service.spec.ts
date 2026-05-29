import { MindConsciousnessService } from './mind-consciousness.service';

interface AutonomyMock {
  propose: jest.Mock;
}
interface CaseMemoryMock {
  similar: jest.Mock;
  recordCase: jest.Mock;
}
interface GuardAuditMock {
  findRecent: jest.Mock;
}
interface HealthMock {
  snapshot: jest.Mock;
}
interface BeliefMock {
  list: jest.Mock;
}
interface EventBusMock {
  emit: jest.Mock;
}

const TOKENS = {
  autonomy: 'MIND_CONSCIOUSNESS_AUTONOMY',
  caseMemory: 'MIND_CONSCIOUSNESS_CASE_MEMORY',
  guardAudit: 'MIND_CONSCIOUSNESS_GUARD_AUDIT',
  health: 'MIND_CONSCIOUSNESS_HEALTH',
  belief: 'MIND_CONSCIOUSNESS_BELIEF',
  eventBus: 'MIND_CONSCIOUSNESS_EVENT_BUS',
};

/**
 * Build the service while letting NestJS DI honor @Optional. We register
 * deps in the order the constructor expects so positional injection matches
 * even though only @Optional() is used.
 */
async function buildService(
  deps: {
    autonomy?: AutonomyMock;
    caseMemory?: CaseMemoryMock;
    guardAudit?: GuardAuditMock;
    health?: HealthMock;
    belief?: BeliefMock;
    eventBus?: EventBusMock;
  } = {},
): Promise<MindConsciousnessService> {
  // Direct instantiation respects positional optional arguments without
  // requiring DI tokens that the production wiring does not have yet.
  return new MindConsciousnessService(
    deps.autonomy,
    deps.caseMemory,
    deps.guardAudit,
    deps.health,
    deps.belief,
    deps.eventBus,
  );
}

describe('MindConsciousnessService', () => {
  describe('getSelfNarrative', () => {
    it('synthesizes narrative from all collaborators with workspace scope', async () => {
      const autonomy: AutonomyMock = {
        propose: jest.fn().mockResolvedValue({
          proposals: [
            { action: 'iniciar onboarding' },
            { action: 'enviar follow-up para leads quentes' },
          ],
        }),
      };
      const caseMemory: CaseMemoryMock = {
        similar: jest.fn().mockResolvedValue([
          {
            subject: 'self',
            text: 'vendi um plano premium',
            outcome: 1,
            occurredAt: new Date('2026-05-01T12:00:00Z'),
          },
          {
            subject: 'self',
            text: 'cliente cancelou',
            outcome: -1,
            occurredAt: new Date('2026-05-02T12:00:00Z'),
          },
        ]),
        recordCase: jest.fn(),
      };
      const guardAudit: GuardAuditMock = {
        findRecent: jest.fn().mockResolvedValue([
          { guardName: 'wallet', reason: 'saldo insuficiente' },
          { guardName: 'wallet', reason: 'saldo insuficiente' },
          { guardName: 'kyc', reason: 'pendência documental' },
        ]),
      };
      const service = await buildService({ autonomy, caseMemory, guardAudit });

      const narrative = await service.getSelfNarrative('ws-1');

      expect(autonomy.propose).toHaveBeenCalledWith('ws-1');
      expect(caseMemory.similar).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          caseType: 'consciousness.experience',
        }) as never,
      );
      expect(guardAudit.findRecent).toHaveBeenCalledWith('ws-1');
      expect(narrative.identity).toMatch(/Kloel/);
      expect(narrative.currentGoals).toEqual([
        'iniciar onboarding',
        'enviar follow-up para leads quentes',
      ]);
      expect(narrative.recentExperiences).toHaveLength(2);
      expect(narrative.recentExperiences[0].emotionalValence).toBe('good');
      expect(narrative.recentExperiences[1].emotionalValence).toBe('bad');
      // dedupes guard reasons
      const walletEntries = narrative.knownLimits.filter((l) => l.includes('wallet'));
      expect(walletEntries).toHaveLength(1);
    });

    it('tolerates all-deps-missing and still returns identity + default limits', async () => {
      const service = await buildService();
      const narrative = await service.getSelfNarrative('ws-empty');
      expect(narrative.identity).toMatch(/Kloel/);
      expect(narrative.currentGoals).toEqual([]);
      expect(narrative.recentExperiences).toEqual([]);
      expect(narrative.knownLimits.length).toBeGreaterThan(0);
    });

    it('rejects when workspaceId is empty', async () => {
      const service = await buildService();
      await expect(service.getSelfNarrative('')).rejects.toThrow(
        'mind_consciousness_workspace_required',
      );
    });

    it('degrades gracefully when a collaborator throws', async () => {
      const autonomy: AutonomyMock = {
        propose: jest.fn().mockRejectedValue(new Error('autonomy_down')),
      };
      const caseMemory: CaseMemoryMock = {
        similar: jest.fn().mockRejectedValue(new Error('mem_down')),
        recordCase: jest.fn(),
      };
      const guardAudit: GuardAuditMock = {
        findRecent: jest.fn().mockRejectedValue(new Error('guard_down')),
      };
      const service = await buildService({ autonomy, caseMemory, guardAudit });
      const narrative = await service.getSelfNarrative('ws-1');
      expect(narrative.currentGoals).toEqual([]);
      expect(narrative.recentExperiences).toEqual([]);
      // default limits still present
      expect(narrative.knownLimits.length).toBeGreaterThan(0);
    });
  });

  describe('recordExperience', () => {
    it('persists in case memory and emits cognition event with workspace scope', async () => {
      const caseMemory: CaseMemoryMock = {
        similar: jest.fn(),
        recordCase: jest.fn().mockResolvedValue({ id: 'case-1' }),
      };
      const eventBus: EventBusMock = { emit: jest.fn() };
      const service = await buildService({ caseMemory, eventBus });

      await service.recordExperience('ws-1', {
        what: 'fechei venda do plano gold',
        outcome: 'good',
        learnings: ['cliente preferiu PIX'],
      });

      const recordCalls = caseMemory.recordCase.mock.calls as Array<
        [
          {
            workspaceId: string;
            caseType: string;
            text: string;
            action: string;
            outcome: number;
            features: Record<string, unknown>;
          },
        ]
      >;
      const r = recordCalls[0]?.[0];
      expect(r?.workspaceId).toBe('ws-1');
      expect(r?.caseType).toBe('consciousness.experience');
      expect(r?.text).toBe('fechei venda do plano gold');
      expect(r?.action).toBe('record');
      expect(r?.outcome).toBe(1);
      expect(r?.features).toMatchObject({ valence: 'good', learnings: ['cliente preferiu PIX'] });
      expect(eventBus.emit).toHaveBeenCalledWith(
        'cognition.consciousness.experience_recorded',
        expect.objectContaining({
          workspaceId: 'ws-1',
          what: 'fechei venda do plano gold',
          outcome: 'good',
        }),
      );
    });

    it('no-ops on empty "what"', async () => {
      const caseMemory: CaseMemoryMock = {
        similar: jest.fn(),
        recordCase: jest.fn(),
      };
      const eventBus: EventBusMock = { emit: jest.fn() };
      const service = await buildService({ caseMemory, eventBus });
      await service.recordExperience('ws-1', { what: '   ', outcome: 'neutral' });
      expect(caseMemory.recordCase).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('swallows persistence errors but still attempts emit', async () => {
      const caseMemory: CaseMemoryMock = {
        similar: jest.fn(),
        recordCase: jest.fn().mockRejectedValue(new Error('db_down')),
      };
      const eventBus: EventBusMock = { emit: jest.fn() };
      const service = await buildService({ caseMemory, eventBus });
      await expect(
        service.recordExperience('ws-1', { what: 'tried', outcome: 'bad' }),
      ).resolves.toBeUndefined();
      expect(eventBus.emit).toHaveBeenCalled();
    });

    it('tolerates all-deps-missing without throwing', async () => {
      const service = await buildService();
      await expect(
        service.recordExperience('ws-1', { what: 'silent path', outcome: 'neutral' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('selfAssess', () => {
    it('aggregates health, capabilities and surprises', async () => {
      const health: HealthMock = {
        snapshot: jest.fn().mockResolvedValue({
          db: 'ok',
          redis: 'ok',
          whatsapp: 'connected',
          llm: 'degraded',
        }),
      };
      const belief: BeliefMock = {
        list: jest.fn().mockResolvedValue([{}, {}, {}]),
      };
      const guardAudit: GuardAuditMock = {
        findRecent: jest.fn().mockResolvedValue([
          { guardName: 'a', reason: 'x' },
          { guardName: 'b', reason: 'y' },
        ]),
      };
      const service = await buildService({ health, belief, guardAudit });

      const assessment = await service.selfAssess('ws-1');

      expect(belief.list).toHaveBeenCalledWith('ws-1', 'capability.active');
      expect(assessment.activeCapabilities).toBe(3);
      expect(assessment.recentSurprises).toBe(2);
      // 100 - 10 (degraded llm) = 90
      expect(assessment.healthScore).toBe(90);
      expect(assessment.suggestedFocus).toBe('continuar evoluindo capacidades');
    });

    it('suggests health restoration when score is low', async () => {
      const health: HealthMock = {
        snapshot: jest.fn().mockResolvedValue({
          db: 'down',
          redis: 'down',
          whatsapp: 'disconnected',
          llm: 'degraded',
        }),
      };
      const service = await buildService({ health });
      const assessment = await service.selfAssess('ws-1');
      expect(assessment.healthScore).toBeLessThan(60);
      expect(assessment.suggestedFocus).toBe('restaurar saúde de infraestrutura');
    });

    it('returns zeroed assessment when all deps missing', async () => {
      const service = await buildService();
      const assessment = await service.selfAssess('ws-1');
      expect(assessment.healthScore).toBe(0);
      expect(assessment.activeCapabilities).toBe(0);
      expect(assessment.recentSurprises).toBe(0);
      expect(assessment.suggestedFocus).toBe('configurar telemetria mínima');
    });
  });

  it('exposes TOKENS map for future DI wiring', () => {
    expect(TOKENS.autonomy).toBeDefined();
  });
});
