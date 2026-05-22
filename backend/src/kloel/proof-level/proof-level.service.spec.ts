import { expectValueOf } from '../../../test/expect-value-of';
import { ProofLevelService } from './proof-level.service';
import { EvidenceDescriptor, ProofClassification } from './proof-level.types';

function makeEvidence(over: Partial<EvidenceDescriptor> = {}): EvidenceDescriptor {
  return {
    origin: 'mental_simulation',
    sampleSize: 0,
    ...over,
  };
}

describe('ProofLevelService', () => {
  let service: ProofLevelService;

  beforeEach(() => {
    service = new ProofLevelService();
  });

  const describeLevel = (
    origin: EvidenceDescriptor['origin'],
    expectedLevel: ProofClassification['level'],
    canDeclareProvado: boolean,
  ) => {
    describe(`${origin} → ${expectedLevel}`, () => {
      it(`classifies as ${expectedLevel}`, () => {
        const result = service.classify(makeEvidence({ origin, sampleSize: 1 }));
        expect(result.level).toBe(expectedLevel);
      });

      it(`canDeclareProvado = ${canDeclareProvado}`, () => {
        const result = service.classify(makeEvidence({ origin, sampleSize: 1 }));
        expect(result.canDeclareProvado).toBe(canDeclareProvado);
      });
    });
  };

  describeLevel('mental_simulation', 'N1', false);
  describeLevel('synthetic_scenario', 'N2', false);
  describeLevel('code_run', 'N3', false);
  describeLevel('observed_user', 'N4', true);
  describeLevel('user_confirmed', 'N5', true);
  describeLevel('commercial_outcome', 'N6', true);

  describe('readyForRealValidation', () => {
    it('false for N1..N3', () => {
      for (const origin of ['mental_simulation', 'synthetic_scenario', 'code_run'] as const) {
        const result = service.classify(makeEvidence({ origin, sampleSize: 10 }));
        expect(result.readyForRealValidation).toBe(false);
      }
    });

    it('true for N4 with sampleSize >= 1', () => {
      const result = service.classify(makeEvidence({ origin: 'observed_user', sampleSize: 1 }));
      expect(result.readyForRealValidation).toBe(true);
    });

    it('false for N4 with sampleSize = 0', () => {
      const result = service.classify(makeEvidence({ origin: 'observed_user', sampleSize: 0 }));
      expect(result.readyForRealValidation).toBe(false);
    });

    it('true for N5 with confirmedBy', () => {
      const result = service.classify(
        makeEvidence({
          origin: 'user_confirmed',
          sampleSize: 5,
          confirmedBy: 'usr_1',
        }),
      );
      expect(result.readyForRealValidation).toBe(true);
    });

    it('true for N6 with commercialMetric and sampleSize > 0', () => {
      const result = service.classify(
        makeEvidence({
          origin: 'commercial_outcome',
          sampleSize: 100,
          commercialMetric: { kind: 'conversion', delta: 0.15 },
        }),
      );
      expect(result.readyForRealValidation).toBe(true);
    });
  });

  describe('missingForNextLevel', () => {
    it('N1 lists N2 and N3 requirements', () => {
      const result = service.classify(makeEvidence({ origin: 'mental_simulation', sampleSize: 0 }));
      expect(result.missingForNextLevel).toContain(
        'Requires synthetic_scenario origin to reach N2',
      );
      expect(result.missingForNextLevel).toContain('Requires code_run origin to reach N3');
    });

    it('N1 with sampleSize <= 1 lists N4 sampleSize requirement', () => {
      const result = service.classify(makeEvidence({ origin: 'mental_simulation', sampleSize: 1 }));
      expect(result.missingForNextLevel).toContain('Requires sampleSize > 1 to reach N4');
    });

    it('N3 lists N4..N6 requirements', () => {
      const result = service.classify(makeEvidence({ origin: 'code_run', sampleSize: 1 }));
      expect(result.missingForNextLevel).toContain('Requires observed_user origin to reach N4');
      expect(result.missingForNextLevel).toContain('Requires user_confirmed origin to reach N5');
      expect(result.missingForNextLevel).toContain(
        'Requires commercial_outcome origin to reach N6',
      );
    });

    it('N4 lists confirmedBy and N5 requirements', () => {
      const result = service.classify(makeEvidence({ origin: 'observed_user', sampleSize: 2 }));
      expect(result.missingForNextLevel).toContain('Requires confirmedBy to reach N5');
      expect(result.missingForNextLevel).toContain('Requires user_confirmed origin to reach N5');
    });

    it('N5 without commercialMetric lists N6 commercialMetric requirement', () => {
      const result = service.classify(
        makeEvidence({
          origin: 'user_confirmed',
          sampleSize: 3,
          confirmedBy: 'usr_2',
        }),
      );
      expect(result.missingForNextLevel).toContain('Requires commercialMetric to reach N6');
      expect(result.missingForNextLevel).toContain(
        'Requires commercial_outcome origin to reach N6',
      );
    });

    it('N5 without confirmedBy still lists only N6 requirements (already at N5)', () => {
      const result = service.classify(makeEvidence({ origin: 'user_confirmed', sampleSize: 3 }));
      expect(result.missingForNextLevel).toContain('Requires commercialMetric to reach N6');
      expect(result.missingForNextLevel).toContain(
        'Requires commercial_outcome origin to reach N6',
      );
      expect(result.missingForNextLevel).not.toContain('Requires confirmedBy to reach N5');
    });

    it('N6 has empty missingForNextLevel', () => {
      const result = service.classify(
        makeEvidence({
          origin: 'commercial_outcome',
          sampleSize: 50,
          commercialMetric: { kind: 'ltv', delta: 230 },
        }),
      );
      expect(result.missingForNextLevel).toEqual([]);
    });

    it('N2 with sampleSize 0 lists N4 sampleSize requirement and N6 sampleSize requirement', () => {
      const result = service.classify(
        makeEvidence({ origin: 'synthetic_scenario', sampleSize: 0 }),
      );
      expect(result.missingForNextLevel).toContain('Requires sampleSize > 1 to reach N4');
      expect(result.missingForNextLevel).toContain('Requires sampleSize > 0 to reach N6');
    });

    it('N3 with sampleSize 0 lists N6 sampleSize requirement', () => {
      const result = service.classify(makeEvidence({ origin: 'code_run', sampleSize: 0 }));
      expect(result.missingForNextLevel).toContain('Requires sampleSize > 0 to reach N6');
    });
  });

  describe('commercialMetric propagation', () => {
    it('N4 with valid commercialMetric but wrong origin still only N4', () => {
      const result = service.classify(
        makeEvidence({
          origin: 'observed_user',
          sampleSize: 10,
          commercialMetric: { kind: 'retention', delta: 0.05 },
        }),
      );
      expect(result.level).toBe('N4');
      expect(result.canDeclareProvado).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('sampleSize negative does not crash', () => {
      const result = service.classify(
        makeEvidence({ origin: 'mental_simulation', sampleSize: -5 }),
      );
      expect(result.level).toBe('N1');
      expect(result.canDeclareProvado).toBe(false);
    });

    it('confirmedBy empty string triggers missingForNextLevel', () => {
      const result = service.classify(
        makeEvidence({
          origin: 'observed_user',
          sampleSize: 2,
          confirmedBy: '',
        }),
      );
      expect(result.missingForNextLevel).toContain('Requires confirmedBy to reach N5');
    });

    it('commercialMetric with all 4 kinds works', () => {
      const kinds: Array<EvidenceDescriptor['commercialMetric']> = [
        { kind: 'ltv', delta: 100 },
        { kind: 'conversion', delta: 0.2 },
        { kind: 'retention', delta: 0.1 },
        { kind: 'churn_reduction', delta: -0.05 },
      ];
      for (const metric of kinds) {
        const result = service.classify(
          makeEvidence({
            origin: 'commercial_outcome',
            sampleSize: 10,
            commercialMetric: metric!,
          }),
        );
        expect(result.level).toBe('N6');
        expect(result.missingForNextLevel).toEqual([]);
      }
    });

    it('observedAt is optional and does not affect classification', () => {
      const withObserved = service.classify(
        makeEvidence({
          origin: 'observed_user',
          sampleSize: 1,
          observedAt: '2026-05-14T10:00:00Z',
        }),
      );
      const withoutObserved = service.classify(
        makeEvidence({ origin: 'observed_user', sampleSize: 1 }),
      );
      expect(withObserved.level).toBe(withoutObserved.level);
      expect(withObserved.canDeclareProvado).toBe(withoutObserved.canDeclareProvado);
    });

    it('N5 missingForNextLevel does not repeat N5 origin requirement', () => {
      const result = service.classify(
        makeEvidence({
          origin: 'user_confirmed',
          sampleSize: 5,
          confirmedBy: 'usr_3',
        }),
      );
      const duplicates = result.missingForNextLevel.filter(
        (m) => m === 'Requires user_confirmed origin to reach N5',
      );
      expect(duplicates.length).toBe(0);
    });

    it('N1 missingForNextLevel includes N4 observed_user requirement', () => {
      const result = service.classify(makeEvidence({ origin: 'mental_simulation', sampleSize: 1 }));
      expect(result.missingForNextLevel).toContain('Requires observed_user origin to reach N4');
    });
  });

  describe('classification result shape', () => {
    it('returns all required fields', () => {
      const result = service.classify(
        makeEvidence({
          origin: 'commercial_outcome',
          sampleSize: 42,
          commercialMetric: { kind: 'conversion', delta: 0.3 },
        }),
      );
      expect(result).toMatchObject({
        level: expectValueOf(String),
        canDeclareProvado: expectValueOf(Boolean),
        readyForRealValidation: expectValueOf(Boolean),
        missingForNextLevel: expectValueOf(Array),
      });
    });

    it('level is one of N1..N6', () => {
      const validLevels = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6'];
      for (const origin of [
        'mental_simulation',
        'synthetic_scenario',
        'code_run',
        'observed_user',
        'user_confirmed',
        'commercial_outcome',
      ] as const) {
        const result = service.classify(makeEvidence({ origin, sampleSize: 1 }));
        expect(validLevels).toContain(result.level);
      }
    });
  });
});
