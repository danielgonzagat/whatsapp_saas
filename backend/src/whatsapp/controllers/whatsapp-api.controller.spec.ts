import { WhatsAppApiController } from './whatsapp-api.controller';

describe('WhatsAppApiController', () => {
  let providerRegistry: any;
  let whatsappApi: any;
  let catchupService: any;
  let agentEvents: any;
  let ciaRuntime: any;
  let controller: WhatsAppApiController;

  beforeEach(() => {
    providerRegistry = {
      startSession: jest.fn(),
      getSessionStatus: jest.fn(),
    };
    whatsappApi = {};
    catchupService = {
      triggerCatchup: jest.fn().mockResolvedValue({ scheduled: true }),
    };
    agentEvents = {};
    ciaRuntime = {};

    controller = new WhatsAppApiController(
      providerRegistry,
      whatsappApi,
      catchupService,
      agentEvents,
      ciaRuntime,
    );
  });

  it('does not trigger catchup during session status polling', async () => {
    providerRegistry.getSessionStatus.mockResolvedValue({
      connected: true,
      status: 'CONNECTED',
    });

    const result = await controller.getStatus({ workspaceId: 'ws-1' });

    expect(result).toEqual({
      connected: true,
      status: 'CONNECTED',
    });
    expect(catchupService.triggerCatchup).not.toHaveBeenCalled();
  });

  it('still triggers catchup when startSession detects an already connected session', async () => {
    providerRegistry.startSession.mockResolvedValue({
      success: true,
      message: 'already_connected',
    });

    const result = await controller.startSession({ workspaceId: 'ws-1' });

    expect(result).toEqual({
      success: true,
      message: 'already_connected',
    });
    expect(catchupService.triggerCatchup).toHaveBeenCalledWith(
      'ws-1',
      'session_start_already_connected',
    );
  });
});
