import { describe, expect, it } from 'vitest';

import { generateProviderScenarios } from '../chaos-engine';
import type { PulseCapability } from '../types';

function pulseCapability(overrides: Partial<PulseCapability> = {}): PulseCapability {
  return {
    id: 'capability:opaque',
    name: 'Opaque capability',
    truthMode: 'observed',
    status: 'partial',
    confidence: 1,
    userFacing: true,
    runtimeCritical: true,
    protectedByGovernance: false,
    ownerLane: 'customer',
    executionMode: 'ai_safe',
    rolesPresent: ['side_effect'],
    missingRoles: [],
    filePaths: [],
    nodeIds: [],
    routePatterns: [],
    evidenceSources: [],
    codacyIssueCount: 0,
    highSeverityIssueCount: 0,
    blockingReasons: [],
    validationTargets: [],
    maturity: {
      stage: 'foundational',
      score: 0.7,
      dimensions: {
        interfacePresent: true,
        apiSurfacePresent: true,
        orchestrationPresent: true,
        persistencePresent: false,
        sideEffectPresent: true,
        runtimeEvidencePresent: true,
        validationPresent: false,
        scenarioCoveragePresent: false,
        codacyHealthy: true,
        simulationOnly: false,
      },
      missing: [],
    },
    dod: {
      status: 'partial',
      missingRoles: [],
      blockers: [],
      truthModeMet: true,
    },
    ...overrides,
  };
}

function expectedBehaviorFor(capability: PulseCapability, providerFiles: string[]): string {
  const scenarios = generateProviderScenarios(
    process.cwd(),
    new Map([['behavior:opaque-provider', providerFiles]]),
    [capability],
  );

  return scenarios.map((scenario) => scenario.expectedBehavior).join('\n');
}

describe('chaos-engine operational evidence expectations', () => {
  it('derives payment idempotency expectations from capability and provider evidence', () => {
    const behavior = expectedBehaviorFor(
      pulseCapability({
        id: 'capability:checkout-payment',
        name: 'Checkout payment confirmation',
        rolesPresent: ['side_effect', 'persistence'],
        filePaths: ['backend/src/payments/ledger/connect-ledger-reconciliation.service.ts'],
        validationTargets: ['idempotency replay validation'],
      }),
      ['backend/src/payments/connect/connect.controller.ts'],
    );

    expect(behavior).toContain('Payment operations MUST preserve idempotency keys');
    expect(behavior).toContain('duplicate charges');
    expect(behavior).toContain('duplicate ledger entries');
  });

  it('derives WhatsApp queue and retry expectations from messaging evidence', () => {
    const behavior = expectedBehaviorFor(
      pulseCapability({
        id: 'capability:message-delivery',
        name: 'Message delivery',
        filePaths: ['backend/src/whatsapp/whatsapp.service.ts', 'worker/queue/dispatch.ts'],
        routePatterns: ['/webhooks/whatsapp'],
      }),
      ['backend/src/whatsapp/whatsapp.service.ts'],
    );

    expect(behavior).toContain('WhatsApp delivery MUST be queued for retry');
    expect(behavior).toContain('Outbound WhatsApp messages MUST be enqueued');
    expect(behavior).toContain('delayed delivery');
  });

  it('derives email retry and fallback expectations from mail evidence', () => {
    const behavior = expectedBehaviorFor(
      pulseCapability({
        id: 'capability:onboarding-email',
        name: 'Onboarding email delivery',
        filePaths: ['backend/src/notifications/welcome-onboarding-email.service.ts'],
        evidenceSources: ['smtp fallback configured'],
      }),
      ['backend/src/notifications/welcome-onboarding-email.service.ts'],
    );

    expect(behavior).toContain('Email delivery MUST be queued');
    expect(behavior).toContain('fallback channel');
    expect(behavior).toContain('password reset');
  });

  it('derives AI fallback and cache expectations from model evidence', () => {
    const behavior = expectedBehaviorFor(
      pulseCapability({
        id: 'capability:agent-assist',
        name: 'Agent model assist',
        filePaths: ['backend/src/ai-brain/agent-assist.service.ts'],
        evidenceSources: ['prompt cache hit observed'],
      }),
      ['backend/src/ai-brain/agent-assist.service.ts'],
    );

    expect(behavior).toContain('cached completions');
    expect(behavior).toContain('fallback model');
    expect(behavior).toContain('without fabricated answers');
  });
});
