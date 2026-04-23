/** Marketplace treasury insufficient available balance error. */
export class MarketplaceTreasuryInsufficientAvailableBalanceError extends Error {
  constructor(
    public readonly currency: string,
    public readonly attemptedAmountInCents: bigint,
    public readonly availableAmountInCents: bigint,
  ) {
    super(
      `marketplace treasury insufficient available balance for ${currency}: attempted=${attemptedAmountInCents.toString()} available=${availableAmountInCents.toString()}`,
    );
    this.name = 'MarketplaceTreasuryInsufficientAvailableBalanceError';
  }
}
