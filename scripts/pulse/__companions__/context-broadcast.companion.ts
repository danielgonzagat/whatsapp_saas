export function buildGitNexusSnapshot(rootDir: string, generatedAt: string): PulseContextSnapshot {
  const commit = currentCommit(rootDir);
  const indexPath = safeJoin(rootDir, '.gitnexus');
  const statusPath = safeJoin(indexPath, 'status.json');
  const metaPath = safeJoin(indexPath, 'meta.json');
  const cliWarnings: string[] = [];
  const errors: string[] = [];

  const cli = spawnSync('npx', ['-y', 'gitnexus@latest', '--version'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15_000,
  });
  let snapshot = buildGitNexusLocalSnapshot({
    rootDir,
    commit,
    indexPath,
    statusPath,
    metaPath,
  });
  let metadata = snapshot.metadata;
  metadata.cliAvailable = cli.status === 0;
  if (cli.status !== 0) {
    cliWarnings.push('GitNexus CLI version probe did not succeed.');
    if (cli.stderr) {
      errors.push(compact(cli.stderr, 240));
    }
  }

  const reindex = attemptGitNexusReindex({
    rootDir,
    cliAvailable: cli.status === 0,
    status: snapshot.status,
  });
  metadata.reindexEligible = reindex.eligible;
  metadata.reindexAttempted = reindex.attempted;
  metadata.reindexCommand = reindex.command;
  metadata.reindexExitCode = reindex.exitCode;
  metadata.reindexDurationMs = reindex.durationMs;
  metadata.reindexSkippedReason = reindex.skippedReason;
  if (reindex.stderr) {
    errors.push(reindex.stderr);
  }

  if (reindex.attempted) {
    const refreshedSnapshot = buildGitNexusLocalSnapshot({
      rootDir,
      commit,
      indexPath,
      statusPath,
      metaPath,
    });
    metadata = {
      ...refreshedSnapshot.metadata,
      cliAvailable: metadata.cliAvailable,
      reindexEligible: metadata.reindexEligible,
      reindexAttempted: metadata.reindexAttempted,
      reindexCommand: metadata.reindexCommand,
      reindexExitCode: metadata.reindexExitCode,
      reindexDurationMs: metadata.reindexDurationMs,
      reindexSkippedReason: metadata.reindexSkippedReason,
      postReindexStatus: refreshedSnapshot.status,
      postReindexRef: refreshedSnapshot.ref,
      postReindexFresh: refreshedSnapshot.status === 'ready',
    };
    snapshot = {
      ...refreshedSnapshot,
      sourceMode: 'cli',
      metadata,
      warnings: refreshedSnapshot.warnings,
    };
  }

  return {
    provider: 'gitnexus',
    status: snapshot.status,
    generatedAt,
    ref: snapshot.ref,
    currentCommit: commit,
    sourceMode: snapshot.sourceMode,
    summary:
      reindex.attempted && snapshot.status === 'ready'
        ? `GitNexus reindex refreshed local index for HEAD ${commit?.slice(0, 8) ?? 'unknown'}.`
        : snapshot.summary,
    warnings: [...cliWarnings, ...snapshot.warnings],
    errors,
    metadata,
  };
}

export function buildBeadsSnapshot(rootDir: string, generatedAt: string): PulseContextSnapshot {
  const commit = currentCommit(rootDir);
  const beadsDir = safeJoin(rootDir, '.beads');
  const issuesPath = safeJoin(beadsDir, 'issues.jsonl');
  const interactionsPath = safeJoin(beadsDir, 'interactions.jsonl');
  const warnings: string[] = [];
  const errors: string[] = [];
  const metadata: Record<string, string | number | boolean | null> = {
    beadsDirExists: pathExists(beadsDir),
    issuesPath: path.relative(rootDir, issuesPath),
  };

  if (!pathExists(beadsDir) || !pathExists(issuesPath)) {
    warnings.push('beads local state is missing.');
    return {
      provider: 'beads',
      status: 'missing',
      generatedAt,
      ref: 'beads:missing',
      currentCommit: commit,
      sourceMode: 'missing',
      summary: 'beads local state is missing.',
      warnings,
      errors,
      metadata,
    };
  }

  const issuesText = readTextFile(issuesPath, 'utf8');
  const issueLines = issuesText.split('\n').filter((line) => line.trim().length > 0);
  const interactions = pathExists(interactionsPath)
    ? readTextFile(interactionsPath, 'utf8')
        .split('\n')
        .filter((line) => line.trim().length > 0)
    : [];
  const touchedAt =
    fileMtimeIso(safeJoin(beadsDir, 'last-touched')) || fileMtimeIso(issuesPath) || generatedAt;
  metadata.issueCount = issueLines.length;
  metadata.interactionCount = interactions.length;
  metadata.touchedAt = touchedAt;

  return {
    provider: 'beads',
    status: 'ready',
    generatedAt,
    ref: `beads:${sha256({ issueLines, touchedAt }).slice(0, 16)}`,
    currentCommit: commit,
    sourceMode: 'local_files',
    summary: `beads local state loaded with ${issueLines.length} issue row(s).`,
    warnings,
    errors,
    metadata,
  };
}

function unitValidationContract(unit: QueueUnit): string[] {
  return uniqueStrings([
    ...unit.validationArtifacts,
    ...unit.exitCriteria,
    ...unit.gateNames.map((gate) => `gate:${gate}`),
  ]);
}

function unitStopConditions(unit: QueueUnit, staleContextBlocksExecution: boolean): string[] {
  return uniqueStrings([
    staleContextBlocksExecution ? 'Context digest changed or snapshot is stale.' : '',
    'Attempted write outside ownedFiles.',
    'Attempted write to forbiddenFiles or governance-protected surface.',
    unit.executionMode !== 'ai_safe' ? 'Unit is not ai_safe.' : '',
  ]);
}

function leaseId(runId: string, workerId: string, unitId: string): string {
  return `lease-${sha256({ runId, workerId, unitId }).slice(0, 18)}`;
}

function workerId(index: number): string {
  return `pulse-worker-${String(index + 1).padStart(2, '0')}`;
}

function workstreamId(unit: QueueUnit): string {
  return `${unit.kind}:${unit.ownerLane}`;
}

function buildContextDigest(input: {
  runId: string;
  gitnexusRef: string;
  beadsRef: string;
  directiveRef: string;
  certificateRef: string;
  unitIds: string[];
  protectedFiles: string[];
}): string {
  return sha256(input);
}

function loadPreviousContextDigest(rootDir: string): string | null {
  const previousPath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_CONTEXT_BROADCAST.json');
  const previous = readJsonRecord(previousPath);
  return typeof previous?.contextDigest === 'string' ? previous.contextDigest : null;
}

export function buildPulseContextFabricBundle(input: {
  rootDir: string;
  registry: PulseArtifactRegistry;
  convergencePlan: PulseConvergencePlan;
  runId: string;
  directiveContent: string;
  certificateContent: string;
  workerCount?: number;
}): PulseContextFabricBundle {
  const generatedAt = new Date().toISOString();
  const protectedConfig = readProtectedGovernanceConfig(input.rootDir);
  const forbiddenFiles = protectedForbiddenFiles(protectedConfig);
  const gitnexusState = buildGitNexusSnapshot(input.rootDir, generatedAt);
  const beadsState = buildBeadsSnapshot(input.rootDir, generatedAt);
  const units = buildDecisionQueue(input.convergencePlan)
    .filter((unit) => unit.executionMode === 'ai_safe')
    .slice(0, input.workerCount ?? DEFAULT_WORKER_COUNT);
  const directiveRef = `PULSE_CLI_DIRECTIVE.json#${sha256(input.directiveContent).slice(0, 16)}`;
  const certificateRef = `PULSE_CERTIFICATE.json#${sha256(input.certificateContent).slice(0, 16)}`;
  const staleContextBlocksExecution =
    gitnexusState.status === 'stale' ||
    gitnexusState.status === 'missing' ||
    beadsState.status === 'stale' ||
    beadsState.status === 'missing';
  const contextDigest = buildContextDigest({
    runId: input.runId,
    gitnexusRef: gitnexusState.ref,
    beadsRef: beadsState.ref,
    directiveRef,
    certificateRef,
    unitIds: units.map((unit) => unit.id),
    protectedFiles: forbiddenFiles,
  });
  const expiresAt = new Date(Date.now() + CONTEXT_TTL_MINUTES * 60_000).toISOString();
  const assignedFiles = new Set<string>();
  const mutableOwners = new Map<string, string>();

  const leases: PulseWorkerLease[] = [];
  const workers: WorkerContextEnvelope[] = units.map((unit, index) => {
    const id = workerId(index);
    const normalizedRelatedFiles = uniqueLeasePaths(input.rootDir, unit.relatedFiles);
    const mutableCandidates = normalizedRelatedFiles.filter(
      (filePath) => !isProtectedFile(filePath, protectedConfig),
    );
    const duplicateReadOnly: string[] = [];
    const ownedFiles: string[] = [];

    for (const filePath of mutableCandidates) {
      if (assignedFiles.has(filePath)) {
        duplicateReadOnly.push(filePath);
      } else {
        assignedFiles.add(filePath);
        mutableOwners.set(filePath, id);
        ownedFiles.push(filePath);
      }
    }

    const readOnlyFiles = uniqueStrings([
      ...duplicateReadOnly,
      ...unit.validationArtifacts,
      ...unit.artifactPaths,
      ...normalizedRelatedFiles.filter((filePath) => isProtectedFile(filePath, protectedConfig)),
      'PULSE_CONTEXT_BROADCAST.json',
      'PULSE_WORKER_LEASES.json',
      'PULSE_GITNEXUS_STATE.json',
      'PULSE_BEADS_STATE.json',
    ]);
    const conflictReasons =
      duplicateReadOnly.length > 0
        ? duplicateReadOnly.map(
            (filePath) =>
              `${filePath} already leased to ${mutableOwners.get(filePath) ?? 'another worker'}.`,
          )
        : [];
    const currentLeaseId = leaseId(input.runId, id, unit.id);
    const lease: PulseWorkerLease = {
      leaseId: currentLeaseId,
      workerId: id,
      unitId: unit.id,
      ownedFiles,
      readOnlyFiles,
      forbiddenFiles,
      expiresAt,
      status: 'active',
      conflictReasons,
    };
    leases.push(lease);
    return {
      workerId: id,
      workstreamId: workstreamId(unit),
      unitId: unit.id,
      leaseId: currentLeaseId,
      leaseStatus: lease.status,
      leaseExpiresAt: lease.expiresAt,
      contextDigest,
      ownedFiles,
      readOnlyFiles,
      forbiddenFiles,
      affectedCapabilities: unit.affectedCapabilityIds,
      affectedFlows: unit.affectedFlowIds,
      gitnexusDelta: gitnexusState,
      beadsDelta: beadsState,
      validationContract: unitValidationContract(unit),
      stopConditions: unitStopConditions(unit, staleContextBlocksExecution),
    };
  });

  const previousDigest = loadPreviousContextDigest(input.rootDir);
  const blockers = [
    gitnexusState.status !== 'ready' ? `gitnexus:${gitnexusState.status}` : '',
    beadsState.status !== 'ready' ? `beads:${beadsState.status}` : '',
  ].filter(Boolean);
  return {
    gitnexusState,
    beadsState,
    broadcast: {
      generatedAt,
      runId: input.runId,
      contextDigest,
      gitnexusRef: gitnexusState.ref,
      beadsRef: beadsState.ref,
      directiveRef,
      certificateRef,
      workers,
    },
    leases: {
      generatedAt,
      runId: input.runId,
      contextDigest,
      ttlMinutes: CONTEXT_TTL_MINUTES,
      leases,
      ownershipConflictPass: workers.every((worker) =>
        worker.ownedFiles.every(
          (filePath) =>
            workers.filter((candidate) => candidate.ownedFiles.includes(filePath)).length === 1,
        ),
      ),
      protectedFilesForbiddenPass:
        workers.every((worker) =>
          forbiddenFiles.every((filePath) => worker.forbiddenFiles.includes(filePath)),
        ) &&
        workers.every((worker) =>
          worker.ownedFiles.every(
            (filePath) =>
              normalizeLeasePath(input.rootDir, filePath) === filePath &&
              !isProtectedFile(filePath, protectedConfig),
          ),
        ),
    },
    delta: {
      generatedAt,
      runId: input.runId,
      contextDigest,
      previousDigest,
      changed: previousDigest !== null && previousDigest !== contextDigest,
      staleContextBlocksExecution,
      blockers,
    },
  };
}

export function buildDirectiveContextFabricPatch(
  bundle: PulseContextFabricBundle,
): Record<string, unknown> {
  return {
    broadcastRef: 'PULSE_CONTEXT_BROADCAST.json',
    leasesRef: 'PULSE_WORKER_LEASES.json',
    gitnexusRef: bundle.broadcast.gitnexusRef,
    beadsRef: bundle.broadcast.beadsRef,
    contextDigest: bundle.broadcast.contextDigest,
    workerEnvelopeCount: bundle.broadcast.workers.length,
    contextBroadcastPass: bundle.broadcast.workers.length >= DEFAULT_WORKER_COUNT,
    ownershipConflictPass: bundle.leases.ownershipConflictPass,
    protectedFilesForbiddenPass: bundle.leases.protectedFilesForbiddenPass,
    workerContextCompletenessPass: bundle.broadcast.workers.every(
      (worker) =>
        worker.leaseId &&
        worker.contextDigest &&
        worker.validationContract.length > 0 &&
        worker.stopConditions.length > 0,
    ),
    staleContextBlocksExecution: bundle.delta.staleContextBlocksExecution,
    blockers: bundle.delta.blockers,
  };
}

