/**
 * Unit tests for external adapter status gates.
 *
 * Legacy convergence gate tests live in __parts__/external-adapters.cases.legacy.ts.
 * Fixtures and helpers live in __parts__/external-adapters.helpers.ts.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { describe, it, expect } from 'vitest';
import { buildExternalSignalState } from '../external-signals';
import {
  classifyLiveExternalSource,
  discoverExternalSourceCapabilities,
  isAdapterRequired,
  normalizeExternalSignalProfile,
} from '../adapters/external-sources-orchestrator';
import type { ExternalSourceRunResult } from '../adapters/external-sources-orchestrator';
import {
  buildExternalInput,
  buildLiveExternalState,
  writeJson,
} from './__parts__/external-adapters.helpers';
import './__parts__/external-adapters.cases.legacy';

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
});
