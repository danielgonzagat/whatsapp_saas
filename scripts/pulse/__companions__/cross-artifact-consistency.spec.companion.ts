describe('checkConsistency – nextExecutableUnits proof-debt drift', () => {
  it('fails when proof debt exists and the prioritized executable unit points to product files', () => {
    const cli = makeArtifact('PULSE_CLI_DIRECTIVE.json', {
      authorityMode: 'autonomous-execution',
      autonomyReadiness: { canWorkNow: true, canDeclareComplete: false },
      productionAutonomyVerdict: 'NAO',
      zeroPromptProductionGuidanceVerdict: 'NAO',
      nextExecutableUnits: [
        {
          id: 'capability-checkout',
          kind: 'capability',
          source: 'pulse',
          executionMode: 'ai_safe',
          productImpact: 'material',
          ownerLane: 'product',
          title: 'Materialize checkout capability',
          relatedFiles: ['backend/src/checkout/checkout.service.ts'],
          validationTargets: ['PULSE_CERTIFICATE.json'],
        },
      ],
      generatedAt: '2026-04-25T03:15:42.931Z',
    });
    const proof = makeArtifact('.pulse/current/PULSE_AUTONOMY_PROOF.json', {
      verdicts: {
        productionAutonomy: 'NAO',
        zeroPromptProductionGuidance: 'NAO',
        canDeclareComplete: false,
      },
      generatedAt: '2026-04-25T03:15:42.931Z',
    });

    const result = checkConsistency([cli, proof]);

    expect(result.pass).toBe(false);
    const div = result.divergences.find((d) => d.field === 'nextExecutableUnits.proofDebtDrift');
    expect(div).toBeDefined();
    expect(div!.values['PULSE_CLI_DIRECTIVE.json']).toMatchObject({
      authorityMode: 'autonomous-execution',
      canWorkNow: true,
      prioritizedUnitId: 'capability-checkout',
      productFiles: ['backend/src/checkout/checkout.service.ts'],
    });
  });

  it('passes when proof debt exists but the prioritized executable unit is PULSE machine work', () => {
    const cli = makeArtifact('PULSE_CLI_DIRECTIVE.json', {
      authorityMode: 'autonomous-execution',
      autonomyReadiness: { canWorkNow: true, canDeclareComplete: false },
      productionAutonomyVerdict: 'NAO',
      zeroPromptProductionGuidanceVerdict: 'NAO',
      nextExecutableUnits: [
        {
          id: 'pulse-machine-critical-proof',
          kind: 'pulse_machine',
          source: 'pulse_machine',
          executionMode: 'ai_safe',
          productImpact: 'machine',
          ownerLane: 'pulse-core',
          title: 'Close critical path proof',
          relatedFiles: ['scripts/pulse/path-coverage-engine.ts'],
          validationTargets: ['PULSE_EXECUTION_MATRIX.json'],
        },
        {
          id: 'capability-checkout',
          kind: 'capability',
          source: 'pulse',
          executionMode: 'ai_safe',
          productImpact: 'material',
          ownerLane: 'product',
          title: 'Materialize checkout capability',
          relatedFiles: ['backend/src/checkout/checkout.service.ts'],
          validationTargets: ['PULSE_CERTIFICATE.json'],
        },
      ],
      generatedAt: '2026-04-25T03:15:42.931Z',
    });
    const proof = makeArtifact('.pulse/current/PULSE_AUTONOMY_PROOF.json', {
      verdicts: {
        productionAutonomy: 'NAO',
        zeroPromptProductionGuidance: 'NAO',
        canDeclareComplete: false,
      },
      generatedAt: '2026-04-25T03:15:42.931Z',
    });

    const result = checkConsistency([cli, proof]);

    expect(
      result.divergences.find((d) => d.field === 'nextExecutableUnits.proofDebtDrift'),
    ).toBeUndefined();
  });

  it('detects missing_evidence gates as proof debt before product-file work', () => {
    const cli = makeArtifact('PULSE_CLI_DIRECTIVE.json', {
      authorityMode: 'autonomous-execution',
      autonomyReadiness: { canWorkNow: true, canDeclareComplete: false },
      nextExecutableUnits: [
        {
          id: 'capability-admin',
          kind: 'capability',
          source: 'pulse',
          executionMode: 'ai_safe',
          productImpact: 'material',
          ownerLane: 'product',
          title: 'Materialize admin capability',
          ownedFiles: ['frontend-admin/src/app/(admin)/contas/page.tsx'],
          validationTargets: ['PULSE_CERTIFICATE.json'],
        },
      ],
      generatedAt: '2026-04-25T03:15:42.931Z',
    });
    const cert = makeArtifact('PULSE_CERTIFICATE.json', {
      gates: {
        soakPass: {
          status: 'fail',
          failureClass: 'missing_evidence',
          reason: 'No observed soak evidence.',
        },
      },
      timestamp: '2026-04-25T03:15:42.931Z',
    });

    const result = checkConsistency([cli, cert]);
    const div = result.divergences.find((d) => d.field === 'nextExecutableUnits.proofDebtDrift');

    expect(div).toBeDefined();
    expect(div!.sources).toContain('PULSE_CERTIFICATE.json');
    expect(div!.values['PULSE_CLI_DIRECTIVE.json']).toMatchObject({
      productFiles: ['frontend-admin/src/app/(admin)/contas/page.tsx'],
    });
  });
});

