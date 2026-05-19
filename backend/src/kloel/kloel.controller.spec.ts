import { KloelController } from './kloel.controller';

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
      toolDispatcher as never,
    );
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
        data: expect.objectContaining({
          state: 'APPROVED',
          response: expect.objectContaining({
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
        data: expect.objectContaining({
          state: 'ADJUSTMENT_REQUESTED',
          response: expect.objectContaining({
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
