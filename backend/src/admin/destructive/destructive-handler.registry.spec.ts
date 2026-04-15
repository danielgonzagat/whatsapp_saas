import { DestructiveIntentKind } from '@prisma/client';
import {
  DestructiveIntentRegistry,
  UnsupportedUndoError,
  type DestructiveHandler,
} from './destructive-handler.registry';

function stubHandler(overrides: Partial<DestructiveHandler> = {}): DestructiveHandler {
  return {
    kind: DestructiveIntentKind.ACCOUNT_SUSPEND,
    reversible: true,
    requiresOtp: false,
    execute: async () => ({ ok: true, snapshot: {} }),
    undo: async () => ({ ok: true, snapshot: {} }),
    ...overrides,
  };
}

describe('DestructiveIntentRegistry', () => {
  it('resolves registered handlers by kind', () => {
    const registry = new DestructiveIntentRegistry();
    const handler = stubHandler({ kind: DestructiveIntentKind.PRODUCT_ARCHIVE });
    registry.register(handler);
    expect(registry.resolve(DestructiveIntentKind.PRODUCT_ARCHIVE)).toBe(handler);
    expect(registry.resolve(DestructiveIntentKind.ACCOUNT_SUSPEND)).toBeNull();
  });

  it('rejects duplicate registration for the same kind (invariant I-ADMIN-D6)', () => {
    const registry = new DestructiveIntentRegistry();
    registry.register(stubHandler({ kind: DestructiveIntentKind.REFUND_MANUAL }));
    expect(() =>
      registry.register(stubHandler({ kind: DestructiveIntentKind.REFUND_MANUAL })),
    ).toThrow(/already registered/);
  });

  it('lists registered kinds sorted', () => {
    const registry = new DestructiveIntentRegistry();
    registry.register(stubHandler({ kind: DestructiveIntentKind.PRODUCT_ARCHIVE }));
    registry.register(stubHandler({ kind: DestructiveIntentKind.ACCOUNT_SUSPEND }));
    expect(registry.listRegistered()).toEqual(
      [DestructiveIntentKind.ACCOUNT_SUSPEND, DestructiveIntentKind.PRODUCT_ARCHIVE].sort(),
    );
  });

  it('UnsupportedUndoError carries the offending kind', () => {
    const err = new UnsupportedUndoError(DestructiveIntentKind.ACCOUNT_HARD_DELETE);
    expect(err.message).toMatch(/ACCOUNT_HARD_DELETE/);
    expect(err.message).toMatch(/I-ADMIN-D1/);
  });
});
