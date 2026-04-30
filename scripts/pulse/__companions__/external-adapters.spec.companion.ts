describe('external-adapters — required vs optional', () => {
  describe('profile-scoped external signal requiredness', () => {
    it('keeps Prometheus optional for pulse-core-final and required for full-product', () => {
      expect(isAdapterRequired('prometheus', 'pulse-core-final')).toBe(false);
      expect(isAdapterRequired('prometheus', 'full-product')).toBe(true);
    });

    it('requires profile-dependent adapters only for canonical final profiles', () => {
      expect(isAdapterRequired('codecov', 'core-critical')).toBe(false);
      expect(isAdapterRequired('codecov', 'pulse-core-final')).toBe(true);
      expect(isAdapterRequired('codecov', 'full-product')).toBe(true);
    });

    it('normalizes the legacy production-final alias to full-product', () => {
      expect(normalizeExternalSignalProfile('production-final')).toBe('full-product');
      expect(isAdapterRequired('prometheus', 'production-final')).toBe(true);
    });

    it('keeps compat requiredness out of operational truth when no source capability is discovered', () => {
      const rootDir = mkdtempSync(path.join(tmpdir(), 'pulse-external-capability-discovery-'));
      try {
        const capabilities = discoverExternalSourceCapabilities(
          {
            rootDir,
            env: {},
            githubOwner: '',
            githubRepo: '',
            gitHubRemote: null,
          },
          'pulse-core-final',
        );
        const codecov = capabilities.find((capability) => capability.source === 'codecov');

        expect(isAdapterRequired('codecov', 'pulse-core-final')).toBe(true);
        expect(codecov).toEqual(
          expect.objectContaining({
            discovered: false,
            operational: false,
            truthAuthority: 'compat_adapter',
            compatRequired: true,
          }),
        );
      } finally {
        rmSync(rootDir, { recursive: true, force: true });
      }
    });

    it('turns repo CI discovery into source capability metadata and blocks that discovered source', () => {
      const rootDir = mkdtempSync(path.join(tmpdir(), 'pulse-external-ci-discovery-'));
      try {
        const workflowsDir = path.join(rootDir, '.github', 'workflows');
        writeFileSync(path.join(rootDir, 'README.md'), '# Fixture\n');
        writeFileSync(path.join(rootDir, '.gitkeep'), '');
        mkdirSync(workflowsDir, { recursive: true });
        writeFileSync(path.join(workflowsDir, 'ci.yml'), 'name: CI\non: [push]\n');

        const capabilities = discoverExternalSourceCapabilities(
          {
            rootDir,
            env: {},
            githubOwner: '',
            githubRepo: '',
            gitHubRemote: null,
          },
          'pulse-core-final',
        );
        const actionsCapability = capabilities.find(
          (capability) => capability.source === 'github_actions',
        );
        expect(actionsCapability).toBeDefined();
        if (!actionsCapability) {
          throw new Error('github_actions capability metadata was not discovered.');
        }
        const actionsRun: ExternalSourceRunResult = {
          source: 'github_actions',
          status: 'not_available',
          signalCount: 0,
          syncedAt: '2026-04-29T21:00:00.000Z',
          reason: 'GitHub Actions owner/repo were not configured for the live adapter.',
        };
        const actions = classifyLiveExternalSource(
          actionsRun,
          'pulse-core-final',
          actionsCapability,
        );

        expect(actions).toEqual(
          expect.objectContaining({
            status: 'not_available',
            required: true,
            blocking: true,
          }),
        );
        expect(actions.sourceCapability).toEqual(
          expect.objectContaining({
            discovered: true,
            operational: false,
            truthAuthority: 'discovered_capability',
            capabilityKinds: expect.arrayContaining(['ci']),
            missingOperationalRequirements: expect.arrayContaining(['github_owner_repo']),
          }),
        );
      } finally {
        rmSync(rootDir, { recursive: true, force: true });
      }
    });

    it('does not let compat-required adapters become operational blockers without discovery', () => {
      const rootDir = mkdtempSync(path.join(tmpdir(), 'pulse-external-no-discovery-'));
      try {
        const capabilities = discoverExternalSourceCapabilities(
          {
            rootDir,
            env: {},
            githubOwner: '',
            githubRepo: '',
            gitHubRemote: null,
          },
          'pulse-core-final',
        );
        const codecovCapability = capabilities.find(
          (capability) => capability.source === 'codecov',
        );
        expect(codecovCapability).toBeDefined();
        if (!codecovCapability) {
          throw new Error('codecov capability metadata was not produced.');
        }
        const codecovRun: ExternalSourceRunResult = {
          source: 'codecov',
          status: 'not_available',
          signalCount: 0,
          syncedAt: '2026-04-29T21:00:00.000Z',
          reason: 'Codecov owner/repo were not configured for the live adapter.',
        };
        const codecov = classifyLiveExternalSource(
          codecovRun,
          'pulse-core-final',
          codecovCapability,
        );

        expect(codecov).toEqual(
          expect.objectContaining({
            status: 'optional_not_configured',
            required: false,
            blocking: false,
          }),
        );
        expect(codecov.sourceCapability).toEqual(
          expect.objectContaining({
            discovered: false,
            truthAuthority: 'compat_adapter',
            compatRequired: true,
          }),
        );
        expect(codecov.reason).toContain('compat requiredness profile-dependent is metadata only');
      } finally {
        rmSync(rootDir, { recursive: true, force: true });
      }
    });

    it('classifies optional unavailable adapters without adding them to required blockers', () => {
      const rootDir = mkdtempSync(path.join(tmpdir(), 'pulse-external-adapter-classification-'));
      try {
        const state = buildExternalSignalState(
          buildExternalInput(
            rootDir,
            buildLiveExternalState([
              {
                source: 'prometheus',
                status: 'not_available',
                signalCount: 0,
                syncedAt: '2026-04-29T21:00:00.000Z',
                reason: 'Prometheus base URL was not configured for the live adapter.',
              },
            ]),
          ),
        );

        const prometheus = state.adapters.find((adapter) => adapter.source === 'prometheus');

        expect(prometheus).toMatchObject({
          requirement: 'optional',
          required: false,
          observed: false,
          blocking: false,
          proofBasis: 'live_adapter',
        });
        expect(state.summary.optionalNotAvailableList).toContain('prometheus');
        expect(state.summary.missingAdaptersList).not.toContain('prometheus');
        expect(state.summary.blockingAdaptersList).not.toContain('prometheus');
        expect(state.summary.requiredAdapters).toBeGreaterThan(0);
        expect(state.summary.optionalAdapters).toBeGreaterThan(0);
        expect(state.summary.blockingAdapters).toBe(state.summary.blockingAdaptersList.length);
      } finally {
        rmSync(rootDir, { recursive: true, force: true });
      }
    });
  });

  describe('GitHub live adapter precedence over stale snapshots', () => {
    it('does not reuse stale GitHub snapshots as live evidence when live credentials are unavailable', () => {
      const rootDir = mkdtempSync(path.join(tmpdir(), 'pulse-external-adapters-'));
      try {
        writeJson(path.join(rootDir, 'PULSE_GITHUB_STATE.json'), {
          generatedAt: '2026-04-20T00:00:00.000Z',
          signals: [{ id: 'github:old', summary: 'Old GitHub snapshot.' }],
        });
        writeJson(path.join(rootDir, 'PULSE_GITHUB_ACTIONS_STATE.json'), {
          generatedAt: '2026-04-20T00:00:00.000Z',
          runs: [{ id: 'old-run', name: 'CI', conclusion: 'failure' }],
        });

        const state = buildExternalSignalState(
          buildExternalInput(
            rootDir,
            buildLiveExternalState([
              {
                source: 'github',
                status: 'not_available',
                signalCount: 0,
                syncedAt: '2026-04-29T21:00:00.000Z',
                reason: 'GitHub owner/repo were not configured for the live adapter.',
              },
              {
                source: 'github_actions',
                status: 'not_available',
                signalCount: 0,
                syncedAt: '2026-04-29T21:00:00.000Z',
                reason: 'GitHub Actions token/owner/repo were not configured for the live adapter.',
              },
            ]),
          ),
        );

        const github = state.adapters.find((adapter) => adapter.source === 'github');
        const actions = state.adapters.find((adapter) => adapter.source === 'github_actions');

        expect(github?.status).toBe('not_available');
        expect(actions?.status).toBe('not_available');
        expect(github?.reason).toContain('required under profile=pulse-core-final');
        expect(github?.requiredness).toBe('required');
        expect(github?.requirement).toBe('required');
        expect(github?.required).toBe(true);
        expect(github?.blocking).toBe(true);
        expect(github?.proofBasis).toBe('live_adapter');
        expect(github?.missingReason).toContain(
          'github is required under profile=pulse-core-final',
        );
        expect(github?.missingReason).toContain('blocking external proof closure');
        expect(actions?.reason).toContain('was not reused as live external reality');
        expect(state.summary.staleAdaptersList).not.toContain('github');
        expect(state.summary.staleAdaptersList).not.toContain('github_actions');
        expect(state.summary.missingAdaptersList).toContain('github');
        expect(state.summary.missingAdaptersList).toContain('github_actions');
      } finally {
        rmSync(rootDir, { recursive: true, force: true });
      }
    });

    it('prefers fresh live GitHub Actions state over a stale snapshot when credentials are configured', () => {
      const rootDir = mkdtempSync(path.join(tmpdir(), 'pulse-external-adapters-'));
      try {
        writeJson(path.join(rootDir, 'PULSE_GITHUB_ACTIONS_STATE.json'), {
          generatedAt: '2026-04-20T00:00:00.000Z',
          runs: [{ id: 'old-run', name: 'CI', conclusion: 'failure' }],
        });

        const state = buildExternalSignalState(
          buildExternalInput(
            rootDir,
            buildLiveExternalState([
              {
                source: 'github_actions',
                status: 'ready',
                signalCount: 0,
                syncedAt: '2026-04-29T21:00:00.000Z',
                reason:
                  'GitHub Actions live adapter is configured but returned no actionable signals.',
              },
            ]),
          ),
        );

        const actions = state.adapters.find((adapter) => adapter.source === 'github_actions');

        expect(actions?.sourcePath).toBe('live:github_actions');
        expect(actions?.status).toBe('ready');
        expect(actions?.freshnessMinutes).toBe(0);
        expect(state.summary.staleAdaptersList).not.toContain('github_actions');
      } finally {
        rmSync(rootDir, { recursive: true, force: true });
      }
    });
  });

  describe('required adapter not_available blocks certification', () => {
    it('should track missingAdapters when required adapter is not_available', () => {
      const autonomyState: LegacyConvergenceState = {
        history: [
          legacyCycle({
            cycleId: 'cycle-1',
            timestamp: '2026-04-25T00:00:00Z',
            status: 'completed',
            score: 80,
            blockingTier: 2,
            validationCommands: { total: 20, passing: 20 },
            missingAdapters: ['stripe', 'railway_db'],
          }),
        ],
      };

      const result = evaluateLegacyConvergenceGate(autonomyState);

      expect(result.status).toBe('fail');
      expect(result.reason).toContain('missing adapter');
    });

    it('should fail when required adapter status is invalid', () => {
      const autonomyState: LegacyConvergenceState = {
        history: [
          legacyCycle({
            cycleId: 'cycle-1',
            timestamp: '2026-04-25T00:00:00Z',
            status: 'completed',
            score: 80,
            blockingTier: 2,
            validationCommands: { total: 20, passing: 20 },
            adapterStatus: {
              stripe: 'invalid',
              railway_db: 'stale',
            },
          }),
        ],
      };

      const result = evaluateLegacyConvergenceGate(autonomyState);

      expect(result.status).toBe('fail');
    });
  });

  describe('optional adapter not_available does not block', () => {
    it('should pass when only optional adapters are not_available', () => {
      const autonomyState: LegacyConvergenceState = {
        history: [
          legacyCycle({
            cycleId: 'cycle-1',
            timestamp: '2026-04-25T00:00:00Z',
            status: 'completed',
            score: 75,
            blockingTier: 3,
            validationCommands: { total: 15, passing: 15 },
            optionalAdapters: ['slack_webhook', 'datadog'],
          }),
          legacyCycle({
            cycleId: 'cycle-2',
            timestamp: '2026-04-25T01:00:00Z',
            status: 'completed',
            score: 78,
            blockingTier: 3,
            validationCommands: { total: 15, passing: 15 },
            optionalAdapters: ['slack_webhook', 'datadog'],
          }),
          legacyCycle({
            cycleId: 'cycle-3',
            timestamp: '2026-04-25T02:00:00Z',
            status: 'completed',
            score: 80,
            blockingTier: 2,
            validationCommands: { total: 15, passing: 15 },
            optionalAdapters: ['slack_webhook', 'datadog'],
          }),
        ],
      };

      const result = evaluateLegacyConvergenceGate(autonomyState);

      expect(result.status).toBe('pass');
    });

    it('should pass when optional adapter has optional_not_configured status', () => {
      const autonomyState: LegacyConvergenceState = {
        history: [
          legacyCycle({
            cycleId: 'cycle-1',
            timestamp: '2026-04-25T00:00:00Z',
            status: 'completed',
            score: 80,
            blockingTier: 2,
            validationCommands: { total: 20, passing: 20 },
            adapterStatus: {
              slack: 'optional_not_configured',
              notifications: 'optional_not_configured',
            },
          }),
          legacyCycle({
            cycleId: 'cycle-2',
            timestamp: '2026-04-25T01:00:00Z',
            status: 'completed',
            score: 80,
            blockingTier: 2,
            validationCommands: { total: 20, passing: 20 },
            adapterStatus: {
              slack: 'optional_not_configured',
              notifications: 'optional_not_configured',
            },
          }),
          legacyCycle({
            cycleId: 'cycle-3',
            timestamp: '2026-04-25T02:00:00Z',
            status: 'completed',
            score: 81,
            blockingTier: 2,
            validationCommands: { total: 20, passing: 20 },
            adapterStatus: {
              slack: 'optional_not_configured',
              notifications: 'optional_not_configured',
            },
          }),
        ],
      };

      const result = evaluateLegacyConvergenceGate(autonomyState);

      expect(result.status).toBe('pass');
    });
  });

  describe('mixed required and optional adapters', () => {
    it('should pass when required adapters are ready and optional adapters are optional_not_configured', () => {
      const autonomyState: LegacyConvergenceState = {
        history: [
          legacyCycle({
            cycleId: 'cycle-1',
            timestamp: '2026-04-25T00:00:00Z',
            status: 'completed',
            score: 85,
            blockingTier: 1,
            validationCommands: { total: 25, passing: 25 },
            adapterStatus: {
              stripe: 'ready',
              railway_db: 'ready',
              slack: 'optional_not_configured',
              datadog: 'optional_not_configured',
            },
          }),
          legacyCycle({
            cycleId: 'cycle-2',
            timestamp: '2026-04-25T01:00:00Z',
            status: 'completed',
            score: 86,
            blockingTier: 1,
            validationCommands: { total: 25, passing: 25 },
            adapterStatus: {
              stripe: 'ready',
              railway_db: 'ready',
              slack: 'optional_not_configured',
              datadog: 'optional_not_configured',
            },
          }),
          legacyCycle({
            cycleId: 'cycle-3',
            timestamp: '2026-04-25T02:00:00Z',
            status: 'completed',
            score: 87,
            blockingTier: 1,
            validationCommands: { total: 25, passing: 25 },
            adapterStatus: {
              stripe: 'ready',
              railway_db: 'ready',
              slack: 'optional_not_configured',
              datadog: 'optional_not_configured',
            },
          }),
        ],
      };

      const result = evaluateLegacyConvergenceGate(autonomyState);

      expect(result.status).toBe('pass');
      expect(result.confidence).toBe('high');
    });

    it('should fail when required adapter is not_available even with optional adapters ready', () => {
      const autonomyState: LegacyConvergenceState = {
        history: [
          legacyCycle({
            cycleId: 'cycle-1',
            timestamp: '2026-04-25T00:00:00Z',
            status: 'completed',
            score: 80,
            blockingTier: 2,
            validationCommands: { total: 20, passing: 20 },
            adapterStatus: {
              stripe: 'not_available',
              slack: 'ready',
              datadog: 'ready',
            },
          }),
          legacyCycle({
            cycleId: 'cycle-2',
            timestamp: '2026-04-25T01:00:00Z',
            status: 'completed',
            score: 80,
            blockingTier: 2,
            validationCommands: { total: 20, passing: 20 },
            adapterStatus: {
              stripe: 'not_available',
              slack: 'ready',
              datadog: 'ready',
            },
          }),
          legacyCycle({
            cycleId: 'cycle-3',
            timestamp: '2026-04-25T02:00:00Z',
            status: 'completed',
            score: 80,
            blockingTier: 2,
            validationCommands: { total: 20, passing: 20 },
            adapterStatus: {
              stripe: 'not_available',
              slack: 'ready',
              datadog: 'ready',
            },
          }),
        ],
      };

      const result = evaluateLegacyConvergenceGate(autonomyState);

      expect(result.status).toBe('fail');
      expect(result.reason).toContain('stripe');
    });
  });
});

