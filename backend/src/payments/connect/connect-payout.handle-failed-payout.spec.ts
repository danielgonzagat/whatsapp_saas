import {
  DEFAULT_ACCOUNT_BALANCE_ID,
  DEFAULT_AMOUNT_CENTS,
  DEFAULT_PAYOUT_ID,
  DEFAULT_REQUEST_ID,
  DEFAULT_WORKSPACE_ID,
  createHarness,
  makeBalance,
} from './connect-payout.service.spec.helpers';

describe('ConnectPayoutService.handleFailedPayout', () => {
  it('recredits the local available balance via an idempotent ledger adjustment', async () => {
    const { service, prisma, ledger, financialAlert } = await createHarness({
      balance: makeBalance(),
    });

    await service.handleFailedPayout({
      payoutId: DEFAULT_PAYOUT_ID,
      accountBalanceId: DEFAULT_ACCOUNT_BALANCE_ID,
      requestId: DEFAULT_REQUEST_ID,
      amountCents: DEFAULT_AMOUNT_CENTS,
    });

    expect(prisma.connectAccountBalance.findUnique).toHaveBeenCalledWith({
      where: { id: DEFAULT_ACCOUNT_BALANCE_ID },
      select: { workspaceId: true, stripeAccountId: true },
    });
    expect(ledger.creditAvailableByAdjustment).toHaveBeenCalledWith({
      accountBalanceId: DEFAULT_ACCOUNT_BALANCE_ID,
      amountCents: DEFAULT_AMOUNT_CENTS,
      reference: { type: 'payout_failed', id: DEFAULT_PAYOUT_ID },
      metadata: {
        requestId: DEFAULT_REQUEST_ID,
        stripePayoutId: DEFAULT_PAYOUT_ID,
      },
    });
    const [errorArg, contextArg] = financialAlert.withdrawalFailed.mock.calls[0];
    expect(errorArg).toBeInstanceOf(Error);
    expect(contextArg).toEqual({
      workspaceId: DEFAULT_WORKSPACE_ID,
      amount: Number(DEFAULT_AMOUNT_CENTS),
    });
  });

  it('uses payout_failed reference type to distinguish from payout_failed_request', async () => {
    const { service, ledger } = await createHarness();

    await service.handleFailedPayout({
      payoutId: 'po_webhook_9999',
      accountBalanceId: DEFAULT_ACCOUNT_BALANCE_ID,
      requestId: 'po_req_original',
      amountCents: 3000n,
    });

    expect(ledger.creditAvailableByAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: { type: 'payout_failed', id: 'po_webhook_9999' },
      }),
    );
  });

  it('handles missing balance lookup gracefully without throwing', async () => {
    const { service, ledger, financialAlert } = await createHarness({
      balance: null,
    });

    // Should not throw even if balance is null
    await service.handleFailedPayout({
      payoutId: DEFAULT_PAYOUT_ID,
      accountBalanceId: 'cab_missing',
      requestId: DEFAULT_REQUEST_ID,
      amountCents: DEFAULT_AMOUNT_CENTS,
    });

    expect(ledger.creditAvailableByAdjustment).toHaveBeenCalled();
    const [errorArg, contextArg] = financialAlert.withdrawalFailed.mock.calls[0];
    expect(errorArg).toBeInstanceOf(Error);
    expect(contextArg).toEqual(expect.objectContaining({ workspaceId: undefined }));
  });

  it('includes stripePayoutId in metadata for webhook audit correlation', async () => {
    const { service, ledger } = await createHarness();

    await service.handleFailedPayout({
      payoutId: 'po_webhook_correlate_123',
      accountBalanceId: DEFAULT_ACCOUNT_BALANCE_ID,
      requestId: 'po_req_original',
      amountCents: 5000n,
    });

    expect(ledger.creditAvailableByAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          stripePayoutId: 'po_webhook_correlate_123',
        }),
      }),
    );
  });
});
