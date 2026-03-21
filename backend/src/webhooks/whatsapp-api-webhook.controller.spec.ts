import { WhatsAppApiWebhookController } from './whatsapp-api-webhook.controller';

describe('WhatsAppApiWebhookController', () => {
  let prisma: any;
  let inboundProcessor: any;
  let catchupService: any;
  let agentEvents: any;
  let ciaRuntime: any;
  let redis: any;
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

    agentEvents = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    ciaRuntime = {
      bootstrap: jest.fn().mockResolvedValue({ connected: true }),
    };

    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
    };

    controller = new WhatsAppApiWebhookController(
      prisma,
      inboundProcessor,
      catchupService,
      agentEvents,
      ciaRuntime,
      redis,
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
    expect(redis.set).toHaveBeenCalledWith(
      'cia:bootstrap:ws-1',
      '1',
      'EX',
      120,
      'NX',
    );
    expect(ciaRuntime.bootstrap).toHaveBeenCalledWith('ws-1');
  });

  it('trusts the resolved WAHA engine state when the top-level webhook status is stale', async () => {
    const result = await controller.handleWebhook({
      event: 'session.status',
      session: 'default',
      payload: {
        status: 'FAILED',
        engine: { state: 'WORKING' },
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
              status: 'connected',
              rawStatus: 'WORKING',
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

  it('clears stale identity when WAHA reports SCAN_QR_CODE', async () => {
    const result = await controller.handleWebhook({
      event: 'session.status',
      session: 'default',
      payload: {
        status: 'SCAN_QR_CODE',
        me: { id: '5511999999999', pushName: 'Branding Caps' },
      },
    } as any);

    expect(result).toEqual({ received: true, event: 'session.status' });
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            connectionStatus: 'qr_pending',
            whatsappApiSession: expect.objectContaining({
              sessionName: 'default',
              status: 'qr_pending',
              disconnectReason: 'SCAN_QR_CODE',
              phoneNumber: null,
              pushName: null,
              connectedAt: null,
              rawStatus: 'SCAN_QR_CODE',
            }),
          }),
        }),
      }),
    );
    expect(catchupService.triggerCatchup).not.toHaveBeenCalled();
    expect(agentEvents.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        phase: 'session_qr_required',
      }),
    );
  });

  it('keeps ignoring fromMe messages by default', async () => {
    const result = await controller.handleWebhook({
      event: 'message.any',
      session: 'default',
      payload: {
        id: 'msg-owner',
        from: '5511999999999@c.us',
        body: 'teste do dono',
        type: 'chat',
        fromMe: true,
      },
    } as any);

    expect(result).toEqual({ received: true, event: 'message.any' });
    expect(inboundProcessor.process).not.toHaveBeenCalled();
  });

  it('allows fromMe processing only when includeFromMe is enabled for the workspace', async () => {
    prisma.workspace.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === 'default') return null;
      if (where.id === 'ws-1') {
        return {
          id: 'ws-1',
          providerSettings: {
            whatsappProvider: 'whatsapp-api',
            whatsappApiSession: {
              sessionName: 'default',
              includeFromMe: true,
            },
          },
        };
      }
      return null;
    });
    prisma.workspace.findMany.mockResolvedValue([
      {
        id: 'ws-1',
        providerSettings: {
          whatsappProvider: 'whatsapp-api',
          whatsappApiSession: {
            sessionName: 'default',
            includeFromMe: true,
          },
        },
      },
    ]);

    const result = await controller.handleWebhook({
      event: 'message.any',
      session: 'default',
      payload: {
        id: 'msg-owner',
        from: '5511999999999@c.us',
        body: 'teste do dono',
        type: 'chat',
        fromMe: true,
      },
    } as any);

    expect(result).toEqual({ received: true, event: 'message.any' });
    expect(redis.get).toHaveBeenCalledWith(
      'whatsapp:from-me:ignore:ws-1:msg-owner',
    );
    expect(inboundProcessor.process).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        providerMessageId: 'msg-owner',
      }),
    );
  });
});
