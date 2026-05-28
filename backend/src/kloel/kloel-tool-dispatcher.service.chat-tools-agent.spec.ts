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

describe('KloelToolDispatcherService — chat tools routing (agent & memory)', () => {
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

  it('routes remember_user_info to chatToolsService with a material receipt', async () => {
    jest.mocked(chatToolsService.toolRememberUserInfo).mockResolvedValueOnce({
      success: true,
      message: 'Memoria "lang" salva.',
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'remember_user_info',
      { key: 'lang', value: 'pt' },
      'user-42',
    );

    expect(chatToolsService.toolRememberUserInfo).toHaveBeenCalledWith(
      DEFAULT_WS_ID,
      { key: 'lang', value: 'pt' },
      'user-42',
    );
    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('remember_user_info');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'remember_user_info',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { key: 'lang', value: 'pt' },
        outputs: objectContaining({ key: 'lang', value: 'pt' }),
        domainEvents: ['memory.updated'],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('remember_user_info'),
        success: true,
      }),
    );
  });

  it('routes get_dashboard_summary to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'get_dashboard_summary', { period: 'today' });
    expect(chatToolsService.toolGetDashboardSummary).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      period: 'today',
    });
  });

  it('routes create_flow to chatToolsService with a material receipt', async () => {
    jest.mocked(chatToolsService.toolCreateFlow).mockResolvedValueOnce({
      success: true,
      message: 'Fluxo criado',
      flow: { id: 'flow-1', name: 'Flow' },
    });

    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'create_flow',
      { name: 'Flow', trigger: 'welcome' },
      'user-42',
    );

    expect(chatToolsService.toolCreateFlow).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      name: 'Flow',
      trigger: 'welcome',
    });
    expect(result.success).toBe(true);
    expect(result.capabilityId).toBe('create_flow');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'create_flow',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { name: 'Flow', trigger: 'welcome' },
        outputs: objectContaining({ flow: objectContaining({ id: 'flow-1' }) }),
        domainEvents: ['flow.created'],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('create_flow'),
        success: true,
      }),
    );
  });

  it('returns a canonical failure receipt for blocked create_flow', async () => {
    const result = await service.executeTool(
      DEFAULT_WS_ID,
      'create_flow',
      { name: 'Flow', trigger: 'welcome' },
      'user-42',
    );

    expect(chatToolsService.toolCreateFlow).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      name: 'Flow',
      trigger: 'welcome',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('flow_service_required');
    expect(result.receipt).toEqual(
      objectContaining({
        capabilityId: 'create_flow',
        workspaceId: DEFAULT_WS_ID,
        actorId: 'user-42',
        inputs: { name: 'Flow', trigger: 'welcome' },
        outputs: {},
        domainEvents: [],
        auditLogId: stringMatching(/^audit_/),
        idempotencyKey: stringContaining('create_flow'),
        success: false,
        error: 'flow_service_required',
      }),
    );
  });

  it('routes list_flows to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'list_flows', {});
    expect(chatToolsService.toolListFlows).toHaveBeenCalledWith(DEFAULT_WS_ID);
  });

  it('routes create_agent_job to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'create_agent_job', {
      title: 'Daily audit',
      prompt: 'Review memory',
    });
    expect(chatToolsService.toolCreateAgentJob).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      title: 'Daily audit',
      prompt: 'Review memory',
    });
  });

  it('routes list_agent_jobs to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'list_agent_jobs', {});
    expect(chatToolsService.toolListAgentJobs).toHaveBeenCalledWith(DEFAULT_WS_ID);
  });

  it('routes set_agent_job_enabled to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'set_agent_job_enabled', {
      jobId: 'daily',
      enabled: false,
    });
    expect(chatToolsService.toolSetAgentJobEnabled).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      jobId: 'daily',
      enabled: false,
    });
  });

  it('routes search_agent_memory to chatToolsService memory/contact search', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'search_agent_memory', { query: 'checkout' });
    expect(chatToolsService.toolSearchAgentMemoryWithContacts).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      query: 'checkout',
    });
  });

  it('routes search_agent_sessions to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'search_agent_sessions', { query: 'checkout' });
    expect(chatToolsService.toolSearchAgentSessions).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      query: 'checkout',
    });
  });

  it('routes get_agent_artifact to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'get_agent_artifact', {
      artifactId: 'tool_artifact:search_agent_memory:123:abcd',
    });
    expect(chatToolsService.toolGetAgentArtifact).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      artifactId: 'tool_artifact:search_agent_memory:123:abcd',
    });
  });

  it('routes upsert_agent_skill to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'upsert_agent_skill', {
      id: 'checkout',
      title: 'Checkout',
      summary: 'Recover checkout',
    });
    expect(chatToolsService.toolUpsertAgentSkill).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      id: 'checkout',
      title: 'Checkout',
      summary: 'Recover checkout',
    });
  });

  it('routes record_agent_skill_outcome to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'record_agent_skill_outcome', {
      skillId: 'checkout',
      outcome: 'succeeded',
    });
    expect(chatToolsService.toolRecordAgentSkillOutcome).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      skillId: 'checkout',
      outcome: 'succeeded',
    });
  });

  it('routes record_agent_delegation to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'record_agent_delegation', {
      task: 'Inspect Hermes delegation',
      result: 'Found governed child sessions',
    });
    expect(chatToolsService.toolRecordAgentDelegation).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      task: 'Inspect Hermes delegation',
      result: 'Found governed child sessions',
    });
  });

  it('routes agent evidence tools to chatToolsService', async () => {
    await service.executeTool(DEFAULT_WS_ID, 'record_agent_evidence', {
      source: 'jest',
      content: 'validated',
    });
    await service.executeTool(DEFAULT_WS_ID, 'search_agent_evidence', { query: 'validated' });
    await service.executeTool(DEFAULT_WS_ID, 'list_agent_evidence', { type: 'validation' });
    await service.executeTool(DEFAULT_WS_ID, 'verify_agent_evidence', {});

    expect(chatToolsService.toolRecordAgentEvidence).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      source: 'jest',
      content: 'validated',
    });
    expect(chatToolsService.toolSearchAgentEvidence).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      query: 'validated',
    });
    expect(chatToolsService.toolListAgentEvidence).toHaveBeenCalledWith(DEFAULT_WS_ID, {
      type: 'validation',
    });
    expect(chatToolsService.toolVerifyAgentEvidence).toHaveBeenCalledWith(DEFAULT_WS_ID);
  });
});
