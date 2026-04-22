import { MetaWebhookController } from './meta-webhook.controller';

type MetaWhatsAppMock = {
  resolveWorkspaceIdByPhoneNumberId: jest.Mock;
  touchWebhookHeartbeat: jest.Mock;
};

type InboundProcessorMock = {
  process: jest.Mock;
};

type OmnichannelServiceMock = {
  processInstagramWebhook: jest.Mock;
  handleIncomingMessage: jest.Mock;
};

type PrismaMock = {
  metaConnection: {
    findFirst: jest.Mock;
  };
  message: {
    updateMany: jest.Mock;
  };
};

type MetaLeadgenMock = {
  captureRealtimePageLeadgen: jest.Mock;
};

describe('MetaWebhookController', () => {
  let metaWhatsApp: MetaWhatsAppMock;
  let inboundProcessor: InboundProcessorMock;
  let omnichannelService: OmnichannelServiceMock;
  let prisma: PrismaMock;
  let metaLeadgen: MetaLeadgenMock;
  let controller: MetaWebhookController;

  beforeEach(() => {
    metaWhatsApp = {
      resolveWorkspaceIdByPhoneNumberId: jest.fn(),
      touchWebhookHeartbeat: jest.fn(),
    };
    inboundProcessor = {
      process: jest.fn(),
    };
    omnichannelService = {
      processInstagramWebhook: jest.fn(),
      handleIncomingMessage: jest.fn(),
    };
    prisma = {
      metaConnection: {
        findFirst: jest.fn(),
      },
      message: {
        updateMany: jest.fn(),
      },
    };
    metaLeadgen = {
      captureRealtimePageLeadgen: jest.fn(),
    };

    controller = new MetaWebhookController(
      metaWhatsApp as unknown as ConstructorParameters<typeof MetaWebhookController>[0],
      inboundProcessor as unknown as ConstructorParameters<typeof MetaWebhookController>[1],
      omnichannelService as unknown as ConstructorParameters<typeof MetaWebhookController>[2],
      prisma as unknown as ConstructorParameters<typeof MetaWebhookController>[3],
      metaLeadgen as unknown as ConstructorParameters<typeof MetaWebhookController>[4],
    );
  });

  it('routes page leadgen and messenger payloads to the correct workspace', async () => {
    prisma.metaConnection.findFirst.mockResolvedValue({ workspaceId: 'ws-1' });

    const result = await controller.handleWebhook(
      {
        object: 'page',
        entry: [
          {
            id: 'page-1',
            time: 1713723000,
            changes: [
              {
                field: 'leadgen',
                value: {
                  leadgen_id: 'lead-1',
                  page_id: 'page-1',
                  form_id: 'form-1',
                },
              },
            ],
            messaging: [
              {
                sender: { id: 'user-1', name: 'Ana' },
                recipient: { id: 'page-1' },
                timestamp: 1713723000,
                message: { mid: 'mid-1', text: 'quero saber mais' },
              },
            ],
          },
        ],
      },
      '',
    );

    expect(result).toBe('ok');
    expect(metaLeadgen.captureRealtimePageLeadgen).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'page-1',
      }),
      'ws-1',
    );
    expect(omnichannelService.handleIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        channel: 'MESSENGER',
        externalId: 'mid-1',
        from: 'user-1',
        fromName: 'Ana',
        content: 'quero saber mais',
      }),
    );
  });
});
