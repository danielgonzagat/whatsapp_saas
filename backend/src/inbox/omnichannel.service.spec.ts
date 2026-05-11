import { OmnichannelService, type NormalizedMessage } from './omnichannel.service';

describe('OmnichannelService deterministic pipeline', () => {
  const inbox = {
    saveMessage: jest.fn(),
    saveMessageByPhone: jest.fn(),
  };
  const routing = {};
  const storage = { upload: jest.fn() };
  const contactResolution = { resolveFromMessage: jest.fn() };
  const unifiedAgent = {
    processIncomingMessage: jest.fn(),
    processMessage: jest.fn(),
  };
  const mindHook = { onMessageReceived: jest.fn() };
  const commercialOrchestrator = { orchestrateInbound: jest.fn() };

  const previousFlag = process.env.KLOEL_DETERMINISTIC_PIPELINE_ENABLED;

  const message: NormalizedMessage = {
    workspaceId: 'ws-1',
    channel: 'WHATSAPP',
    externalId: 'provider-message-1',
    from: '+5511999999999',
    content: 'Tem desconto para fechar hoje?',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.KLOEL_DETERMINISTIC_PIPELINE_ENABLED = previousFlag;
    contactResolution.resolveFromMessage.mockResolvedValue({ id: 'contact-1' });
    inbox.saveMessage.mockResolvedValue({ id: 'msg-1', contactId: 'contact-1' });
    inbox.saveMessageByPhone.mockResolvedValue({ id: 'msg-1', contactId: 'contact-1' });
    unifiedAgent.processIncomingMessage.mockResolvedValue({ response: 'legacy' });
    unifiedAgent.processMessage.mockResolvedValue({ response: 'deterministic' });
    commercialOrchestrator.orchestrateInbound.mockResolvedValue({
      actions: [{ tool: 'send_message', args: { message: 'Resposta decidida' } }],
      concepts: [{ concept: 'price_objection', confidence: 0.8 }],
      trace: { decisions: [{ type: 'coupon_offer', outcomeKey: 'coupon-1' }] },
    });
    mindHook.onMessageReceived.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env.KLOEL_DETERMINISTIC_PIPELINE_ENABLED = previousFlag;
  });

  const buildService = () =>
    new OmnichannelService(
      inbox as never,
      routing as never,
      storage as never,
      contactResolution as never,
      unifiedAgent as never,
      mindHook as never,
      commercialOrchestrator as never,
    );

  const flushAsyncTriggers = async () => {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  };

  it('routes a real inbound message through the commercial orchestrator when rollout flag is enabled', async () => {
    process.env.KLOEL_DETERMINISTIC_PIPELINE_ENABLED = 'true';
    const service = buildService();

    await service.handleIncomingMessage(message);
    await flushAsyncTriggers();

    expect(commercialOrchestrator.orchestrateInbound).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      channel: 'whatsapp',
      message: message.content,
      conversationId: 'msg-1',
    });
    expect(unifiedAgent.processMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        phone: '+5511999999999',
        message: message.content,
        predecidedActions: [{ tool: 'send_message', args: { message: 'Resposta decidida' } }],
        context: expect.objectContaining({
          source: 'omnichannel',
          deliveryMode: 'reactive',
          deterministicPipeline: true,
          messageId: 'msg-1',
          providerMessageId: 'provider-message-1',
        }),
      }),
    );
    expect(unifiedAgent.processIncomingMessage).not.toHaveBeenCalled();
  });

  it('keeps the legacy inbound path when rollout flag is disabled', async () => {
    process.env.KLOEL_DETERMINISTIC_PIPELINE_ENABLED = 'false';
    const service = buildService();

    await service.handleIncomingMessage(message);
    await flushAsyncTriggers();

    expect(commercialOrchestrator.orchestrateInbound).not.toHaveBeenCalled();
    expect(unifiedAgent.processMessage).not.toHaveBeenCalled();
    expect(unifiedAgent.processIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        phone: '+5511999999999',
        message: message.content,
        channel: 'whatsapp',
      }),
    );
  });
});
