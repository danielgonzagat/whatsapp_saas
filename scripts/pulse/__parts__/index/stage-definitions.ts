type PulseIndexStageId =
  | 'full-scan'
  | 'runtime-evidence'
  | 'observability-evidence'
  | 'recovery-evidence'
  | 'declared-flows'
  | 'declared-invariants'
  | 'synthetic-actors'
  | 'self-trust-verification'
  | 'final-certification'
  | 'external-sources-orchestration';

type StageArtifactOverrideSource = 'certification' | 'externalSignalState' | 'empty';

type StageArtifactOverrideDescriptor = {
  path: string;
  source: StageArtifactOverrideSource;
  objective: string;
};

type PulseIndexStageDescriptor = {
  id: PulseIndexStageId;
  objective: string;
  dependencies: PulseIndexStageId[];
  artifactOverrides?: StageArtifactOverrideDescriptor[];
};

const PULSE_INDEX_STAGE_DESCRIPTORS: PulseIndexStageDescriptor[] = [
  {
    id: 'full-scan',
    objective:
      'discover codebase, manifest, parser inventory, baseline health, and initial certification inputs',
    dependencies: [],
  },
  {
    id: 'runtime-evidence',
    objective: 'collect registered runtime probes selected by the active profile',
    dependencies: ['full-scan'],
  },
  {
    id: 'observability-evidence',
    objective: 'derive observability proof from the registered runtime evidence surface',
    dependencies: ['runtime-evidence'],
  },
  {
    id: 'recovery-evidence',
    objective: 'derive recovery proof from repository operations evidence',
    dependencies: ['runtime-evidence'],
  },
  {
    id: 'declared-flows',
    objective: 'execute manifest-declared flow checks selected by target metadata',
    dependencies: ['full-scan', 'runtime-evidence'],
  },
  {
    id: 'declared-invariants',
    objective: 'evaluate manifest-declared invariant checks selected by target metadata',
    dependencies: ['full-scan'],
  },
  {
    id: 'synthetic-actors',
    objective: 'execute synthetic actor scenarios requested by manifest/profile metadata',
    dependencies: ['full-scan', 'runtime-evidence', 'declared-flows', 'declared-invariants'],
  },
  {
    id: 'self-trust-verification',
    objective: 'verify cross-artifact consistency using fresh registered in-memory artifacts',
    dependencies: [
      'full-scan',
      'runtime-evidence',
      'declared-flows',
      'declared-invariants',
      'synthetic-actors',
    ],
    artifactOverrides: [
      {
        path: 'PULSE_CERTIFICATE.json',
        source: 'certification',
        objective: 'avoid stale disk reads for the current certificate snapshot',
      },
      {
        path: 'PULSE_CLI_DIRECTIVE.json',
        source: 'empty',
        objective: 'reserve directive slot until output publication writes fresh data',
      },
      {
        path: 'PULSE_ARTIFACT_INDEX.json',
        source: 'empty',
        objective: 'reserve artifact-index slot until output publication writes fresh data',
      },
      {
        path: '.pulse/current/PULSE_AUTONOMY_PROOF.json',
        source: 'empty',
        objective: 'reserve autonomy-proof slot until output publication writes fresh data',
      },
      {
        path: '.pulse/current/PULSE_AUTONOMY_STATE.json',
        source: 'empty',
        objective: 'reserve autonomy-state slot until output publication writes fresh data',
      },
      {
        path: '.pulse/current/PULSE_AGENT_ORCHESTRATION_STATE.json',
        source: 'empty',
        objective: 'reserve agent-orchestration slot until output publication writes fresh data',
      },
      {
        path: '.pulse/current/PULSE_EXTERNAL_SIGNAL_STATE.json',
        source: 'externalSignalState',
        objective: 'attach fresh external signal state derived before self-trust',
      },
      {
        path: '.pulse/current/PULSE_CONVERGENCE_PLAN.json',
        source: 'empty',
        objective: 'reserve convergence-plan slot until output publication writes fresh data',
      },
      {
        path: '.pulse/current/PULSE_PRODUCT_VISION.json',
        source: 'empty',
        objective: 'reserve product-vision slot until output publication writes fresh data',
      },
    ],
  },
  {
    id: 'final-certification',
    objective: 'compute final certification from registered evidence and self-trust output',
    dependencies: ['self-trust-verification'],
  },
  {
    id: 'external-sources-orchestration',
    objective: 'collect registered live external adapter evidence for final derived outputs',
    dependencies: ['final-certification'],
  },
];

const PULSE_INDEX_STAGE_REGISTRY = new Map(
  PULSE_INDEX_STAGE_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor]),
);

function getRegisteredStage(stageId: PulseIndexStageId): PulseIndexStageDescriptor {
  const descriptor = PULSE_INDEX_STAGE_REGISTRY.get(stageId);
  if (!descriptor) {
    throw new Error(`PULSE stage is not registered: ${stageId}`);
  }
  return descriptor;
}

function buildStageMetadata(
  stageId: PulseIndexStageId,
  metadata: Record<string, string | number | boolean> = {},
): Record<string, string | number | boolean> {
  const stage = getRegisteredStage(stageId);
  return {
    registeredStage: stage.id,
    objective: stage.objective,
    dependencies: stage.dependencies.length > 0 ? stage.dependencies.join(',') : 'none',
    ...metadata,
  };
}

function printRegisteredStagePlan(humanReadableOutput: boolean): void {
  if (!humanReadableOutput) {
    return;
  }

  console.log('  Registered stages/dependencies/objective:');
  for (const stage of PULSE_INDEX_STAGE_DESCRIPTORS) {
    const dependencies = stage.dependencies.length > 0 ? stage.dependencies.join(', ') : 'none';
    console.log(
      `    - ${stage.id} | dependencies: ${dependencies} | objective: ${stage.objective}`,
    );
  }
}

function cloneObjectRecord(value: object): Record<string, unknown> {
  return { ...(value as Record<string, unknown>) };
}

function buildRegisteredArtifactOverrides(input: {
  stageId: PulseIndexStageId;
  certification: object;
  externalSignalState: object;
}): Record<string, Record<string, unknown>> {
  const stage = getRegisteredStage(input.stageId);
  const overrideDescriptors = stage.artifactOverrides || [];
  return Object.fromEntries(
    overrideDescriptors.map((descriptor) => {
      const payload =
        descriptor.source === 'certification'
          ? cloneObjectRecord(input.certification)
          : descriptor.source === 'externalSignalState'
            ? cloneObjectRecord(input.externalSignalState)
            : {};
      return [descriptor.path, payload];
    }),
  );
}

export {
  PULSE_INDEX_STAGE_DESCRIPTORS,
  PULSE_INDEX_STAGE_REGISTRY,
  buildRegisteredArtifactOverrides,
  buildStageMetadata,
  printRegisteredStagePlan,
  getRegisteredStage,
};

export type { PulseIndexStageDescriptor, PulseIndexStageId };
