import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { MassSendController } from './mass-send.controller';
import { MassSendService } from './mass-send.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

describe('MassSendController', () => {
  let controller: MassSendController;
  let module: TestingModule;
  const enqueueCampaign = jest.fn();
  const approvalCreate = jest.fn();
  const approvalFindFirst = jest.fn();
  const approvalUpdateMany = jest.fn();

  const makeRequest = (): AuthenticatedRequest =>
    ({
      user: {
        sub: 'agent_1',
        email: 'owner@kloel.test',
        workspaceId: 'ws_1',
        role: 'ADMIN',
      },
      workspaceId: 'ws_1',
    }) as unknown as AuthenticatedRequest;

  beforeEach(async () => {
    enqueueCampaign.mockReset();
    approvalCreate.mockReset();
    approvalFindFirst.mockReset();
    approvalUpdateMany.mockReset();

    module = await Test.createTestingModule({
      controllers: [MassSendController],
      providers: [
        {
          provide: MassSendService,
          useValue: { enqueueCampaign },
        },
        {
          provide: PrismaService,
          useValue: {
            approvalRequest: {
              create: approvalCreate,
              findFirst: approvalFindFirst,
              updateMany: approvalUpdateMany,
            },
          },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn(), verify: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<MassSendController>(MassSendController);
  });

  afterAll(async () => {
    await module?.close();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates an approval request before enqueueing a WhatsApp mass campaign', async () => {
    approvalCreate.mockResolvedValue({
      id: 'apr_1',
      state: 'OPEN',
      title: 'Aprovar campanha WhatsApp',
      createdAt: new Date('2026-05-11T00:00:00.000Z'),
    });

    const result = await controller.startCampaign(makeRequest(), {
      workspaceId: 'ws_1',
      user: 'owner@kloel.test',
      numbers: ['+5511999999999', '+5511888888888'],
      message: 'Oferta aprovada?',
    });

    expect(enqueueCampaign).not.toHaveBeenCalled();
    expect(approvalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'ws_1',
          kind: 'whatsapp_campaign:start',
          entityType: 'WhatsAppMassSendCampaign',
          state: 'OPEN',
          payload: expect.objectContaining({
            numbers: ['+5511999999999', '+5511888888888'],
            message: 'Oferta aprovada?',
            risk: 'high',
            requiresApproval: true,
          }),
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        approvalRequired: true,
        approvalRequestId: 'apr_1',
        approvalState: 'OPEN',
      }),
    );
  });

  it('executes the campaign only with an approved request payload', async () => {
    approvalFindFirst.mockResolvedValue({
      id: 'apr_1',
      payload: {
        user: 'owner@kloel.test',
        numbers: ['+5511999999999'],
        message: 'Mensagem aprovada',
      },
    });
    enqueueCampaign.mockResolvedValue({ jobId: 'job_1' });

    const result = await controller.startCampaign(makeRequest(), {
      workspaceId: 'ws_1',
      approvalRequestId: 'apr_1',
    });

    expect(enqueueCampaign).toHaveBeenCalledWith(
      'ws_1',
      'owner@kloel.test',
      ['+5511999999999'],
      'Mensagem aprovada',
    );
    expect(approvalUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'apr_1', workspaceId: 'ws_1', state: 'APPROVED' },
        data: expect.objectContaining({ state: 'COMPLETED' }),
      }),
    );
    expect(result).toEqual({ approvalExecuted: true, jobId: 'job_1' });
  });

  it('rejects execution when the approval is not approved', async () => {
    approvalFindFirst.mockResolvedValue(null);

    await expect(
      controller.startCampaign(makeRequest(), {
        workspaceId: 'ws_1',
        approvalRequestId: 'apr_missing',
      }),
    ).rejects.toThrow('Approved WhatsApp campaign request not found');
    expect(enqueueCampaign).not.toHaveBeenCalled();
  });
});
