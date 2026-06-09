/**
 * Proves the Stage-7 WalletAnticipation cents DUAL-WRITE on the row builder:
 *   - Flag OFF (default): the payload has NO *InCents keys → byte-identical to
 *     the pre-migration shape (the Float columns stay the sole source of truth).
 *   - Flag ON: the payload ALSO carries the three BigInt cents columns derived
 *     from the same Float amounts via the canonical rounding.
 *   - The Float/legacy fields are unchanged in BOTH states.
 */
import { buildWalletAnticipationRowData } from './wallet.helpers.responses';

const FLAG = 'KLOEL_ANTICIPATION_CENTS_DUALWRITE';

const input = {
  workspaceId: 'ws-1',
  amount: 100,
  feePercent: 3,
  feeAmount: 3,
  netAmount: 97,
  transactionId: 'tx-1',
};

describe('buildWalletAnticipationRowData — cents dual-write', () => {
  const prev = process.env[FLAG];
  afterEach(() => {
    if (prev === undefined) delete process.env[FLAG];
    else process.env[FLAG] = prev;
  });

  it('flag OFF (default): payload has no *InCents keys (byte-identical legacy)', () => {
    delete process.env[FLAG];
    const row = buildWalletAnticipationRowData(input);
    expect(row).toEqual({
      workspaceId: 'ws-1',
      originalAmount: 100,
      feePercent: 3,
      feeAmount: 3,
      netAmount: 97,
      installments: null,
      status: 'COMPLETED',
      transactionId: 'tx-1',
    });
    expect('originalAmountInCents' in row).toBe(false);
    expect('feeAmountInCents' in row).toBe(false);
    expect('netAmountInCents' in row).toBe(false);
  });

  it('flag ON: payload ALSO carries the three derived cents columns', () => {
    process.env[FLAG] = 'true';
    const row = buildWalletAnticipationRowData(input);
    expect(row).toMatchObject({
      originalAmount: 100,
      feeAmount: 3,
      netAmount: 97,
      originalAmountInCents: 10000n,
      feeAmountInCents: 300n,
      netAmountInCents: 9700n,
    });
  });

  it('flag ON: legacy Float fields are unchanged', () => {
    process.env[FLAG] = 'true';
    const row = buildWalletAnticipationRowData({ ...input, installments: 12 });
    expect(row.originalAmount).toBe(100);
    expect(row.feeAmount).toBe(3);
    expect(row.netAmount).toBe(97);
    expect(row.installments).toBe(12);
    expect(row.status).toBe('COMPLETED');
  });

  it('treats any non-true value as OFF', () => {
    process.env[FLAG] = 'yes';
    const row = buildWalletAnticipationRowData(input);
    expect('originalAmountInCents' in row).toBe(false);
  });
});
