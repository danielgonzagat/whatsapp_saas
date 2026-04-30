import { describe, expect, it } from 'vitest';

import { CERTIFICATION_FINDING_PREDICATES } from '../cert-constants';
import { evaluatePatternGate } from '../cert-gate-pattern';
import type { PulseHealth } from '../types';

const healthWithSecurityFinding: PulseHealth = {
  score: 80,
  totalNodes: 1,
  breaks: [
    {
      type: 'ROUTE_NO_AUTH',
      severity: 'high',
      file: 'backend/src/auth/example.controller.ts',
      line: 1,
      description: 'Route lacks auth',
      detail: 'Detected route without guard',
      source: 'ast',
    },
  ],
  stats: {
    uiElements: 0,
    uiDeadHandlers: 0,
    apiCalls: 0,
    apiNoRoute: 0,
    backendRoutes: 1,
    backendEmpty: 0,
    prismaModels: 0,
    modelOrphans: 0,
    facades: 0,
    facadesBySeverity: { high: 0, medium: 0, low: 0 },
    proxyRoutes: 0,
    proxyNoUpstream: 0,
    securityIssues: 1,
    dataSafetyIssues: 0,
    qualityIssues: 0,
    unavailableChecks: 0,
    unknownSurfaces: 0,
  },
  timestamp: '2026-04-29T00:00:00.000Z',
};

describe('evaluatePatternGate', () => {
  it('reports dynamic objectives, finding predicates, and evidence requirements', () => {
    const result = evaluatePatternGate(
      'securityPass',
      'No findings.',
      'Security objective blocked.',
      healthWithSecurityFinding,
      null,
      CERTIFICATION_FINDING_PREDICATES.securityPass,
    );

    expect(result.status).toBe('fail');
    expect(result.reason).toContain('dynamic security certification objective');
    expect(result.reason).toContain('Evidence requirement:');
    expect(result.reason).toContain('Blocking finding predicates:');
    expect(result.reason).not.toContain('Blocking types:');
  });
});
