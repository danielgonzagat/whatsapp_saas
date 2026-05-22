import { PortfolioStateService } from './portfolio-state.service';
import { PerClientContextBundler } from './per-client-context.bundler';
import type {
  BundleBuildInput,
  ClientData,
  ConsolidationInput,
  TeamMemberData,
} from './portfolio-state.service';
import type { ClientContextBundle } from './agency.types';
import { clamp, clampScore } from './agency.types';

const NOW = Date.parse('2026-05-14T12:00:00.000Z');
const AGENCY = 'agency_001';

function makeData(
  workspaceId: string,
  overrides: Partial<ClientData> = {},
): ClientData {
  return {
    workspaceId,
    revenueCents: overrides.revenueCents ?? 100_000n,
    costCents: overrides.costCents ?? 30_000n,
    previousMarginPercent: overrides.previousMarginPercent,
    satisfactionScore: overrides.satisfactionScore ?? 0.8,
    openIssues: overrides.openIssues ?? 1,
    activeProjects: overrides.activeProjects ?? 3,
    relationshipDays: overrides.relationshipDays ?? 180,
    lastContactDaysAgo: overrides.lastContactDaysAgo ?? 3,
    delayedPayment: overrides.delayedPayment ?? false,
    complaintCount: overrides.complaintCount ?? 0,
    scopeReduction: overrides.scopeReduction ?? false,
    contractRenewalAt: overrides.contractRenewalAt ?? null,
  };
}

function makeBundleInput(
  clientId: string,
  overrides: Partial<BundleBuildInput> = {},
): BundleBuildInput {
  return {
    agencyWorkspaceId: overrides.agencyWorkspaceId ?? AGENCY,
    clientWorkspaceId: clientId,
    activeProjects: overrides.activeProjects ?? 3,
    openIssues: overrides.openIssues ?? 1,
    satisfactionScore: overrides.satisfactionScore ?? 0.8,
    revenueCents: overrides.revenueCents ?? 100_000n,
    relationshipDays: overrides.relationshipDays ?? 180,
    contractRenewalAt: overrides.contractRenewalAt ?? null,
    tags: overrides.tags,
    nowMs: overrides.nowMs ?? NOW,
  };
}

// =========================================================================
// HELPERS
// =========================================================================
describe('AGENCY-010 — PerClientContextBundler', () => {
  const bundler = new PerClientContextBundler();

  it('builds context from input fields', () => {
    const input = makeBundleInput('client_acme', {
      activeProjects: 4,
      openIssues: 2,
      satisfactionScore: 0.9,
      revenueCents: 200_000n,
      relationshipDays: 365,
    });
    const { bundle, isolationVerified } = bundler.buildContext(input);

    expect(bundle.clientWorkspaceId).toBe('client_acme');
    expect(bundle.agencyWorkspaceId).toBe(AGENCY);
    expect(bundle.activeProjects).toBe(4);
    expect(bundle.openIssues).toBe(2);
    expect(bundle.satisfactionScore).toBe(0.9);
    expect(bundle.revenueCents).toBe(200_000n);
    expect(bundle.relationshipDays).toBe(365);
    expect(isolationVerified).toBe(true);
    expect(bundle.isolationToken).toBeDefined();
    expect(bundle.isolationToken.length).toBeGreaterThan(0);
  });

  it('generates unique isolation tokens for different clients', () => {
    const r1 = bundler.buildContext(makeBundleInput('client_a'));
    const r2 = bundler.buildContext(makeBundleInput('client_b'));

    expect(r1.bundle.isolationToken).not.toBe(r2.bundle.isolationToken);
    expect(r1.isolationHash).not.toBe(r2.isolationHash);
  });

  it('generates unique tokens for different agencies', () => {
    const r1 = bundler.buildContext(
      makeBundleInput('client_x', { agencyWorkspaceId: 'agency_alpha' }),
    );
    const r2 = bundler.buildContext(
      makeBundleInput('client_x', { agencyWorkspaceId: 'agency_beta' }),
    );

    expect(r1.bundle.isolationToken).not.toBe(r2.bundle.isolationToken);
  });

  it('produces consistent isolation hash for same input', () => {
    const r1 = bundler.buildContext(
      makeBundleInput('client_same', { nowMs: NOW }),
    );
    const r2 = bundler.buildContext(
      makeBundleInput('client_same', { nowMs: NOW }),
    );

    expect(r1.isolationHash).toBe(r2.isolationHash);
    expect(r1.bundle.isolationToken).toBe(r2.bundle.isolationToken);
  });

  it('verifies bundle integrity for correct pair', () => {
    const { bundle } = bundler.buildContext(makeBundleInput('client_ok'));

    const valid = bundler.verifyBundleIntegrity(bundle, AGENCY, 'client_ok');
    expect(valid).toBe(true);
  });

  it('rejects bundle integrity for wrong client', () => {
    const { bundle } = bundler.buildContext(makeBundleInput('client_a'));

    const valid = bundler.verifyBundleIntegrity(bundle, AGENCY, 'client_b');
    expect(valid).toBe(false);
  });

  it('rejects bundle integrity for wrong agency', () => {
    const { bundle } = bundler.buildContext(makeBundleInput('client_a'));

    const valid = bundler.verifyBundleIntegrity(
      bundle,
      'agency_other',
      'client_a',
    );
    expect(valid).toBe(false);
  });

  it('rejects bundle with tampered agencyWorkspaceId field', () => {
    const { bundle } = bundler.buildContext(makeBundleInput('client_a'));

    const tampered: ClientContextBundle = {
      ...bundle,
      agencyWorkspaceId: 'agency_intruder',
    };

    const valid = bundler.verifyBundleIntegrity(
      tampered,
      'agency_intruder',
      'client_a',
    );
    expect(valid).toBe(false);
  });

  it('rejects bundle with tampered clientWorkspaceId field', () => {
    const { bundle } = bundler.buildContext(makeBundleInput('client_a'));

    const tampered: ClientContextBundle = {
      ...bundle,
      clientWorkspaceId: 'client_intruder',
    };

    const valid = bundler.verifyBundleIntegrity(
      tampered,
      AGENCY,
      'client_intruder',
    );
    expect(valid).toBe(false);
  });

  it('infers high_value tag for large revenue', () => {
    const { bundle } = bundler.buildContext(
      makeBundleInput('c1', { revenueCents: 500_000n, tags: undefined }),
    );

    expect(bundle.tags).toContain('high_value');
  });

  it('infers new_client tag for recent relationship', () => {
    const { bundle } = bundler.buildContext(
      makeBundleInput('c1', { relationshipDays: 30, tags: undefined }),
    );

    expect(bundle.tags).toContain('new_client');
  });

  it('uses explicit tags when provided', () => {
    const { bundle } = bundler.buildContext(
      makeBundleInput('c1', { tags: ['enterprise', 'priority'] }),
    );

    expect(bundle.tags).toEqual(['enterprise', 'priority']);
  });

  // =========================================================================
  // INTERNAL-KNOWLEDGE-LEAK-GUARD
  // =========================================================================
  it('internal-knowledge-leak-guard: zero leak across client bundles', () => {
    const r1 = bundler.buildContext(makeBundleInput('client_alpha'));
    const r2 = bundler.buildContext(makeBundleInput('client_beta'));

    expect(r1.isolationHash).not.toBe(r2.isolationHash);
    expect(r1.bundle.isolationToken).not.toBe(r2.bundle.isolationToken);

    const alphaValidOnAlpha = bundler.verifyBundleIntegrity(
      r1.bundle,
      AGENCY,
      'client_alpha',
    );
    const alphaValidOnBeta = bundler.verifyBundleIntegrity(
      r1.bundle,
      AGENCY,
      'client_beta',
    );

    expect(alphaValidOnAlpha).toBe(true);
    expect(alphaValidOnBeta).toBe(false);
  });

  it('internal-knowledge-leak-guard: cross-client token collision impossible', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `wks_${String(i + 1).padStart(3, '0')}`);

    const bundles = ids.map((id) =>
      bundler.buildContext(makeBundleInput(id)).bundle,
    );

    const tokens = new Set(bundles.map((b) => b.isolationToken));
    expect(tokens.size).toBe(ids.length);
  });

  it('internal-knowledge-leak-guard: tampered isolation token detected', () => {
    const { bundle } = bundler.buildContext(makeBundleInput('client_original'));

    const tampered: ClientContextBundle = {
      ...bundle,
      isolationToken: 'malicious_token_0000',
    };

    const valid = bundler.verifyBundleIntegrity(
      tampered,
      AGENCY,
      'client_original',
    );
    expect(valid).toBe(false);
  });
});
