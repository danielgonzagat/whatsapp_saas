import { Logger } from '@nestjs/common';
import {
  dualWriteLeadConversationMindMessage,
  saveLeadMessage,
} from './kloel-lead-processor-helpers';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Proves the canonical lead-conversation → MindMessage mirror (Brain→Mind message
 * convergence, source: 'lead_conversation'). The mirror is gated by
 * `KLOEL_MINDMESSAGE_DUALWRITE` (default OFF), additive, and fail-open — it must
 * never alter or break the legacy KloelConversation write.
 *
 * @see backend/src/kloel/kloel-lead-processor-helpers.ts
 * @see backend/src/kloel/mind/aliases/mindmessage-dualwrite.flag.ts
 */
function makePrismaMock() {
  return {
    kloelConversation: { create: jest.fn().mockResolvedValue({ id: 'kc-1' }) },
    mindMessage: { create: jest.fn().mockResolvedValue({ id: 'mm-1' }) },
  };
}

type LoggerMock = Logger & {
  warn: jest.Mock;
  log: jest.Mock;
  error: jest.Mock;
};

function makeLogger(): LoggerMock {
  return { warn: jest.fn(), log: jest.fn(), error: jest.fn() } as unknown as LoggerMock;
}

const WS = 'ws-1';
const ORIGINAL_FLAG = process.env.KLOEL_MINDMESSAGE_DUALWRITE;

describe('dualWriteLeadConversationMindMessage', () => {
  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) {
      delete process.env.KLOEL_MINDMESSAGE_DUALWRITE;
    } else {
      process.env.KLOEL_MINDMESSAGE_DUALWRITE = ORIGINAL_FLAG;
    }
    jest.clearAllMocks();
  });

  it('writes a MindMessage with source=lead_conversation when the flag is ON', async () => {
    process.env.KLOEL_MINDMESSAGE_DUALWRITE = 'true';
    const prisma = makePrismaMock();
    await dualWriteLeadConversationMindMessage(
      prisma as unknown as PrismaService,
      makeLogger(),
      WS,
      'user',
      'olá',
    );
    expect(prisma.mindMessage.create).toHaveBeenCalledTimes(1);
    expect(prisma.mindMessage.create).toHaveBeenCalledWith({
      data: { workspaceId: WS, source: 'lead_conversation', role: 'user', content: 'olá' },
    });
  });

  it('is a no-op when the flag is OFF (default)', async () => {
    delete process.env.KLOEL_MINDMESSAGE_DUALWRITE;
    const prisma = makePrismaMock();
    await dualWriteLeadConversationMindMessage(
      prisma as unknown as PrismaService,
      makeLogger(),
      WS,
      'assistant',
      'oi',
    );
    expect(prisma.mindMessage.create).not.toHaveBeenCalled();
  });

  it('skips when workspaceId or content is empty (even with flag ON)', async () => {
    process.env.KLOEL_MINDMESSAGE_DUALWRITE = 'true';
    const prisma = makePrismaMock();
    const logger = makeLogger();
    await dualWriteLeadConversationMindMessage(
      prisma as unknown as PrismaService,
      logger,
      '',
      'user',
      'x',
    );
    await dualWriteLeadConversationMindMessage(
      prisma as unknown as PrismaService,
      logger,
      WS,
      'user',
      '',
    );
    expect(prisma.mindMessage.create).not.toHaveBeenCalled();
  });

  it('is fail-open: a mirror write error never throws and is warn-logged', async () => {
    process.env.KLOEL_MINDMESSAGE_DUALWRITE = 'true';
    const prisma = makePrismaMock();
    prisma.mindMessage.create.mockRejectedValueOnce(new Error('db down'));
    const logger = makeLogger();
    await expect(
      dualWriteLeadConversationMindMessage(
        prisma as unknown as PrismaService,
        logger,
        WS,
        'user',
        'falha esperada',
      ),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('saveLeadMessage (legacy write + canonical mirror)', () => {
  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) {
      delete process.env.KLOEL_MINDMESSAGE_DUALWRITE;
    } else {
      process.env.KLOEL_MINDMESSAGE_DUALWRITE = ORIGINAL_FLAG;
    }
    jest.clearAllMocks();
  });

  it('always writes the legacy KloelConversation, and mirrors when workspaceId is passed + flag ON', async () => {
    process.env.KLOEL_MINDMESSAGE_DUALWRITE = 'true';
    const prisma = makePrismaMock();
    await saveLeadMessage(
      prisma as unknown as PrismaService,
      makeLogger(),
      'lead-1',
      'user',
      'oi',
      WS,
    );
    expect(prisma.kloelConversation.create).toHaveBeenCalledWith({
      data: { leadId: 'lead-1', role: 'user', content: 'oi' },
    });
    expect(prisma.mindMessage.create).toHaveBeenCalledTimes(1);
  });

  it('does NOT mirror when workspaceId is omitted (byte-identical legacy path)', async () => {
    process.env.KLOEL_MINDMESSAGE_DUALWRITE = 'true';
    const prisma = makePrismaMock();
    await saveLeadMessage(prisma as unknown as PrismaService, makeLogger(), 'lead-1', 'user', 'oi');
    expect(prisma.kloelConversation.create).toHaveBeenCalledTimes(1);
    expect(prisma.mindMessage.create).not.toHaveBeenCalled();
  });

  it('legacy write failure is swallowed and never blocks (fail-open)', async () => {
    delete process.env.KLOEL_MINDMESSAGE_DUALWRITE;
    const prisma = makePrismaMock();
    prisma.kloelConversation.create.mockRejectedValueOnce(new Error('db down'));
    const logger = makeLogger();
    await expect(
      saveLeadMessage(prisma as unknown as PrismaService, logger, 'lead-1', 'user', 'oi', WS),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
