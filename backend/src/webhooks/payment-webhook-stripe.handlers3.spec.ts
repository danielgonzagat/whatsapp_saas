import { describe, expect, it, jest } from '@jest/globals';

import { handleAccountUpdated } from './payment-webhook-stripe.handlers3';
import type { StripeHandlerDeps } from './payment-webhook-stripe.deps';

function mockDeps() {
  return {
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    prisma: {
      $transaction: jest.fn(),
      connectAccountBalance: { findUnique: jest.fn() },
    },
    autopilot: {},
    whatsapp: { sendMessage: jest.fn() },
    webhooksService: {
      markWebhookProcessed: jest.fn().mockResolvedValue(undefined),
      markWebhookFailed: jest.fn(),
    },
    stripeWebhookProcessor: {},
    connectReversalService: {},
    connectPayoutService: {},
    marketplaceTreasuryPayoutService: {},
    adminAudit: { append: jest.fn().mockResolvedValue(undefined) },
    financialAlert: { webhookProcessingFailed: jest.fn() },
    ledger: {},
  };
}

type MockDeps = ReturnType<typeof mockDeps>;

function asDeps(deps: MockDeps): StripeHandlerDeps {
  return deps as unknown as StripeHandlerDeps;
}

function makeAccountUpdatedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_acct_1',
    type: 'account.updated',
    data: {
      object: {
        id: 'acct_123',
        charges_enabled: true,
        payouts_enabled: false,
        details_submitted: true,
        requirements: {
          currently_due: ['individual.verification'],
          past_due: [],
          disabled_reason: null,
        },
        ...overrides,
      },
    },
  };
}

describe('handleAccountUpdated', () => {
  it('appends admin audit with account status when local balance record exists', async () => {
    const deps = mockDeps();
    deps.prisma.connectAccountBalance.findUnique.mockResolvedValueOnce({
      id: 'cab_1',
      workspaceId: 'ws-1',
      accountType: 'SELLER',
      stripeAccountId: 'acct_123',
    });
    const event = makeAccountUpdatedEvent();

    await handleAccountUpdated(asDeps(deps), event, { id: 'we_1' } as never);

    expect(deps.adminAudit.append).toHaveBeenCalledWith({
      action: 'system.connect.account_updated',
      entityType: 'connect_account_balance',
      entityId: 'cab_1',
      details: expect.objectContaining({
        stripeAccountId: 'acct_123',
        workspaceId: 'ws-1',
        chargesEnabled: true,
        payoutsEnabled: false,
        detailsSubmitted: true,
        requirementsCurrentlyDue: ['individual.verification'],
        requirementsPastDue: [],
        requirementsDisabledReason: null,
      }),
    });
    expect(deps.webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_1');
  });

  it('logs a warning when no local balance record exists for the stripe account', async () => {
    const deps = mockDeps();
    deps.prisma.connectAccountBalance.findUnique.mockResolvedValueOnce(null);
    const event = makeAccountUpdatedEvent();

    await handleAccountUpdated(asDeps(deps), event, { id: 'we_2' } as never);

    expect(deps.adminAudit.append).not.toHaveBeenCalled();
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('unknown local balance stripeAccountId=acct_123'),
    );
    expect(deps.webhooksService.markWebhookProcessed).toHaveBeenCalledWith('we_2');
  });

  it('no-ops when event has no stripe account id', async () => {
    const deps = mockDeps();
    const event = makeAccountUpdatedEvent({ id: null });

    await handleAccountUpdated(asDeps(deps), event, undefined);

    expect(deps.adminAudit.append).not.toHaveBeenCalled();
    expect(deps.prisma.connectAccountBalance.findUnique).not.toHaveBeenCalled();
  });

  it('alerts and logs when markWebhookProcessed fails', async () => {
    const deps = mockDeps();
    deps.prisma.connectAccountBalance.findUnique.mockResolvedValueOnce({
      id: 'cab_1',
      workspaceId: 'ws-1',
      accountType: 'SELLER',
      stripeAccountId: 'acct_123',
    });
    const markError = new Error('mark failed');
    deps.webhooksService.markWebhookProcessed.mockRejectedValueOnce(markError);
    const event = makeAccountUpdatedEvent();

    await handleAccountUpdated(asDeps(deps), event, { id: 'we_3' } as never);

    expect(deps.financialAlert.webhookProcessingFailed).toHaveBeenCalledWith(markError, {
      provider: 'stripe',
      externalId: 'evt_acct_1',
      eventType: 'account.updated',
    });
    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to mark webhook we_3 as processed: mark failed'),
    );
  });
});

describe('workspace isolation — handlers3', () => {
  it('handleAccountUpdated for ws-A does not affect ws-B', async () => {
    const depsA = mockDeps();
    depsA.prisma.connectAccountBalance.findUnique.mockResolvedValueOnce({
      id: 'cab_1',
      workspaceId: 'ws-1',
      accountType: 'SELLER',
      stripeAccountId: 'acct_123',
    });
    const depsB = mockDeps();
    const event = makeAccountUpdatedEvent();

    await handleAccountUpdated(asDeps(depsA), event, { id: 'we_a' } as never);

    expect(depsB.adminAudit.append).not.toHaveBeenCalled();
    expect(depsB.webhooksService.markWebhookProcessed).not.toHaveBeenCalled();
  });
});
