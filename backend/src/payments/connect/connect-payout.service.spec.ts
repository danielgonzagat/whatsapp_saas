import {
  AccountBalanceNotFoundError,
  InsufficientAvailableBalanceError,
} from '../ledger/ledger.types';

import { ConnectPayoutsNotEnabledError } from './connect-payout.service';
import {
  DEFAULT_PAYOUT_ID,
  DEFAULT_STRIPE_ACCOUNT_ID,
  DEFAULT_WORKSPACE_ID,
  createHarness,
  makeBalance,
  makeLedgerEntry,
  makeLedgerMetadata,
  makePayoutRequest,
  makeStripeAccount,
} from './connect-payout.service.spec.helpers';

describe('ConnectPayoutService.createPayout', () => {
  it('creates a Stripe payout on the connected account and debits the ledger with the same idempotency key', async () => {
    const { service, stripe, ledger, financialAlert } = await createHarness({
      creditResult: makeLedgerEntry('cle_adj_unused'),
    });

    const request = makePayoutRequest();
    const result = await service.createPayout(request);

    expect(stripe.stripe.payouts.create).toHaveBeenCalledWith(
      {
        amount: Number(request.amountCents),
        currency: 'brl',
        metadata: {
          accountBalanceId: request.accountBalanceId,
          requestId: request.requestId,
        },
      },
      {
        stripeAccount: DEFAULT_STRIPE_ACCOUNT_ID,
        idempotencyKey: request.requestId,
      },
    );
    expect(ledger.debitAvailableForPayout).toHaveBeenCalledWith({
      accountBalanceId: request.accountBalanceId,
      amountCents: request.amountCents,
      reference: { type: 'payout', id: request.requestId },
      metadata: makeLedgerMetadata(request.requestId),
    });
    expect(ledger.creditAvailableByAdjustment).not.toHaveBeenCalled();
    expect(financialAlert.withdrawalFailed).not.toHaveBeenCalled();
    expect(result).toEqual({
      payoutId: DEFAULT_PAYOUT_ID,
      status: 'pending',
      accountBalanceId: request.accountBalanceId,
      stripeAccountId: DEFAULT_STRIPE_ACCOUNT_ID,
      amountCents: request.amountCents,
    });
  });

  it('throws when the account balance does not exist', async () => {
    const { service, stripe, financialAlert } = await createHarness({
      balance: null,
    });

    await expect(
      service.createPayout(
        makePayoutRequest({
          accountBalanceId: 'cab_missing',
          amountCents: 1_000n,
          requestId: 'po_req_missing',
        }),
      ),
    ).rejects.toBeInstanceOf(AccountBalanceNotFoundError);
    expect(stripe.stripe.payouts.create).not.toHaveBeenCalled();
    expect(stripe.stripe.accounts.retrieve).not.toHaveBeenCalled();
    expect(financialAlert.withdrawalFailed).not.toHaveBeenCalled();
  });

  it('throws before touching Stripe when available balance is insufficient', async () => {
    const { service, stripe, financialAlert } = await createHarness({
      balance: makeBalance({ availableBalanceCents: 999n }),
    });

    await expect(
      service.createPayout(
        makePayoutRequest({
          amountCents: 1_000n,
          requestId: 'po_req_short',
        }),
      ),
    ).rejects.toBeInstanceOf(InsufficientAvailableBalanceError);
    expect(stripe.stripe.accounts.retrieve).not.toHaveBeenCalled();
    expect(stripe.stripe.payouts.create).not.toHaveBeenCalled();
    expect(financialAlert.withdrawalFailed).not.toHaveBeenCalled();
  });

  it('blocks payout execution before ledger debit when Stripe payouts are disabled', async () => {
    const { service, stripe, ledger } = await createHarness({
      stripeAccount: makeStripeAccount({
        payouts_enabled: false,
        requirements: {
          disabled_reason: 'requirements.pending_verification',
        },
      }),
    });

    await expect(
      service.createPayout(
        makePayoutRequest({
          amountCents: 1_000n,
          requestId: 'po_req_disabled',
        }),
      ),
    ).rejects.toBeInstanceOf(ConnectPayoutsNotEnabledError);

    expect(stripe.stripe.accounts.retrieve).toHaveBeenCalledWith(DEFAULT_STRIPE_ACCOUNT_ID);
    expect(ledger.debitAvailableForPayout).not.toHaveBeenCalled();
    expect(stripe.stripe.payouts.create).not.toHaveBeenCalled();
  });

  it('recredits the local balance if Stripe payout creation fails synchronously after the local debit', async () => {
    const stripeTimeout = new Error('stripe timeout');
    const { service, ledger, financialAlert } = await createHarness({
      payoutError: stripeTimeout,
    });

    const request = makePayoutRequest({
      requestId: 'po_req_timeout',
    });

    await expect(service.createPayout(request)).rejects.toThrow('stripe timeout');

    expect(ledger.debitAvailableForPayout).toHaveBeenCalledWith({
      accountBalanceId: request.accountBalanceId,
      amountCents: request.amountCents,
      reference: { type: 'payout', id: request.requestId },
      metadata: makeLedgerMetadata(request.requestId),
    });
    expect(ledger.creditAvailableByAdjustment).toHaveBeenCalledWith({
      accountBalanceId: request.accountBalanceId,
      amountCents: request.amountCents,
      reference: { type: 'payout_failed_request', id: request.requestId },
      metadata: {
        requestId: request.requestId,
        stripeAccountId: DEFAULT_STRIPE_ACCOUNT_ID,
      },
    });
    expect(financialAlert.withdrawalFailed).toHaveBeenCalledWith(expect.any(Error), {
      workspaceId: DEFAULT_WORKSPACE_ID,
      amount: Number(request.amountCents),
    });
  });
});
