import { computeBalanceAfter } from './shared-ledger.port';

describe('SharedLedger port — computeBalanceAfter', () => {
  it('adds the magnitude to the prior balance on credit', () => {
    expect(computeBalanceAfter(1000n, 'credit', 250n)).toBe(1250n);
  });

  it('subtracts the magnitude from the prior balance on debit', () => {
    expect(computeBalanceAfter(1000n, 'debit', 250n)).toBe(750n);
  });

  it('may drive the balance negative on debit (reserve absorption semantics)', () => {
    expect(computeBalanceAfter(100n, 'debit', 250n)).toBe(-150n);
  });

  it('treats a zero amount as a no-op that still returns the prior balance', () => {
    expect(computeBalanceAfter(1000n, 'credit', 0n)).toBe(1000n);
    expect(computeBalanceAfter(1000n, 'debit', 0n)).toBe(1000n);
  });

  it('preserves the balanceAfter == prior + signed(direction)*amount invariant', () => {
    const prior = 4242n;
    const amount = 1337n;
    expect(computeBalanceAfter(prior, 'credit', amount)).toBe(prior + amount);
    expect(computeBalanceAfter(prior, 'debit', amount)).toBe(prior - amount);
  });

  it('rejects a negative magnitude as a caller bug (sign is the direction, not the amount)', () => {
    expect(() => computeBalanceAfter(1000n, 'credit', -1n)).toThrow(/non-negative/);
    expect(() => computeBalanceAfter(1000n, 'debit', -1n)).toThrow(/non-negative/);
  });
});
