import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Static invariant tests for the PlatformWalletService surface.
 *
 * These are source-level assertions that protect the SP-9 design
 * without requiring a real database. They fail fast if a future
 * edit accidentally exposes mutation primitives (update/delete)
 * or drops the $transaction atomicity wrapper.
 */
describe('PlatformWalletService — invariants', () => {
  const servicePath = join(__dirname, 'platform-wallet.service.ts');
  const source = readFileSync(servicePath, 'utf8');

  it('I-ADMIN-W2: the public surface never exposes update() or delete()', () => {
    // Grep for method names that would violate append-only. The
    // service legitimately calls client.platformWallet.update inside
    // append(), but it must NOT expose a generic update/delete API
    // on the service class itself.
    const publicMethodPattern = /async\s+(\w+)\s*\(/g;
    const methods = new Set<string>();
    for (const match of source.matchAll(publicMethodPattern)) {
      methods.add(match[1]);
    }
    // Allowed public methods (v0 surface).
    const allowed = new Set([
      'readBalance',
      'listLedger',
      'append',
      'debitAvailableForPayout',
      'creditAvailableByAdjustment',
    ]);
    // Disallow internal-looking names that could signal direct mutation.
    const forbidden = ['update', 'delete', 'drop', 'reset', 'zero'];
    for (const name of methods) {
      if (!allowed.has(name)) {
        expect(forbidden).not.toContain(name);
      }
    }
  });

  it('I-ADMIN-W3: append() wraps work in a $transaction when no tx is passed', () => {
    // Look for the literal "$transaction" inside the append body.
    const appendStart = source.indexOf('async append(');
    expect(appendStart).toBeGreaterThan(0);
    const tail = source.slice(appendStart);
    // Find the matching closing brace for the method. For v0 the
    // method is small enough that we just check the next 3000 chars.
    const body = tail.slice(0, 3000);
    expect(body).toContain('$transaction');
  });

  it('I-ADMIN-W4: amountInCents is typed as bigint, not number', () => {
    // AppendLedgerInput.amountInCents must be bigint. If a future
    // edit widens to number we catch it here.
    const pattern = /amountInCents:\s*bigint/;
    expect(pattern.test(source)).toBe(true);
  });
});
