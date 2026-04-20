import { DestructiveIntentKind } from '@prisma/client';
import { UnsupportedUndoError } from '../../destructive/destructive-handler.registry';
import type { DestructiveIntentRecord } from '../../destructive/destructive-intent.types';
import { ProductArchiveHandler, ProductDeleteHandler } from './product-destructive.handler';

type ProductRow = {
  id: string;
  active: boolean;
  status: string;
  name: string;
  workspaceId: string;
};

function fakePrisma(initial: ProductRow | null) {
  let row = initial;
  return {
    state: () => row,
    product: {
      findUnique: jest.fn(async () => row),
      update: jest.fn(async ({ data }: { data: Partial<ProductRow> }) => {
        if (!row) {
          throw new Error('not found');
        }
        row = { ...row, ...data };
        return row;
      }),
      delete: jest.fn(async () => {
        row = null;
        return null;
      }),
    },
  };
}

function fakeIntent(kind: DestructiveIntentKind): DestructiveIntentRecord {
  return {
    id: 'intent-1',
    kind,
    targetType: 'Product',
    targetId: 'prod-1',
    reason: 'test',
    challenge: 'AB12CD',
    requiresOtp: false,
    reversible: true,
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

describe('ProductArchiveHandler', () => {
  it('flips active/status and snapshots previous values', async () => {
    const prisma = fakePrisma({
      id: 'prod-1',
      active: true,
      status: 'APPROVED',
      name: 'Test',
      workspaceId: 'ws-1',
    });
    const handler = new ProductArchiveHandler(prisma as never);
    const result = await handler.execute(fakeIntent(DestructiveIntentKind.PRODUCT_ARCHIVE));
    expect(result.ok).toBe(true);
    expect(result.snapshot).toMatchObject({
      previousActive: true,
      previousStatus: 'APPROVED',
      productId: 'prod-1',
    });
    expect(prisma.state()).toMatchObject({ active: false, status: 'ARCHIVED' });
  });

  it('undo() restores the pre-archive state from the snapshot', async () => {
    const prisma = fakePrisma({
      id: 'prod-1',
      active: false,
      status: 'ARCHIVED',
      name: 'Test',
      workspaceId: 'ws-1',
    });
    const intent = fakeIntent(DestructiveIntentKind.PRODUCT_ARCHIVE);
    intent.resultSnapshot = { previousActive: true, previousStatus: 'APPROVED' };
    const handler = new ProductArchiveHandler(prisma as never);
    const result = await handler.undo(intent);
    expect(result.ok).toBe(true);
    expect(prisma.state()).toMatchObject({ active: true, status: 'APPROVED' });
  });

  it('execute returns ok=false when the product is missing', async () => {
    const prisma = fakePrisma(null);
    const handler = new ProductArchiveHandler(prisma as never);
    const result = await handler.execute(fakeIntent(DestructiveIntentKind.PRODUCT_ARCHIVE));
    expect(result.ok).toBe(false);
    expect(result.snapshot).toEqual({ error: 'product_not_found' });
  });
});

describe('ProductDeleteHandler', () => {
  it('hard-deletes the product row', async () => {
    const prisma = fakePrisma({
      id: 'prod-1',
      active: true,
      status: 'APPROVED',
      name: 'Test',
      workspaceId: 'ws-1',
    });
    const handler = new ProductDeleteHandler(prisma as never);
    const result = await handler.execute(fakeIntent(DestructiveIntentKind.PRODUCT_DELETE));
    expect(result.ok).toBe(true);
    expect(prisma.state()).toBeNull();
  });

  it('undo() throws UnsupportedUndoError (delete is irreversible)', async () => {
    const prisma = fakePrisma(null);
    const handler = new ProductDeleteHandler(prisma as never);
    await expect(handler.undo()).rejects.toThrow(UnsupportedUndoError);
  });
});
