import { describe, expect, it } from 'vitest';

import {
  humanizeConnectDisabledReason,
  humanizeConnectRequirement,
  summarizeSellerConnectAccount,
} from './ContaConnectStatus.helpers';

describe('humanizeConnectRequirement', () => {
  it('maps known requirement codes to seller-facing labels', () => {
    expect(humanizeConnectRequirement('individual.verification.document')).toBe(
      'Documento da pessoa responsável',
    );
    expect(humanizeConnectRequirement('company.tax_id')).toBe('CNPJ da empresa');
    expect(humanizeConnectRequirement('business_profile.mcc')).toBe('Categoria do negócio');
  });

  it('falls back to a readable label for unknown codes', () => {
    expect(humanizeConnectRequirement('owners.0.first_name')).toBe('Owners 0 First Name');
  });
});

describe('humanizeConnectDisabledReason', () => {
  it('maps known disabled reasons', () => {
    expect(humanizeConnectDisabledReason('requirements.past_due')).toBe(
      'Existem pendências vencidas no cadastro da conta de recebimento.',
    );
  });

  it('returns a generic explanation for unknown reasons', () => {
    expect(humanizeConnectDisabledReason('something.new')).toBe(
      'Existe uma restrição temporária na conta de recebimento.',
    );
  });
});

describe('summarizeSellerConnectAccount', () => {
  it('returns not_started when the seller account does not exist yet', () => {
    const summary = summarizeSellerConnectAccount(null);

    expect(summary.state).toBe('not_started');
    expect(summary.label).toBe('Ainda não iniciado');
    expect(summary.requirements).toEqual([]);
  });

  it('returns active when charges and payouts are enabled', () => {
    const summary = summarizeSellerConnectAccount({
      accountBalanceId: 'cab_1',
      workspaceId: 'ws_1',
      stripeAccountId: 'acct_1',
      accountType: 'SELLER',
      pendingCents: '0',
      availableCents: '0',
      lifetimeReceivedCents: '0',
      lifetimePaidOutCents: '0',
      lifetimeChargebacksCents: '0',
      onboarding: {
        stripeAccountId: 'acct_1',
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        requirementsCurrentlyDue: [],
        requirementsPastDue: [],
        requirementsDisabledReason: null,
        capabilities: {},
      },
    });

    expect(summary.state).toBe('active');
    expect(summary.label).toBe('Ativa');
  });

  it('returns action_required when there are open requirements', () => {
    const summary = summarizeSellerConnectAccount({
      accountBalanceId: 'cab_1',
      workspaceId: 'ws_1',
      stripeAccountId: 'acct_1',
      accountType: 'SELLER',
      pendingCents: '0',
      availableCents: '0',
      lifetimeReceivedCents: '0',
      lifetimePaidOutCents: '0',
      lifetimeChargebacksCents: '0',
      onboarding: {
        stripeAccountId: 'acct_1',
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        requirementsCurrentlyDue: ['individual.verification.document', 'external_account'],
        requirementsPastDue: [],
        requirementsDisabledReason: null,
        capabilities: {},
      },
    });

    expect(summary.state).toBe('action_required');
    expect(summary.requirements).toEqual(['Documento da pessoa responsável', 'Dados bancários']);
  });

  it('returns restricted when there are overdue requirements', () => {
    const summary = summarizeSellerConnectAccount({
      accountBalanceId: 'cab_1',
      workspaceId: 'ws_1',
      stripeAccountId: 'acct_1',
      accountType: 'SELLER',
      pendingCents: '0',
      availableCents: '0',
      lifetimeReceivedCents: '0',
      lifetimePaidOutCents: '0',
      lifetimeChargebacksCents: '0',
      onboarding: {
        stripeAccountId: 'acct_1',
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: true,
        requirementsCurrentlyDue: [],
        requirementsPastDue: ['company.tax_id'],
        requirementsDisabledReason: 'requirements.past_due',
        capabilities: {},
      },
    });

    expect(summary.state).toBe('restricted');
    expect(summary.disabledReason).toBe(
      'Existem pendências vencidas no cadastro da conta de recebimento.',
    );
  });

  it('returns in_review after submission when no pending requirements remain', () => {
    const summary = summarizeSellerConnectAccount({
      accountBalanceId: 'cab_1',
      workspaceId: 'ws_1',
      stripeAccountId: 'acct_1',
      accountType: 'SELLER',
      pendingCents: '0',
      availableCents: '0',
      lifetimeReceivedCents: '0',
      lifetimePaidOutCents: '0',
      lifetimeChargebacksCents: '0',
      onboarding: {
        stripeAccountId: 'acct_1',
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: true,
        requirementsCurrentlyDue: [],
        requirementsPastDue: [],
        requirementsDisabledReason: null,
        capabilities: {},
      },
    });

    expect(summary.state).toBe('in_review');
    expect(summary.label).toBe('Em verificação');
  });
});
