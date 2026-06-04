import { FileTypeValidator } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { KloelController } from './kloel.controller';
import { partialMatch } from '../../test/helpers/match-instance';

function readUploadChatFileTypeValidator() {
  const routeArgs = Reflect.getMetadata(ROUTE_ARGS_METADATA, KloelController, 'uploadFile') as
    | Record<string, { pipes?: unknown[] }>
    | undefined;
  const pipes = Object.values(routeArgs ?? {}).flatMap((entry) => entry.pipes ?? []);
  const validators = pipes.flatMap((pipe) =>
    Array.isArray((pipe as { validators?: unknown[] }).validators)
      ? ((pipe as { validators?: unknown[] }).validators ?? [])
      : [],
  );
  const validator = validators.find(
    (item): item is FileTypeValidator =>
      typeof (item as FileTypeValidator | undefined)?.isValid === 'function' &&
      Boolean((item as { validationOptions?: { fileType?: unknown } }).validationOptions?.fileType),
  );
  if (!validator) {
    throw new Error('upload_chat_file_type_validator_not_found');
  }
  return validator;
}

describe('KloelController', () => {
  let kloelService: {
    thinkSync: jest.Mock;
  };
  let prisma: {
    approvalRequest: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    chatThread: {
      deleteMany: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let toolDispatcher: {
    executeApprovedApprovalRequest: jest.Mock;
  };
  let controller: KloelController;

  beforeEach(() => {
    kloelService = {
      thinkSync: jest.fn().mockResolvedValue({
        response: 'ok',
      }),
    };
    prisma = {
      approvalRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      chatThread: {
        deleteMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    toolDispatcher = {
      executeApprovedApprovalRequest: jest.fn().mockResolvedValue({
        success: true,
        approvalRequestId: 'approval-1',
        state: 'APPROVED',
        executed: false,
      }),
    };

    controller = new KloelController(
      kloelService as never,
      {} as never,
      {} as never,
      prisma as never as ConstructorParameters<typeof KloelController>[3],
      {} as never,
      {} as never,
      toolDispatcher as never,
    );
  });

  it('accepts plain text chat uploads through the controller file validator', async () => {
    const validator = readUploadChatFileTypeValidator();

    await expect(
      validator.isValid({
        buffer: Buffer.from('plain text upload proof'),
        originalname: 'proof.txt',
        mimetype: 'text/plain',
        size: 23,
      } as never),
    ).resolves.toBe(true);
  });

  it('uses legacy string user.id as a fallback when sub is absent', async () => {
    await controller.thinkSync({ message: 'oi' }, {
      workspaceId: 'ws-1',
      user: {
        id: 'legacy-user',
        workspaceId: 'ws-1',
      },
    } as never as Parameters<KloelController['thinkSync']>[1]);

    expect(kloelService.thinkSync).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        userId: 'legacy-user',
      }),
    );
  });

  it('ignores malformed legacy user.id values instead of forwarding objects', async () => {
    await controller.thinkSync({ message: 'oi' }, {
      workspaceId: 'ws-1',
      user: {
        id: { broken: true },
        workspaceId: 'ws-1',
      },
    } as never as Parameters<KloelController['thinkSync']>[1]);

    expect(kloelService.thinkSync).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
      }),
    );
  });

  it('lists chat threads without deleting empty in-flight threads', async () => {
    const updatedAt = new Date('2026-05-18T19:00:00.000Z');
    prisma.chatThread.findMany.mockResolvedValue([
      {
        id: 'thread-ready',
        title: 'Thread pronta',
        updatedAt,
        messages: [{ content: 'Mensagem persistida', role: 'assistant' }],
      },
    ]);
    prisma.chatThread.count.mockResolvedValue(1);

    const result = await controller.listChatThreads(
      { workspaceId: 'ws-1', user: { workspaceId: 'ws-1' } } as never as Parameters<
        KloelController['listChatThreads']
      >[0],
      '10',
    );

    expect(prisma.chatThread.deleteMany).not.toHaveBeenCalled();
    expect(prisma.chatThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'ws-1', messages: { some: {} } },
      }),
    );
    expect(result).toEqual({
      items: [
        {
          id: 'thread-ready',
          title: 'Thread pronta',
          updatedAt,
          lastMessagePreview: 'Mensagem persistida',
        },
      ],
      total: 1,
      nextCursor: null,
      hasMore: false,
    });
  });

  it('lists pending approvals for the authenticated workspace only', async () => {
    const createdAt = new Date('2026-05-11T18:00:00.000Z');
    prisma.approvalRequest.findMany.mockResolvedValue([
      {
        id: 'approval-1',
        kind: 'kloel_tool:create_campaign',
        scope: 'WORKSPACE',
        entityType: 'Campaign',
        entityId: null,
        state: 'OPEN',
        title: 'Approve campaign creation',
        prompt: 'Review this campaign before execution',
        payload: { name: 'May campaign' },
        createdAt,
        updatedAt: createdAt,
      },
    ]);

    const result = await controller.getPendingApprovals({
      workspaceId: 'ws-1',
      user: { workspaceId: 'ws-ignored' },
    } as never as Parameters<KloelController['getPendingApprovals']>[0]);

    expect(prisma.approvalRequest.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', state: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        kind: true,
        scope: true,
        entityType: true,
        entityId: true,
        state: true,
        title: true,
        prompt: true,
        payload: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(result).toEqual({
      approvals: [
        expect.objectContaining({
          id: 'approval-1',
          state: 'OPEN',
          payload: { name: 'May campaign' },
        }),
      ],
    });
  });

  it('rejects pending approval listing without a workspace', async () => {
    await expect(
      controller.getPendingApprovals({
        user: {},
      } as never as Parameters<KloelController['getPendingApprovals']>[0]),
    ).rejects.toThrow('workspace_id_required');

    expect(prisma.approvalRequest.findMany).not.toHaveBeenCalled();
  });

  it('approves an open approval request for the authenticated workspace', async () => {
    prisma.approvalRequest.findFirst.mockResolvedValue({
      id: 'approval-1',
      state: 'OPEN',
    });
    prisma.approvalRequest.updateMany.mockResolvedValue({ count: 1 });

    const result = await controller.approveApprovalRequest(
      ' approval-1 ',
      { note: 'Pode executar' },
      {
        workspaceId: 'ws-1',
        user: { sub: 'user-1', workspaceId: 'ws-1' },
      } as never as Parameters<KloelController['approveApprovalRequest']>[2],
    );

    expect(prisma.approvalRequest.findFirst).toHaveBeenCalledWith({
      where: { id: 'approval-1', workspaceId: 'ws-1' },
      select: { id: true, state: true },
    });
    expect(prisma.approvalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'approval-1', workspaceId: 'ws-1', state: 'OPEN' },
        data: partialMatch({
          state: 'APPROVED',
          response: partialMatch({
            action: 'approved',
            decidedByUserId: 'user-1',
            note: 'Pode executar',
          }),
        }),
      }),
    );
    expect(result).toEqual({
      success: true,
      approvalRequestId: 'approval-1',
      state: 'APPROVED',
    });
  });

  it('executes supported approvals after the owner approves them', async () => {
    prisma.approvalRequest.findFirst.mockResolvedValue({
      id: 'approval-1',
      state: 'OPEN',
    });
    prisma.approvalRequest.updateMany.mockResolvedValue({ count: 1 });
    toolDispatcher.executeApprovedApprovalRequest.mockResolvedValue({
      success: true,
      approvalRequestId: 'approval-1',
      state: 'COMPLETED',
      executed: true,
      result: { campaign: { id: 'campaign-1' } },
    });

    const result = await controller.approveApprovalRequest('approval-1', {}, {
      workspaceId: 'ws-1',
      user: { sub: 'user-1', workspaceId: 'ws-1' },
    } as never as Parameters<KloelController['approveApprovalRequest']>[2]);

    expect(toolDispatcher.executeApprovedApprovalRequest).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      approvalRequestId: 'approval-1',
      userId: 'user-1',
    });
    expect(result).toEqual({
      success: true,
      approvalRequestId: 'approval-1',
      state: 'COMPLETED',
      executed: true,
      result: { campaign: { id: 'campaign-1' } },
    });
  });

  it('rejects approval transitions for closed requests', async () => {
    prisma.approvalRequest.findFirst.mockResolvedValue({
      id: 'approval-1',
      state: 'APPROVED',
    });

    await expect(
      controller.rejectApprovalRequest('approval-1', { note: 'ja resolvido' }, {
        workspaceId: 'ws-1',
        user: { sub: 'user-1', workspaceId: 'ws-1' },
      } as never as Parameters<KloelController['rejectApprovalRequest']>[2]),
    ).rejects.toThrow('approval_request_not_open');

    expect(prisma.approvalRequest.updateMany).not.toHaveBeenCalled();
  });

  it('records requested adjustments without approving the action', async () => {
    prisma.approvalRequest.findFirst.mockResolvedValue({
      id: 'approval-1',
      state: 'OPEN',
    });
    prisma.approvalRequest.updateMany.mockResolvedValue({ count: 1 });

    const result = await controller.adjustApprovalRequest(
      'approval-1',
      { note: 'reduzir publico', adjustment: { targetAudience: 'warm_leads' } },
      {
        workspaceId: 'ws-1',
        user: { sub: 'user-1', workspaceId: 'ws-1' },
      } as never as Parameters<KloelController['adjustApprovalRequest']>[2],
    );

    expect(prisma.approvalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'approval-1', workspaceId: 'ws-1', state: 'OPEN' },
        data: partialMatch({
          state: 'ADJUSTMENT_REQUESTED',
          response: partialMatch({
            action: 'adjustment_requested',
            adjustment: { targetAudience: 'warm_leads' },
          }),
        }),
      }),
    );
    expect(result).toEqual({
      success: true,
      approvalRequestId: 'approval-1',
      state: 'ADJUSTMENT_REQUESTED',
    });
  });
});
