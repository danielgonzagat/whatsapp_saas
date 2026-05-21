import {
  makeEcosystemPrivacyGuard,
  EcosystemPrivacyGuardInput,
} from './ecosystem-privacy-guard.gate';

const TARGET = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const FOREIGN_1 = '11111111-2222-3333-4444-555555555555';
const FOREIGN_2 = '66666666-7777-8888-9999-000000000000';

function cleanInput(
  overrides?: Partial<EcosystemPrivacyGuardInput>,
): EcosystemPrivacyGuardInput {
  return {
    targetWorkspaceId: TARGET,
    ...overrides,
  };
}

describe('ecosystem-privacy-guard gate — 18 full-surface scenarios', () => {
  const gate = makeEcosystemPrivacyGuard('hard_fail');

  it('1. PASS — empty input with only targetWorkspaceId', () => {
    expect(gate.check(cleanInput()).status).toBe('PASS');
  });

  it('2. PASS — wisdomPayload is undefined', () => {
    expect(
      gate.check(
        cleanInput({ wisdomPayload: undefined }),
      ).status,
    ).toBe('PASS');
  });

  it('3. PASS — wisdomPayload contains no workspace IDs', () => {
    expect(
      gate.check(
        cleanInput({
          wisdomPayload: { text: 'some wisdom', score: 42 },
        }),
      ).status,
    ).toBe('PASS');
  });

  it('4. FAIL — wisdomPayload is a string matching a foreign workspaceId', () => {
    const v = gate.check(
      cleanInput({ wisdomPayload: FOREIGN_1 }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$',
          detail: expect.stringContaining(FOREIGN_1),
        }),
      ]),
    );
  });

  it('5. FAIL — wisdomPayload object has workspaceId field with foreign UUID', () => {
    const v = gate.check(
      cleanInput({ wisdomPayload: { workspaceId: FOREIGN_1 } }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.workspaceId',
          detail: expect.stringContaining(FOREIGN_1),
        }),
      ]),
    );
  });

  it('6. FAIL — wisdomPayload object has workspace_id field with foreign UUID', () => {
    const v = gate.check(
      cleanInput({ wisdomPayload: { workspace_id: FOREIGN_2 } }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.workspace_id',
          detail: expect.stringContaining(FOREIGN_2),
        }),
      ]),
    );
  });

  it('7. FAIL — wisdomPayload nested object leaks workspaceId', () => {
    const v = gate.check(
      cleanInput({
        wisdomPayload: { meta: { workspaceId: FOREIGN_1 } },
      }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.meta.workspaceId',
          detail: expect.stringContaining(FOREIGN_1),
        }),
      ]),
    );
  });

  it('8. FAIL — wisdomPayload array item contains foreign workspaceId', () => {
    const v = gate.check(
      cleanInput({
        wisdomPayload: [
          { name: 'ok' },
          { workspaceId: FOREIGN_1 },
        ],
      }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: expect.stringContaining('workspaceId'),
          detail: expect.stringContaining(FOREIGN_1),
        }),
      ]),
    );
  });

  it('9. FAIL — recommendation item carries sourceWorkspaceId foreign to target', () => {
    const v = gate.check(
      cleanInput({
        recommendation: {
          recommendationId: 'rec_001',
          sourceWorkspaceIds: [FOREIGN_1],
          items: [{ workspaceId: FOREIGN_1 }],
        },
      }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.recommendation.items[0].workspaceId',
          detail: expect.stringContaining(FOREIGN_1),
        }),
      ]),
    );
  });

  it('10. FAIL — cross-workspace content with k-anonymity < 5 (cohort missing)', () => {
    const v = gate.check(
      cleanInput({
        recommendation: {
          recommendationId: 'rec_002',
          sourceWorkspaceIds: [FOREIGN_1],
        },
      }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.cohort.cohortSize',
          detail: expect.stringContaining('k-anonymity'),
        }),
      ]),
    );
  });

  it('11. FAIL — cross-workspace content with cohortSize = 3 (< 5)', () => {
    const v = gate.check(
      cleanInput({
        recommendation: {
          recommendationId: 'rec_003',
          sourceWorkspaceIds: [FOREIGN_1],
        },
        cohort: {
          cohortSize: 3,
          workspaceIds: [TARGET, FOREIGN_1, FOREIGN_2],
          diffPrivacyEpsilon: 0.5,
        },
      }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.cohort.cohortSize',
        }),
      ]),
    );
  });

  it('12. PASS — cross-workspace content with k-anonymity >= 5', () => {
    expect(
      gate.check(
        cleanInput({
          recommendation: {
            recommendationId: 'rec_004',
            sourceWorkspaceIds: [FOREIGN_1],
          },
          cohort: {
            cohortSize: 7,
            workspaceIds: [TARGET, FOREIGN_1, FOREIGN_2],
            diffPrivacyEpsilon: 0.5,
          },
        }),
      ).status,
    ).toBe('PASS');
  });

  it('13. FAIL — opt-out workspace present in recommendation cohort', () => {
    const v = gate.check(
      cleanInput({
        recommendation: {
          recommendationId: 'rec_005',
          sourceWorkspaceIds: [FOREIGN_1],
        },
        cohort: {
          cohortSize: 10,
          workspaceIds: [TARGET, FOREIGN_1, FOREIGN_2],
          optOutWorkspaces: [FOREIGN_1],
          diffPrivacyEpsilon: 0.5,
        },
      }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.cohort.workspaceIds',
          detail: expect.stringContaining('opt-out'),
        }),
      ]),
    );
  });

  it('14. PASS — opt-out respected: no opt-out workspaces in cohort', () => {
    expect(
      gate.check(
        cleanInput({
          recommendation: {
            recommendationId: 'rec_006',
            sourceWorkspaceIds: [FOREIGN_1],
          },
          cohort: {
            cohortSize: 8,
            workspaceIds: [TARGET, FOREIGN_2],
            optOutWorkspaces: [FOREIGN_1],
            diffPrivacyEpsilon: 0.5,
          },
        }),
      ).status,
    ).toBe('PASS');
  });

  it('15. FAIL — diff-privacy epsilon missing on cross-workspace recommendation', () => {
    const v = gate.check(
      cleanInput({
        recommendation: {
          recommendationId: 'rec_007',
          sourceWorkspaceIds: [FOREIGN_1],
        },
        cohort: {
          cohortSize: 6,
          workspaceIds: [TARGET, FOREIGN_1],
        },
      }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.cohort.diffPrivacyEpsilon',
          detail: expect.stringContaining('diff-privacy'),
        }),
      ]),
    );
  });

  it('16. FAIL — diff-privacy epsilon is zero', () => {
    const v = gate.check(
      cleanInput({
        recommendation: {
          recommendationId: 'rec_008',
          sourceWorkspaceIds: [FOREIGN_1],
        },
        cohort: {
          cohortSize: 5,
          workspaceIds: [TARGET, FOREIGN_1],
          diffPrivacyEpsilon: 0,
        },
      }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.cohort.diffPrivacyEpsilon',
        }),
      ]),
    );
  });

  it('17. FAIL — multiple violations: workspaceId leak + k-anon < 5 + no epsilon', () => {
    const v = gate.check(
      cleanInput({
        wisdomPayload: { workspaceId: FOREIGN_1 },
        recommendation: {
          recommendationId: 'rec_009',
          sourceWorkspaceIds: [FOREIGN_2],
        },
        cohort: {
          cohortSize: 2,
          workspaceIds: [TARGET, FOREIGN_1],
          optOutWorkspaces: [],
        },
      }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.reason).toContain('3');
    expect(v.evidence).toHaveLength(3);
    expect(v.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.workspaceId' }),
        expect.objectContaining({ path: '$.cohort.cohortSize' }),
        expect.objectContaining({ path: '$.cohort.diffPrivacyEpsilon' }),
      ]),
    );
  });

  it('18. PASS — recommendation with items but all in same workspace, no cross-workspace content', () => {
    expect(
      gate.check(
        cleanInput({
          recommendation: {
            recommendationId: 'rec_010',
            items: [{ name: 'item_1' }, { name: 'item_2' }],
          },
          cohort: {
            cohortSize: 5,
            workspaceIds: [TARGET],
            diffPrivacyEpsilon: 0.5,
          },
        }),
      ).status,
    ).toBe('PASS');
  });
});
