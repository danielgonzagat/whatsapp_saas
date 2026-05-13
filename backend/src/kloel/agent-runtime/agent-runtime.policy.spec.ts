import { AgentRuntimePolicyService } from './agent-runtime.policy';

describe('AgentRuntimePolicyService', () => {
  const service = new AgentRuntimePolicyService();

  it('classifies read tools as safe and allowed', () => {
    const envelope = service.buildEnvelope({
      workspaceId: 'ws_1',
      toolName: 'get_workspace_status',
    });

    expect(envelope.riskLevel).toBe('safe');
    expect(envelope.authorityMode).toBe('tool_limited');
    expect(envelope.allowed).toBe(true);
    expect(envelope.requiresHumanApproval).toBe(false);
  });

  it('requires human approval for campaign sending surfaces', () => {
    const envelope = service.buildEnvelope({
      workspaceId: 'ws_1',
      toolName: 'send_whatsapp_message',
    });

    expect(envelope.riskLevel).toBe('high');
    expect(envelope.authorityMode).toBe('human_required');
    expect(envelope.allowed).toBe(false);
    expect(envelope.reasons).toContain('human_approval_required_for_risk_level');
  });

  it('blocks tools outside an explicit allowed scope', () => {
    const envelope = service.buildEnvelope({
      workspaceId: 'ws_1',
      toolName: 'create_flow',
      allowedTools: ['list_products'],
    });

    expect(envelope.allowed).toBe(false);
    expect(envelope.reasons).toContain('tool_not_in_allowed_scope');
  });
});
