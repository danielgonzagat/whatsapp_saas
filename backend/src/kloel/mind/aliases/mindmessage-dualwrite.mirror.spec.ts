import { mirrorMindMessage, type MindMessagePrismaLike } from './mindmessage-dualwrite.mirror';

/**
 * Proves the SINGLE canonical `RAC_MindMessage` dual-write helper that the four
 * legacy message surfaces (channel/inbox, thread, dashboard, lead conversation)
 * all delegate to. Contract (byte-identical to the four originals it replaced):
 *
 *   - flag OFF (default)         → no-op: `prisma.mindMessage.create` is never called;
 *   - flag ON                    → exactly one `create({ data: { workspaceId, source, role, content } })`;
 *   - flag ON + create rejects   → fail-open: never throws, `onError` is invoked with the error.
 *
 * @see backend/src/kloel/mind/aliases/mindmessage-dualwrite.mirror.ts
 * @see backend/src/kloel/mind/aliases/mindmessage-dualwrite.flag.ts
 */
function makePrismaMock() {
  const create = jest.fn().mockResolvedValue({ id: 'mm-1' });
  return {
    create,
    prisma: { mindMessage: { create } } as unknown as MindMessagePrismaLike,
  };
}

const ORIGINAL_FLAG = process.env.KLOEL_MINDMESSAGE_DUALWRITE;

describe('mirrorMindMessage (canonical RAC_MindMessage dual-write)', () => {
  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) {
      delete process.env.KLOEL_MINDMESSAGE_DUALWRITE;
    } else {
      process.env.KLOEL_MINDMESSAGE_DUALWRITE = ORIGINAL_FLAG;
    }
    jest.clearAllMocks();
  });

  it('flag OFF (unset) → no-op, never touches prisma', async () => {
    delete process.env.KLOEL_MINDMESSAGE_DUALWRITE;
    const { create, prisma } = makePrismaMock();
    const onError = jest.fn();

    await mirrorMindMessage(
      prisma,
      { workspaceId: 'ws-1', source: 'thread', role: 'user', content: 'oi' },
      onError,
    );

    expect(create).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("flag OFF (value !== 'true') → no-op", async () => {
    process.env.KLOEL_MINDMESSAGE_DUALWRITE = 'false';
    const { create, prisma } = makePrismaMock();

    await mirrorMindMessage(
      prisma,
      { workspaceId: 'ws-1', source: 'channel', role: 'assistant', content: 'oi' },
      jest.fn(),
    );

    expect(create).not.toHaveBeenCalled();
  });

  it('flag ON → exactly one create with the canonical { workspaceId, source, role, content } shape', async () => {
    process.env.KLOEL_MINDMESSAGE_DUALWRITE = 'true';
    const { create, prisma } = makePrismaMock();
    const onError = jest.fn();

    await mirrorMindMessage(
      prisma,
      { workspaceId: 'ws-1', source: 'lead_conversation', role: 'user', content: 'olá' },
      onError,
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'ws-1',
        source: 'lead_conversation',
        role: 'user',
        content: 'olá',
      },
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it('preserves the per-call source discriminator verbatim', async () => {
    process.env.KLOEL_MINDMESSAGE_DUALWRITE = 'true';
    const { create, prisma } = makePrismaMock();

    await mirrorMindMessage(
      prisma,
      { workspaceId: 'ws-1', source: 'dashboard', role: 'user', content: 'x' },
      jest.fn(),
    );

    expect(create).toHaveBeenCalledWith({
      data: { workspaceId: 'ws-1', source: 'dashboard', role: 'user', content: 'x' },
    });
  });

  it('flag ON + create rejects → fail-open: never throws, onError receives the error', async () => {
    process.env.KLOEL_MINDMESSAGE_DUALWRITE = 'true';
    const { create, prisma } = makePrismaMock();
    const boom = new Error('canonical table down');
    create.mockRejectedValueOnce(boom);
    const onError = jest.fn();

    await expect(
      mirrorMindMessage(
        prisma,
        { workspaceId: 'ws-1', source: 'thread', role: 'user', content: 'falha esperada' },
        onError,
      ),
    ).resolves.toBeUndefined();

    expect(create).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(boom);
  });
});
