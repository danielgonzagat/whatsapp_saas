/**
 * Proves the money cutover bootstrap runner (twin of MindCutoverBootstrapService):
 *   - both flags OFF (default): onApplicationBootstrap does NOT touch either
 *     backfill (silent no-op at boot);
 *   - anticipation flag ON: runs anticipation backfill + parity, detached;
 *   - ledger flag ON: runs ledger backfill + parity, detached;
 *   - a backfill throwing is swallowed (never crashes boot).
 */
import { MoneyCutoverBootstrapService } from './money-cutover-bootstrap.service';

const A_FLAG = 'KLOEL_ANTICIPATION_CENTS_BACKFILL';
const L_FLAG = 'KLOEL_LEDGER_BALANCE_BACKFILL';

function makeService() {
  const anticipation = {
    backfill: jest.fn().mockResolvedValue({
      enabled: true,
      scanned: 1,
      updated: 1,
      skipped: 0,
      batches: 1,
    }),
    parity: jest.fn().mockResolvedValue({ rows: 1, matched: 1, mismatched: 0, coverage: 1 }),
  };
  const ledger = {
    backfill: jest.fn().mockResolvedValue({
      enabled: true,
      wallets: 1,
      scanned: 1,
      updated: 1,
      batches: 1,
    }),
    parity: jest.fn().mockResolvedValue({ rows: 1, matched: 1, mismatched: 0, coverage: 1 }),
  };
  const svc = new MoneyCutoverBootstrapService(anticipation as never, ledger as never);
  return { svc, anticipation, ledger };
}

// Let the detached `void this.run()` microtasks settle.
const flush = () => new Promise((r) => setImmediate(r));

describe('MoneyCutoverBootstrapService', () => {
  const prevA = process.env[A_FLAG];
  const prevL = process.env[L_FLAG];
  afterEach(() => {
    if (prevA === undefined) delete process.env[A_FLAG];
    else process.env[A_FLAG] = prevA;
    if (prevL === undefined) delete process.env[L_FLAG];
    else process.env[L_FLAG] = prevL;
  });

  it('is a silent no-op when both flags are OFF (default)', async () => {
    delete process.env[A_FLAG];
    delete process.env[L_FLAG];
    const { svc, anticipation, ledger } = makeService();
    svc.onApplicationBootstrap();
    await flush();
    expect(anticipation.backfill).not.toHaveBeenCalled();
    expect(ledger.backfill).not.toHaveBeenCalled();
  });

  it('runs the anticipation backfill + parity when its flag is ON', async () => {
    process.env[A_FLAG] = 'true';
    delete process.env[L_FLAG];
    const { svc, anticipation, ledger } = makeService();
    svc.onApplicationBootstrap();
    await flush();
    expect(anticipation.backfill).toHaveBeenCalledTimes(1);
    expect(anticipation.parity).toHaveBeenCalledTimes(1);
    expect(ledger.backfill).not.toHaveBeenCalled();
  });

  it('runs the ledger balance backfill + parity when its flag is ON', async () => {
    delete process.env[A_FLAG];
    process.env[L_FLAG] = 'true';
    const { svc, anticipation, ledger } = makeService();
    svc.onApplicationBootstrap();
    await flush();
    expect(ledger.backfill).toHaveBeenCalledTimes(1);
    expect(ledger.parity).toHaveBeenCalledTimes(1);
    expect(anticipation.backfill).not.toHaveBeenCalled();
  });

  it('swallows a backfill error (never crashes boot)', async () => {
    process.env[A_FLAG] = 'true';
    delete process.env[L_FLAG];
    const { svc, anticipation } = makeService();
    anticipation.backfill.mockRejectedValueOnce(new Error('db down'));
    expect(() => svc.onApplicationBootstrap()).not.toThrow();
    await flush();
    // parity is not reached after the backfill throw, but no exception escapes
    expect(anticipation.backfill).toHaveBeenCalledTimes(1);
  });
});
