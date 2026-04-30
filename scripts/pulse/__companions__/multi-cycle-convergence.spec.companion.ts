describe('regression detection in multi-cycle', () => {
  it('cycle where Codex execution fails does NOT count even when validation passes', () => {
    const records = [
      makeRecord({
        codex: {
          exitCode: 1,
        },
        validation: {
          commands: [
            {
              command: 'npx vitest run scripts/pulse/__tests__/multi-cycle-convergence.spec.ts',
              durationMs: DEEP_VALIDATION_DURATION_MS,
              exitCode: 0,
              summary: '',
            },
          ],
          executed: true,
        },
      }),
      makeRecord({
        validation: {
          commands: [
            {
              command: 'node scripts/pulse/run.js --deep --customer',
              durationMs: DEEP_VALIDATION_DURATION_MS,
              exitCode: 0,
              summary: '',
            },
          ],
          executed: true,
        },
      }),
      makeRecord({
        validation: {
          commands: [
            {
              command: 'node scripts/pulse/run.js --total --certify --json',
              durationMs: DEEP_VALIDATION_DURATION_MS,
              exitCode: 0,
              summary: '',
            },
          ],
          executed: true,
        },
      }),
    ];

    const result = evaluateMultiCycleConvergenceGate({ history: records });
    expect(result.status).toBe('fail');
    expect(result.reason).toContain('failedCodex=1');
  });

  it('cycle where score regresses does NOT count', () => {
    const record = makeRecord({
      directiveAfter: {
        blockingTier: DEFAULT_BLOCKING_TIER,
        score: REGRESSION_AFTER_SCORE,
        visionGap: 'test',
      },
      directiveBefore: {
        blockingTier: DEFAULT_BLOCKING_TIER,
        score: REGRESSION_BEFORE_SCORE,
        visionGap: 'test',
      },
      validation: {
        commands: [
          {
            command: 'npx playwright test',
            durationMs: PLAYWRIGHT_DURATION_MS,
            exitCode: 0,
            summary: '',
          },
        ],
        executed: true,
      },
    });

    const result = evaluateMultiCycleConvergenceGate({ history: [record] });
    expect(result.status).toBe('fail');
    expect(result.reason).toContain('scoreRegression(s)=cycle1:70->65');
  });

  it('cycle where execution matrix worsens does NOT count when snapshots are present', () => {
    const record = Object.assign(
      makeRecord({
        validation: {
          commands: [
            {
              command: 'node scripts/pulse/run.js --deep --customer',
              durationMs: DEEP_VALIDATION_DURATION_MS,
              exitCode: 0,
              summary: '',
            },
          ],
          executed: true,
        },
      }),
      {
        executionMatrixSummaryBefore: {
          observedPass: MATRIX_OBSERVED_PASS_BASELINE,
          criticalUnobservedPaths: MATRIX_CRITICAL_UNOBSERVED_BASELINE,
          unknownPaths: 0,
          impreciseBreakpoints: 0,
        },
        executionMatrixSummaryAfter: {
          observedPass: MATRIX_OBSERVED_PASS_BASELINE - 1,
          criticalUnobservedPaths: MATRIX_CRITICAL_UNOBSERVED_BASELINE + 1,
          unknownPaths: 0,
          impreciseBreakpoints: 0,
        },
      },
    );

    const result = evaluateMultiCycleConvergenceGate({ history: [record] });
    expect(result.status).toBe('fail');
    expect(result.reason).toContain('regressedExecutionMatrix=1');
  });

  it('cycle where execution matrix worsens does NOT count when snapshots are present', () => {
    const record = Object.assign(
      makeRecord({
        validation: {
          commands: [
            {
              command: 'node scripts/pulse/run.js --deep --customer',
              durationMs: DEEP_VALIDATION_DURATION_MS,
              exitCode: 0,
              summary: '',
            },
          ],
          executed: true,
        },
      }),
      {
        executionMatrixSummaryBefore: {
          observedPass: MATRIX_OBSERVED_PASS_BASELINE,
          criticalUnobservedPaths: MATRIX_CRITICAL_UNOBSERVED_BASELINE,
          unknownPaths: 0,
          impreciseBreakpoints: 0,
        },
        executionMatrixSummaryAfter: {
          observedPass: MATRIX_OBSERVED_PASS_BASELINE - 1,
          criticalUnobservedPaths: MATRIX_CRITICAL_UNOBSERVED_BASELINE + 1,
          unknownPaths: 0,
          impreciseBreakpoints: 0,
        },
      },
    );

    const result = evaluateMultiCycleConvergenceGate({ history: [record] });
    expect(result.status).toBe('fail');
    expect(result.reason).toContain('regressedExecutionMatrix=1');
  });
});

