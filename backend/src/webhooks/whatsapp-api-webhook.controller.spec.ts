import { WhatsAppApiWebhookController } from './whatsapp-api-webhook.controller';

describe('WhatsAppApiWebhookController', () => {
  let prisma: any;
  let inboundProcessor: any;
  let catchupService: any;
  let controller: WhatsAppApiWebhookController;

  beforeEach(() => {
    prisma = {
      workspace: {
        findUnique: jest.fn(async ({ where }: any) => {
          if (where.id === 'default') return null;
          if (where.id === 'ws-1') {
            return {
              id: 'ws-1',
              providerSettings: {
                whatsappProvider: 'whatsapp-api',
                whatsappApiSession: {
                  sessionName: 'default',
                },
              },
            };
          }
          return null;
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ws-1',
            providerSettings: {
              whatsappProvider: 'whatsapp-api',
              whatsappApiSession: {
                sessionName: 'default',
              },
            },
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      message: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    inboundProcessor = {
      process: jest.fn().mockResolvedValue({ deduped: false }),
    };

    catchupService = {
      triggerCatchup: jest.fn().mockResolvedValue({ scheduled: true }),
    };

    controller = new WhatsAppApiWebhookController(
      prisma,
      inboundProcessor,
      catchupService,
    );
  });

  it('maps sessionName to workspaceId when processing inbound messages', async () => {
    const result = await controller.handleWebhook({
      event: 'message',
      session: 'default',
      payload: {
        id: 'msg-1',
        from: '5511999999999@c.us',
        body: 'Quero saber sobre PDRN',
        type: 'chat',
      },
    } as any);

    expect(result).toEqual({ received: true, event: 'message' });
    expect(inboundProcessor.process).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        providerMessageId: 'msg-1',
        text: 'Quero saber sobre PDRN',
      }),
    );
  });

  it('updates and triggers catch-up on the resolved workspace instead of the WAHA session id', async () => {
    const result = await controller.handleWebhook({
      event: 'session.status',
      session: 'default',
      payload: {
        status: 'WORKING',
        me: { id: '5511999999999', pushName: 'Branding Caps' },
      },
    } as any);

    expect(result).toEqual({ received: true, event: 'session.status' });
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            connectionStatus: 'connected',
            whatsappApiSession: expect.objectContaining({
              sessionName: 'default',
              status: 'connected',
              phoneNumber: '5511999999999',
              pushName: 'Branding Caps',
            }),
          }),
        }),
      }),
    );
    expect(catchupService.triggerCatchup).toHaveBeenCalledWith(
      'ws-1',
      'session_status_connected',
    );
  });
});
