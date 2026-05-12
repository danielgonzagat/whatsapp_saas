import { ModuleRef } from '@nestjs/core';
import { UnifiedAgentService } from '../kloel/unified-agent.service';
import { OmnichannelService } from './omnichannel.service';

describe('OmnichannelService', () => {
  function buildService(overrides?: {
    unifiedAgent?: { processIncomingMessage: jest.Mock };
    savedContactId?: string;
  }) {
    const inbox = {
      saveMessageByPhone: jest.fn().mockResolvedValue({
        id: 'msg_1',
        contactId: overrides?.savedContactId || 'contact_1',
      }),
    };
    const routing = {};
    const storage = {
      upload: jest.fn(),
    };
    const moduleRef = {
      get: jest.fn((token) => {
        if (token === UnifiedAgentService && overrides?.unifiedAgent) {
          return overrides.unifiedAgent;
        }
        throw new Error('provider_not_found');
      }),
    };

    const service = new OmnichannelService(
      inbox as never,
      routing as never,
      storage as never,
      moduleRef as never as ModuleRef,
    );

    return { service, inbox, moduleRef };
  }

  it('saves Instagram inbound and dispatches perception to the unified agent without tools', async () => {
    const unifiedAgent = {
      processIncomingMessage: jest.fn().mockResolvedValue({
        actions: [],
        intent: 'general',
        confidence: 0.5,
      }),
    };
    const { service, inbox } = buildService({ unifiedAgent });

    await service.handleIncomingMessage({
      workspaceId: 'ws_1',
      channel: 'INSTAGRAM',
      externalId: 'ig_user_1',
      from: 'ig_user_1',
      fromName: 'Ana',
      content: 'Quero saber o preco',
      metadata: { messageId: 'ig_msg_1' },
    });

    expect(inbox.saveMessageByPhone).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        phone: 'ig:ig_user_1',
        content: 'Quero saber o preco',
        direction: 'INBOUND',
        channel: 'INSTAGRAM',
      }),
    );
    expect(unifiedAgent.processIncomingMessage).toHaveBeenCalledWith({
      workspaceId: 'ws_1',
      phone: 'ig:ig_user_1',
      message: 'Quero saber o preco',
      contactId: 'contact_1',
      channel: 'instagram',
      executeTools: false,
      context: {
        deliveryMode: 'reactive',
        externalId: 'ig_user_1',
        fromName: 'Ana',
        metadata: { messageId: 'ig_msg_1' },
      },
    });
  });

  it('keeps WhatsApp allowed to execute unified-agent tools', async () => {
    const unifiedAgent = {
      processIncomingMessage: jest.fn().mockResolvedValue({
        actions: [],
        intent: 'general',
        confidence: 0.5,
      }),
    };
    const { service } = buildService({ unifiedAgent, savedContactId: 'contact_whatsapp' });

    await service.handleIncomingMessage({
      workspaceId: 'ws_1',
      channel: 'WHATSAPP',
      externalId: '5511999999999',
      from: '5511999999999',
      content: 'Oi',
    });

    expect(unifiedAgent.processIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        phone: '5511999999999',
        contactId: 'contact_whatsapp',
        channel: 'whatsapp',
        executeTools: true,
      }),
    );
  });

  it('does not fail inbox persistence when the unified agent is not registered', async () => {
    const { service, inbox } = buildService();

    await expect(
      service.handleIncomingMessage({
        workspaceId: 'ws_1',
        channel: 'MESSENGER',
        externalId: 'fb_user_1',
        from: 'fb_user_1',
        content: 'ola',
      }),
    ).resolves.toEqual({ id: 'msg_1', contactId: 'contact_1' });

    expect(inbox.saveMessageByPhone).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: 'fb:fb_user_1',
        channel: 'MESSENGER',
      }),
    );
  });

  it('normalizes TikTok webhook payloads into inbox and unified-agent perception', async () => {
    const unifiedAgent = {
      processIncomingMessage: jest.fn().mockResolvedValue({
        actions: [],
        intent: 'interest',
        confidence: 0.6,
      }),
    };
    const { service, inbox } = buildService({ unifiedAgent, savedContactId: 'contact_tiktok' });

    await service.processTikTokWebhook({
      workspaceId: 'ws_1',
      data: { open_id: 'tt_user_1', text: 'quanto custa?' },
    });

    expect(inbox.saveMessageByPhone).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        phone: 'tt:tt_user_1',
        content: 'quanto custa?',
        direction: 'INBOUND',
        channel: 'TIKTOK',
      }),
    );
    expect(unifiedAgent.processIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws_1',
        phone: 'tt:tt_user_1',
        message: 'quanto custa?',
        contactId: 'contact_tiktok',
        channel: 'tiktok',
        executeTools: false,
      }),
    );
  });

  it('returns no_workspace for TikTok payloads that cannot be mapped to a workspace', async () => {
    const { service, inbox } = buildService();

    await expect(
      service.processTikTokWebhook({ data: { open_id: 'tt_user_1', text: 'oi' } }),
    ).resolves.toEqual({ status: 'no_workspace', channel: 'tiktok' });

    expect(inbox.saveMessageByPhone).not.toHaveBeenCalled();
  });
});
