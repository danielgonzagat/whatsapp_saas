describe('certification proof readiness consumption', () => {
  it('blocks final certification using the real proof-readiness artifact summary', () => {
    const rootDir = makeTempRoot();
    writeProofReadinessSummary(rootDir, {
      totalTasks: 1,
      executableTasks: 1,
      executableObserved: 0,
      executableUnproved: 1,
      blockedHumanRequired: 0,
      blockedNotExecutable: 0,
      observedEvidence: 0,
      nonObservedEvidence: 1,
      plannedEvidence: 1,
      inferredEvidence: 0,
      notAvailableEvidence: 0,
      plannedOrUnexecutedEvidence: 1,
      canAdvance: false,
      status: 'executable_unproved',
    });

    const certification = computeCertification(baseInput(rootDir));

    expect(certification.status).toBe('PARTIAL');
    expect(certification.humanReplacementStatus).toBe('NOT_READY');
    expect(certification.gates.noOverclaimPass.status).toBe('fail');
    expect(certification.gates.noOverclaimPass.reason).toContain(
      'PULSE_PROOF_READINESS.json has non-observed production proof',
    );
    expect(certification.dynamicBlockingReasons).toContainEqual(
      expect.stringContaining('Proof readiness still has non-observed production proof'),
    );
    expect(certification.gateEvidence.noOverclaimPass?.[0]?.artifactPaths).toEqual([
      '.pulse/current/PULSE_PROOF_READINESS.json',
    ]);
  });

  it('refreshes proof readiness from current path proof inputs before certification', () => {
    const rootDir = makeTempRoot();
    writeProofReadinessSummary(rootDir, {
      totalTasks: 1,
      executableTasks: 1,
      executableObserved: 1,
      executableUnproved: 0,
      blockedHumanRequired: 0,
      blockedNotExecutable: 0,
      observedEvidence: 1,
      nonObservedEvidence: 0,
      plannedEvidence: 0,
      inferredEvidence: 0,
      notAvailableEvidence: 0,
      plannedOrUnexecutedEvidence: 0,
      canAdvance: true,
      status: 'ready',
    });
    const task = makePathProofTask();
    const plan = makePathProofPlan([task]);
    const evidence = mergePathProofRunnerResults(plan, [], '2026-04-29T23:01:00.000Z');
    writeJson(rootDir, PATH_PROOF_TASKS_ARTIFACT, plan);
    writeJson(rootDir, PATH_PROOF_EVIDENCE_ARTIFACT, evidence);

    const certification = computeCertification(baseInput(rootDir));

    expect(certification.gates.noOverclaimPass.status).toBe('fail');
    expect(certification.gates.noOverclaimPass.reason).toContain('completionProofReadiness');
    expect(certification.gateEvidence.noOverclaimPass?.[0]?.metrics).toEqual(
      expect.objectContaining({
        plannedEvidence: 1,
        plannedOrUnexecutedEvidence: 1,
        executableUnproved: 1,
      }),
    );
  });

  it('blocks final certification from the no-hardcoded-reality state', () => {
    const rootDir = makeTempRoot();
    const pulseDir = path.join(rootDir, 'scripts/pulse');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'hardcoded-reality.ts'),
      "const PRODUCT_ROUTES = ['/checkout', '/billing/status'];\n",
    );

    const certification = computeCertification(baseInput(rootDir));

    expect(certification.status).toBe('PARTIAL');
    expect(certification.humanReplacementStatus).toBe('NOT_READY');
    expect(certification.gates.noOverclaimPass.status).toBe('fail');
    expect(certification.gates.noOverclaimPass.reason).toContain(
      'PULSE_NO_HARDCODED_REALITY.json reports hardcoded reality authority',
    );
    expect(certification.noHardcodedRealityState).toEqual(
      expect.objectContaining({
        artifact: 'PULSE_NO_HARDCODED_REALITY',
        totalEvents: 1,
      }),
    );
    expect(certification.dynamicBlockingReasons).toContainEqual(
      expect.stringContaining('No-hardcoded-reality state still has hardcoded reality authority'),
    );
    expect(certification.gateEvidence.noOverclaimPass).toContainEqual(
      expect.objectContaining({
        artifactPaths: ['PULSE_NO_HARDCODED_REALITY.json'],
        metrics: expect.objectContaining({ totalEvents: 1 }),
      }),
    );
  });
});

