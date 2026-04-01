import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { WhatsAppApiWebhookController } from './whatsapp-api-webhook.controller';

describe('WhatsAppApiWebhookController', () => {
  let prisma: any;
  let inboundProcessor: any;
  let catchupService: any;
  let agentEvents: any;
  let ciaRuntime: any;
  let whatsappApi: any;
  let redis: any;
  let controller: WhatsAppApiWebhookController;
  const ignoredLegacyEvent = (event: string) => ({
    received: true,
    event,
    ignored: true,
    reason: 'legacy_waha_disabled',
  });

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
      runCatchupNow: jest.fn().mockResolvedValue({ scheduled: true }),
    };

    agentEvents = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    ciaRuntime = {
      bootstrap: jest.fn().mockResolvedValue({ connected: true }),
    };

    whatsappApi = {
      getSessionStatus: jest.fn().mockResolvedValue({
        success: true,
        state: 'CONNECTED',
        message: 'WORKING',
        phoneNumber: '5511999999999',
        pushName: 'Branding Caps',
      }),
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
      whatsappApi,
      redis,
    );
  });

  it('keeps the WAHA webhook public and with elevated throttling metadata', () => {
    const handler = WhatsAppApiWebhookController.prototype.handleWebhook;

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(2000);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(60000);
  });

  it('maps sessionName to workspaceId when processing inbound messages', async () => {
    const result = await controller.handleWebhook({
      event: 'message',
      session: 'default',
      payload: {
        id: 'msg-1',
        from: '5511999999999@c.us',
        pushName: 'Alice App',
        body: 'Quero saber sobre o serum',
        type: 'chat',
      },
    } as any);

    expect(result).toEqual(ignoredLegacyEvent('message'));
    expect(inboundProcessor.process).not.toHaveBeenCalled();
  });

  it('gracefully ignores malformed payloads without throwing 500s', async () => {
    await expect(controller.handleWebhook({} as any)).resolves.toEqual({
      received: true,
      error: 'invalid_payload',
    });
    expect(inboundProcessor.process).not.toHaveBeenCalled();
  });

  it('prefers remoteJidAlt over LID identifiers when mapping inbound messages', async () => {
    const result = await controller.handleWebhook({
      event: 'message',
      session: 'default',
      payload: {
        id: 'msg-lid-1',
        from: '262744758587590@lid',
        body: 'Quero saber mais',
        type: 'chat',
        _data: {
          key: {
            remoteJid: '262744758587590@lid',
            remoteJidAlt: '5511963104453@s.whatsapp.net',
          },
        },
      },
    } as any);

    expect(result).toEqual(ignoredLegacyEvent('message'));
    expect(inboundProcessor.process).not.toHaveBeenCalled();
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
    await new Promise((resolve) => setImmediate(resolve));

    expect(result).toEqual(ignoredLegacyEvent('session.status'));
    expect(prisma.workspace.update).not.toHaveBeenCalled();
    expect(catchupService.runCatchupNow).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(ciaRuntime.bootstrap).not.toHaveBeenCalled();
  });

  it('recovers a rotated WAHA session by matching the stored phone identity', async () => {
    prisma.workspace.findMany.mockResolvedValue([
      {
        id: 'ws-1',
        providerSettings: {
          whatsappProvider: 'whatsapp-api',
          whatsappApiSession: {
            sessionName: 'old-session',
            phoneNumber: '5511999999999',
            pushName: 'Branding Caps',
          },
        },
      },
    ]);

    const result = await controller.handleWebhook({
      event: 'session.status',
      session: 'new-session',
      payload: {
        status: 'WORKING',
      },
    } as any);
    await new Promise((resolve) => setImmediate(resolve));

    expect(result).toEqual(ignoredLegacyEvent('session.status'));
    expect(whatsappApi.getSessionStatus).not.toHaveBeenCalled();
    expect(prisma.workspace.update).not.toHaveBeenCalled();
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
    await new Promise((resolve) => setImmediate(resolve));

    expect(result).toEqual(ignoredLegacyEvent('session.status'));
    expect(prisma.workspace.update).not.toHaveBeenCalled();
    expect(catchupService.runCatchupNow).not.toHaveBeenCalled();
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

    expect(result).toEqual(ignoredLegacyEvent('session.status'));
    expect(prisma.workspace.update).not.toHaveBeenCalled();
    expect(catchupService.runCatchupNow).not.toHaveBeenCalled();
    expect(agentEvents.publish).not.toHaveBeenCalled();
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

    expect(result).toEqual(ignoredLegacyEvent('message.any'));
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

    expect(result).toEqual(ignoredLegacyEvent('message.any'));
    expect(redis.get).not.toHaveBeenCalled();
    expect(inboundProcessor.process).not.toHaveBeenCalled();
  });

  it('does not re-trigger catchup/bootstrap from live traffic when autonomy is already active', async () => {
    prisma.workspace.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === 'default') return null;
      if (where.id === 'ws-1') {
        return {
          id: 'ws-1',
          providerSettings: {
            whatsappProvider: 'whatsapp-api',
            autonomy: { mode: 'BACKLOG' },
            ciaRuntime: { state: 'EXECUTING_BACKLOG' },
            whatsappApiSession: {
              sessionName: 'default',
              status: 'connected',
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
          autonomy: { mode: 'BACKLOG' },
          ciaRuntime: { state: 'EXECUTING_BACKLOG' },
          whatsappApiSession: {
            sessionName: 'default',
            status: 'connected',
          },
        },
      },
    ]);

    await controller.handleWebhook({
      event: 'message',
      session: 'default',
      payload: {
        id: 'msg-live-active-1',
        from: '5511999999999@c.us',
        body: 'Mensagem nova',
        type: 'chat',
      },
    } as any);

    expect(catchupService.triggerCatchup).not.toHaveBeenCalled();
    expect(ciaRuntime.bootstrap).not.toHaveBeenCalled();
  });
});
