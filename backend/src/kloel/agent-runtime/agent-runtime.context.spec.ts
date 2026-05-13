import { AgentRuntimeContextService } from './agent-runtime.context';
import type {
  AgentRuntimePulseSelfModel,
  AgentRuntimeRecallResult,
  AgentSkillSelection,
} from './agent-runtime.types';

describe('AgentRuntimeContextService', () => {
  it('renders frozen operational context with recall, skills, and PULSE truth boundary', async () => {
    const recall: AgentRuntimeRecallResult = {
      query: 'checkout',
      tokens: ['checkout'],
      totalFound: 1,
      memories: [
        {
          id: 'mem_1',
          key: 'agent_turn:whatsapp:1',
          category: 'agent_event',
          content: 'user asked about checkout recovery',
          value: { ok: true },
          source: {
            source: 'kloel_memory',
            confidence: 0.78,
            freshness: 'fresh',
            truthMode: 'observed',
            observedAt: '2026-05-13T00:00:00.000Z',
          },
        },
      ],
    };
    const pulse: AgentRuntimePulseSelfModel = {
      status: 'degraded',
      authorityMode: 'advisory',
      canWorkNow: true,
      canDeclareComplete: false,
      score: 61,
      blockingReasons: ['no_overclaim_fail'],
      nextSafeUnits: ['recover-admin-whatsapp-session-control'],
      generatedAt: '2026-05-13T00:00:00.000Z',
    };
    const selectedSkills: AgentSkillSelection[] = [
      {
        skill: {
          id: 'checkout-recovery',
          title: 'Checkout Recovery',
          summary: 'Recover checkout with real product evidence.',
          category: 'commercial',
          riskLevel: 'normal',
          allowedTools: ['list_products'],
          requiredEvidence: ['lead_status'],
          validation: ['workspace_isolation'],
          rollback: [],
          metrics: ['conversion_rate'],
          body: 'body',
          version: 1,
          updatedAt: '2026-05-13T00:00:00.000Z',
        },
        score: 2,
        reasons: ['match:checkout'],
      },
    ];

    const service = new AgentRuntimeContextService(
      { search: jest.fn().mockResolvedValue(recall), recordTurn: jest.fn() },
      { selectSkills: jest.fn().mockResolvedValue(selectedSkills) },
      { buildSelfModel: jest.fn().mockReturnValue(pulse) },
      { buildEnvelope: jest.fn() },
    );

    const context = await service.buildContext({
      workspaceId: 'ws_1',
      channel: 'whatsapp',
      message: 'checkout',
    });

    expect(context.systemPromptBlock).toContain('<kloel-agent-runtime>');
    expect(context.systemPromptBlock).toContain('pulse.canDeclareComplete=false');
    expect(context.systemPromptBlock).toContain('checkout-recovery');
    expect(context.systemPromptBlock).toContain('user asked about checkout recovery');
  });
});
