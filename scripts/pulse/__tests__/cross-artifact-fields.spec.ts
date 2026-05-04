import { describe, it, expect } from 'vitest';
import { checkConsistency } from '../cross-artifact-consistency-check/comparators';
import type { LoadedArtifact } from '../cross-artifact-consistency-check/types';

describe('cross-artifact-consistency — field coverage', () => {
  it('should detect timestamp divergence with drift > 5m', () => {
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const artifacts: LoadedArtifact[] = [
      {
        filePath: 'PULSE_CERTIFICATE.json',
        data: { timestamp: now, status: 'certified' },
      },
      {
        filePath: 'PULSE_CLI_DIRECTIVE.json',
        data: { timestamp: old, status: 'certified' },
      },
    ];
    const result = checkConsistency(artifacts);
    expect(result.pass).toBe(false);
    expect(result.divergences.some((d) => d.field === 'timestamp')).toBe(true);
  });

  it('should detect dynamicBlockingReasons divergence', () => {
    const artifacts: LoadedArtifact[] = [
      {
        filePath: 'PULSE_CERTIFICATE.json',
        data: { dynamicBlockingReasons: ['reason_A'] },
      },
      {
        filePath: 'PULSE_CONVERGENCE_PLAN.json',
        data: { dynamicBlockingReasons: ['reason_B'] },
      },
    ];
    const result = checkConsistency(artifacts);
    expect(result.pass).toBe(false);
    expect(result.divergences.some((d) => d.field === 'dynamicBlockingReasons')).toBe(true);
  });

  it('should detect nextWork.queue divergence', () => {
    const artifacts: LoadedArtifact[] = [
      {
        filePath: 'PULSE_CONVERGENCE_PLAN.json',
        data: { nextWork: { queue: ['task_1'] } },
      },
      {
        filePath: 'PULSE_CLI_DIRECTIVE.json',
        data: { nextWork: { queue: ['task_2'] } },
      },
    ];
    const result = checkConsistency(artifacts);
    expect(result.pass).toBe(false);
    expect(result.divergences.some((d) => d.field === 'nextWork.queue')).toBe(true);
  });

  it('should allow timestamp drift within 5 minutes', () => {
    const now = new Date().toISOString();
    const recent = new Date(Date.now() - 4 * 60 * 1000).toISOString();
    const artifacts: LoadedArtifact[] = [
      {
        filePath: 'PULSE_CERTIFICATE.json',
        data: { timestamp: now, status: 'certified' },
      },
      {
        filePath: 'PULSE_CONVERGENCE_PLAN.json',
        data: { timestamp: recent, status: 'certified' },
      },
    ];
    const result = checkConsistency(artifacts);
    expect(result.divergences.some((d) => d.field === 'timestamp')).toBe(false);
  });

  it('should pass with all core fields consistent', () => {
    const now = new Date().toISOString();
    const artifacts: LoadedArtifact[] = [
      {
        filePath: 'PULSE_CERTIFICATE.json',
        data: {
          status: 'certified',
          timestamp: now,
          authorityMode: 'certified-autonomous',
          blockingTier: 'none',
          dynamicBlockingReasons: [],
        },
      },
      {
        filePath: 'PULSE_CONVERGENCE_PLAN.json',
        data: {
          status: 'certified',
          timestamp: now,
          authorityMode: 'certified-autonomous',
          nextWork: { queue: [] },
        },
      },
    ];
    const result = checkConsistency(artifacts);
    expect(result.pass).toBe(true);
    expect(result.divergences).toHaveLength(0);
  });
});
