import { DestructiveIntentKind } from '@prisma/client';
import { UnsupportedUndoError } from '../destructive-handler.registry';
import type { DestructiveIntentRecord } from '../destructive-intent.types';
import { ForceLogoutGlobalHandler } from './force-logout-global.handler';

function fakeIntent(): DestructiveIntentRecord {
  return {
    id: 'intent-1',
    kind: DestructiveIntentKind.FORCE_LOGOUT_GLOBAL,
    targetType: 'AdminSession',
    targetId: '*',
    reason: 'token leak',
    challenge: 'AB12CD',
    requiresOtp: true,
    reversible: false,
    status: 'CONFIRMED',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    confirmedAt: null,
    executedAt: null,
    executedByAdminUserId: null,
    failureMessage: null,
    resultSnapshot: null,
    undoTokenHash: null,
    undoExpiresAt: null,
    undoAt: null,
    createdByAdminUserId: 'admin-1',
    ip: '127.0.0.1',
    userAgent: 'jest',
  } as unknown as DestructiveIntentRecord;
}

describe('ForceLogoutGlobalHandler', () => {
  it('revokes every active session and reports the count', async () => {
    let revoked = 0;
    const prisma = {
      adminSession: {
        updateMany: jest.fn(async ({ where, data }: { where: unknown; data: unknown }) => {
          expect(where).toMatchObject({ revokedAt: null });
          expect(data).toMatchObject({ revokedAt: expect.any(Date) });
          revoked = 7;
          return { count: 7 };
        }),
      },
    };
    const handler = new ForceLogoutGlobalHandler(prisma as never);
    const result = await handler.execute(fakeIntent());
    expect(result.ok).toBe(true);
    expect(result.snapshot).toMatchObject({ revokedSessionCount: 7 });
    expect(revoked).toBe(7);
  });

  it('undo throws UnsupportedUndoError', async () => {
    const handler = new ForceLogoutGlobalHandler({} as never);
    await expect(handler.undo()).rejects.toThrow(UnsupportedUndoError);
  });
});
