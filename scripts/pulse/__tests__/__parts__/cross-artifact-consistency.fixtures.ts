export function makeArtifact(
  filePath: string,
  data: Record<string, unknown>,
): { filePath: string; data: Record<string, unknown> } {
  return { filePath, data };
}

/** Shared "good" base values so every test starts from a consistent baseline. */
export const GOOD_CERT = makeArtifact('PULSE_CERTIFICATE.json', {
  status: 'PARTIAL',
  humanReplacementStatus: 'NOT_READY',
  score: 65,
  blockingTier: 1,
  timestamp: '2026-04-25T03:15:42.931Z',
});

export const GOOD_CLI = makeArtifact('PULSE_CLI_DIRECTIVE.json', {
  authorityMode: 'autonomous-execution',
  advisoryOnly: false,
  automationEligible: true,
  productionAutonomyVerdict: 'NAO',
  zeroPromptProductionGuidanceVerdict: 'SIM',
  generatedAt: '2026-04-25T03:15:42.931Z',
});

export const GOOD_INDEX = makeArtifact('PULSE_ARTIFACT_INDEX.json', {
  authorityMode: 'autonomous-execution',
  advisoryOnly: false,
  generatedAt: '2026-04-25T03:15:42.931Z',
});

export const GOOD_PROOF = makeArtifact('.pulse/current/PULSE_AUTONOMY_PROOF.json', {
  authorityMode: 'autonomous-execution',
  advisoryOnly: false,
  automationEligible: true,
  generatedAt: '2026-04-25T03:15:42.931Z',
  productionAutonomyAnswer: 'NAO',
  zeroPromptProductionGuidanceAnswer: 'SIM',
  verdicts: {
    productionAutonomy: 'NAO',
    zeroPromptProductionGuidance: 'SIM',
    canDeclareComplete: false,
  },
  cycleProof: {
    proven: false,
  },
});

export const GOOD_CONVERGENCE = makeArtifact('.pulse/current/PULSE_CONVERGENCE_PLAN.json', {
  status: 'PARTIAL',
  humanReplacementStatus: 'NOT_READY',
  blockingTier: 1,
  generatedAt: '2026-04-25T03:15:42.931Z',
});
