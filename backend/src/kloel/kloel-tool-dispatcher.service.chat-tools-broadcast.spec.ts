jest.mock('./kloel-chat-tools.service', () => ({
  KloelChatToolsService: class MockKloelChatToolsService {},
}));

jest.mock('./kloel-business-config-tools.service', () => ({
  KloelBusinessConfigToolsService: class MockKloelBusinessConfigToolsService {},
}));

jest.mock('./kloel-whatsapp-tools.service', () => ({
  KloelWhatsAppToolsService: class MockKloelWhatsAppToolsService {},
}));

jest.mock('./kloel-composer.service', () => ({
  KloelComposerService: class MockKloelComposerService {},
}));

jest.mock('../audit/audit.service', () => ({
  AuditService: class MockAuditService {},
}));

jest.mock('../observability/ops-alert.service', () => ({
  OpsAlertService: class MockOpsAlertService {},
}));

jest.mock('./kloel-code-tools.service', () => ({
  KloelCodeToolsService: class MockKloelCodeToolsService {},
}));

import { KloelToolDispatcherService } from './kloel-tool-dispatcher.service';
import { DEFAULT_WS_ID } from './kloel-tool-dispatcher.service.fixtures';
import type { DispatcherChatToolsMock } from './kloel-tool-dispatcher.service.fixtures';
import {
  buildChatToolsHarness,
  objectContaining,
  stringMatching,
  stringContaining,
} from './kloel-tool-dispatcher.service.chat-tools.spec-setup';

describe('KloelToolDispatcherService — chat tools routing (broadcast & persona)', () => {
  let service: KloelToolDispatcherService;
  let chatToolsService: DispatcherChatToolsMock;

  beforeEach(async () => {
    const harness = await buildChatToolsHarness();
    service = harness.service;
    chatToolsService = harness.chatToolsService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('routes create_broadcast to chatToolsService with a material receipt', async () => {
    jest.mocked(chatToolsService.toolCreateBroadcast).mockResolvedValueOnce({
      success: true,
      campaign: { id: 'campaign-1', name: 'PDRN Launch', status: 'DRAFT' },
      message: 'Broadcast criado.',
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'create_broadcast',
      { name: 'PDRN Launch', message: 'Oferta hoje' },
      'user-42',
    );

    expect(chatToolsService.toolCreateBroadcast).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      name: 'PDRN Launch',
      message: 'Oferta hoje',
    });
    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('create_broadcast');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'create_broadcast',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { name: 'PDRN Launch', message: 'Oferta hoje' },
        outputs: objectContaining({ campaignId: 'campaign-1' }),
        domainEvents: ['campaign.created'],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('create_broadcast'),
        success: true,
      }),
    );
  });

  it('routes configure_ai_persona to chatToolsService with a material receipt', async () => {
    jest.mocked(chatToolsService.toolConfigureAiPersona).mockResolvedValueOnce({
      success: true,
      persona: { name: 'Kloel', tone: 'formal', personality: 'professional' },
      message: 'Persona atualizada.',
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'configure_ai_persona',
      { name: 'Kloel', tone: 'formal', personality: 'professional' },
      'user-42',
    );

    expect(chatToolsService.toolConfigureAiPersona).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      name: 'Kloel',
      tone: 'formal',
      personality: 'professional',
    });
    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('configure_ai_persona');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'configure_ai_persona',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { name: 'Kloel', tone: 'formal', personality: 'professional' },
        outputs: objectContaining({
          persona: objectContaining({ name: 'Kloel', tone: 'formal' }),
        }),
        domainEvents: ['ai.persona_updated'],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('configure_ai_persona'),
        success: true,
      }),
    );
  });

  it('returns a canonical failure receipt for blocked create_broadcast', async () => {
    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'create_broadcast',
      { name: 'PDRN Launch', message: 'Oferta hoje' },
      'user-42',
    );

    expect(chatToolsService.toolCreateBroadcast).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      name: 'PDRN Launch',
      message: 'Oferta hoje',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('campaign_service_required');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'create_broadcast',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { name: 'PDRN Launch', message: 'Oferta hoje' },
        outputs: {},
        domainEvents: [],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('create_broadcast'),
        success: false,
        error: 'campaign_service_required',
      }),
    );
  });

  it('returns a canonical failure receipt for blocked configure_ai_persona', async () => {
    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'configure_ai_persona',
      { name: 'Kloel', tone: 'formal', personality: 'professional' },
      'user-42',
    );

    expect(chatToolsService.toolConfigureAiPersona).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      name: 'Kloel',
      tone: 'formal',
      personality: 'professional',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('ai_config_service_required');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'configure_ai_persona',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { name: 'Kloel', tone: 'formal', personality: 'professional' },
        outputs: {},
        domainEvents: [],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('configure_ai_persona'),
        success: false,
        error: 'ai_config_service_required',
      }),
    );
  });
});
