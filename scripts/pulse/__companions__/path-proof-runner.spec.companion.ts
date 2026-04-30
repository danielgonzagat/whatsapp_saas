describe('buildPathProofPlan', () => {
  it('has no hardcoded reality audit findings in the path proof runner', () => {
    const result = auditPulseNoHardcodedReality(process.cwd());
    const pathProofRunnerFindings = result.findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/path-proof-runner.ts',
    );

    expect(pathProofRunnerFindings).toEqual([]);
  });

  it('materializes terminal critical paths as planned proof tasks without observed evidence', () => {
    const rootDir = makeTempRoot();
    const matrix = makeMatrix([makeMatrixPath()]);
    const coverage = buildPathCoverageState(rootDir, matrix);
    const plan = buildPathProofPlan(rootDir, {
      matrix,
      pathCoverage: coverage,
      generatedAt: '2026-04-29T12:00:00.000Z',
    });
    const task = plan.tasks[0];
    const writtenPlan = JSON.parse(
      fs.readFileSync(path.join(rootDir, '.pulse/current/PULSE_PATH_PROOF_TASKS.json'), 'utf8'),
    ) as { tasks: Array<{ pathId: string; executed: boolean }> };

    expect(plan.summary).toEqual({
      terminalWithoutObservedEvidence: 1,
      plannedTasks: 1,
      executableTasks: 1,
      humanRequiredTasks: 0,
      notExecutableTasks: 0,
    });
    expect(task).toEqual(
      expect.objectContaining({
        taskId: 'path-proof:endpoint:matrix-path-critical-checkout',
        pathId: 'matrix:path:critical-checkout',
        mode: 'endpoint',
        status: 'planned',
        executed: false,
        coverageCountsAsObserved: false,
        autonomousExecutionAllowed: true,
        sourceStatus: 'inferred_only',
      }),
    );
    expect(task.command).toContain('execute generated probe blueprint .pulse/frontier/');
    expect(task.artifactLinks).toEqual(
      expect.arrayContaining([
        {
          artifactPath: '.pulse/current/PULSE_EXECUTION_MATRIX.json',
          relationship: 'source_matrix',
        },
        { artifactPath: '.pulse/current/PULSE_PATH_COVERAGE.json', relationship: 'coverage_state' },
        {
          artifactPath: '.pulse/current/PULSE_PATH_PROOF_TASKS.json',
          relationship: 'proof_task_plan',
        },
        expect.objectContaining({ relationship: 'probe_blueprint' }),
      ]),
    );
    expect(coverage.paths[0].classification).toBe('probe_blueprint_generated');
    expect(coverage.paths[0].evidenceMode).toBe('blueprint');
    expect(coverage.paths[0].lastProbed).toBeNull();
    expect(writtenPlan.tasks[0]).toEqual(
      expect.objectContaining({ pathId: task.pathId, executed: false }),
    );
  });

  it('does not replan terminal paths when fresh observed path proof already exists', () => {
    const rootDir = makeTempRoot();
    const pulseDir = path.join(rootDir, '.pulse', 'current');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'PULSE_PATH_PROOF_EVIDENCE.json'),
      JSON.stringify({
        tasks: [
          {
            taskId: 'path-proof:endpoint:matrix-path-critical-checkout',
            pathId: 'matrix:path:critical-checkout',
            observed: true,
            coverageCountsAsObserved: true,
            disposition: 'observed_pass',
            evidenceState: 'observed',
            freshness: {
              status: 'fresh',
              observedAt: '2026-04-29T12:01:00.000Z',
            },
            observedEvidenceLink: {
              observedAt: '2026-04-29T12:01:00.000Z',
            },
          },
        ],
      }),
    );

    const plan = buildPathProofPlan(rootDir, {
      matrix: makeMatrix([makeMatrixPath()]),
      generatedAt: '2026-04-29T12:02:00.000Z',
      writeArtifact: false,
    });

    expect(plan.summary).toEqual({
      terminalWithoutObservedEvidence: 0,
      plannedTasks: 0,
      executableTasks: 0,
      humanRequiredTasks: 0,
      notExecutableTasks: 0,
    });
    expect(plan.tasks).toEqual([]);
  });

  it('assigns deterministic proof task modes for all terminal path classes', () => {
    const rootDir = makeTempRoot();
    const matrix = makeMatrix([
      makeMatrixPath({
        pathId: 'z-endpoint',
        routePatterns: ['/api/orders'],
      }),
      makeMatrixPath({
        pathId: 'a-ui',
        routePatterns: [],
        entrypoint: {
          nodeId: 'ui:orders',
          filePath: 'frontend/src/app/orders/page.tsx',
          routePattern: null,
          description: 'orders page',
        },
        filePaths: ['frontend/src/app/orders/page.tsx'],
      }),
      makeMatrixPath({
        pathId: 'b-worker',
        routePatterns: [],
        chain: [
          {
            role: 'worker',
            nodeId: 'worker:sync',
            filePath: 'worker/src/sync.worker.ts',
            description: 'sync queue worker',
            truthMode: 'inferred',
          },
        ],
        entrypoint: {
          nodeId: 'worker:sync',
          filePath: 'worker/src/sync.worker.ts',
          routePattern: null,
          description: 'sync queue worker',
        },
        filePaths: ['worker/src/sync.worker.ts'],
      }),
      makeMatrixPath({
        pathId: 'c-webhook',
        routePatterns: ['/stripe/webhook'],
        chain: [
          {
            role: 'side_effect',
            nodeId: 'webhook:stripe',
            filePath: 'backend/src/stripe/webhook.controller.ts',
            description: 'provider callback side effect',
            truthMode: 'inferred',
          },
        ],
        requiredEvidence: [
          {
            kind: 'external',
            required: true,
            reason: 'Provider callback must be proven by external signal evidence.',
          },
        ],
      }),
      makeMatrixPath({
        pathId: 'd-function',
        routePatterns: [],
        chain: [
          {
            role: 'orchestration',
            nodeId: 'fn:score',
            filePath: 'scripts/pulse/scoring.ts',
            description: 'score function',
            truthMode: 'inferred',
          },
        ],
        entrypoint: {
          nodeId: 'fn:score',
          filePath: 'scripts/pulse/scoring.ts',
          routePattern: null,
          description: 'score function',
        },
        filePaths: ['scripts/pulse/scoring.ts'],
      }),
      makeMatrixPath({
        pathId: 'e-not-executable',
        status: 'not_executable',
        routePatterns: [],
        entrypoint: {
          nodeId: null,
          filePath: 'scripts/pulse/inventory.ts',
          routePattern: null,
          description: 'inventory file',
        },
        filePaths: ['scripts/pulse/inventory.ts'],
      }),
      makeMatrixPath({
        pathId: 'f-human-required',
        routePatterns: [],
        executionMode: 'observation_only',
        entrypoint: {
          nodeId: 'ops:gate',
          filePath: 'scripts/ops/check-governance-boundary.mjs',
          routePattern: null,
          description: 'governance gate',
        },
        filePaths: ['scripts/ops/check-governance-boundary.mjs'],
      }),
      makeMatrixPath({
        pathId: 'observed-excluded',
        status: 'observed_pass',
        observedEvidence: [
          {
            source: 'runtime',
            artifactPath: 'PULSE_RUNTIME_EVIDENCE.json',
            executed: true,
            status: 'passed',
            summary: 'Runtime probe passed.',
          },
        ],
      }),
    ]);

    const plan = buildPathProofPlan(rootDir, {
      matrix,
      generatedAt: '2026-04-29T12:00:00.000Z',
      writeArtifact: false,
    });
    const modesByPath = new Map(plan.tasks.map((task) => [task.pathId, task.mode]));
    const expectedModes: Array<[string, PathProofTaskMode]> = [
      ['a-ui', 'ui'],
      ['b-worker', 'worker'],
      ['c-webhook', 'webhook'],
      ['d-function', 'function'],
      ['z-endpoint', 'endpoint'],
    ];

    expect(plan.tasks.map((task) => task.pathId)).toEqual(expectedModes.map(([pathId]) => pathId));
    expect([...modesByPath.entries()]).toEqual(expectedModes);
    expect(plan.tasks.every((task) => task.status === 'planned' && !task.executed)).toBe(true);
    expect(plan.tasks.every((task) => !task.coverageCountsAsObserved)).toBe(true);
    expect(modesByPath.has('observed-excluded')).toBe(false);
    expect(plan.summary).toEqual(
      expect.objectContaining({
        terminalWithoutObservedEvidence: 5,
        plannedTasks: 5,
        executableTasks: 5,
        humanRequiredTasks: 0,
        notExecutableTasks: 0,
      }),
    );
  });

  it('derives protected path proof blocking from the governance manifest', () => {
    const unprotectedRootDir = makeTempRoot();
    const protectedRootDir = makeTempRoot();
    fs.mkdirSync(path.join(protectedRootDir, 'ops'), { recursive: true });
    fs.writeFileSync(
      path.join(protectedRootDir, 'ops/protected-governance-files.json'),
      JSON.stringify({
        protectedExact: [],
        protectedPrefixes: ['custom-governance/'],
      }),
    );

    const pathFromDiscoveredGovernanceManifest = makeMatrixPath({
      pathId: 'custom-governance-path',
      routePatterns: [],
      entrypoint: {
        nodeId: 'custom:governance',
        filePath: 'custom-governance/rule.ts',
        routePattern: null,
        description: 'custom governance rule',
      },
      breakpoint: {
        stage: 'trigger',
        stepIndex: 0,
        filePath: 'custom-governance/rule.ts',
        nodeId: 'custom:governance',
        routePattern: null,
        reason: 'Path is structurally inferred but lacks observed runtime evidence.',
        recovery: 'Run governed validation from the discovered boundary.',
      },
      filePaths: ['custom-governance/rule.ts'],
      chain: [
        {
          role: 'orchestration',
          nodeId: 'custom:governance',
          filePath: 'custom-governance/rule.ts',
          description: 'custom governance rule',
          truthMode: 'inferred',
        },
      ],
    });

    const unprotectedPlan = buildPathProofPlan(unprotectedRootDir, {
      matrix: makeMatrix([pathFromDiscoveredGovernanceManifest]),
      generatedAt: '2026-04-29T12:00:00.000Z',
      writeArtifact: false,
    });
    const protectedPlan = buildPathProofPlan(protectedRootDir, {
      matrix: makeMatrix([pathFromDiscoveredGovernanceManifest]),
      generatedAt: '2026-04-29T12:00:00.000Z',
      writeArtifact: false,
    });

    expect(unprotectedPlan.tasks.map((task) => task.pathId)).toEqual(['custom-governance-path']);
    expect(protectedPlan.tasks).toEqual([]);
  });
});

