import { MetaWebhookController } from './meta-webhook.controller';

describe('MetaWebhookController', () => {
  let metaWhatsApp: any;
  let inboundProcessor: any;
  let omnichannelService: any;
  let prisma: any;
  let metaLeadgen: any;
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
      metaWhatsApp,
      inboundProcessor,
      omnichannelService,
      prisma,
      metaLeadgen,
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
