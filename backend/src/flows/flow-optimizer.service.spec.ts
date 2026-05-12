import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { FlowOptimizerService } from './flow-optimizer.service';

const chatCompletionWithRetryMock = jest.fn();
jest.mock('../kloel/openai-wrapper', () => ({
  chatCompletionWithRetry: (...args: unknown[]) => chatCompletionWithRetryMock(...args),
}));
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../lib/openai-models', () => ({
  resolveBackendOpenAIModel: () => 'gpt-stub',
}));

describe('FlowOptimizerService', () => {
  let service: FlowOptimizerService;
  let prisma: {
    flow: { findFirst: jest.Mock };
    flowVersion: { create: jest.Mock };
  };
  let config: { get: jest.Mock };
  let planLimits: {
    ensureTokenBudget: jest.Mock;
    trackAiUsage: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      flow: { findFirst: jest.fn() },
      flowVersion: { create: jest.fn().mockResolvedValue({}) },
    };
    config = { get: jest.fn().mockReturnValue('sk-test') };
    planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };
    chatCompletionWithRetryMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlowOptimizerService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: PlanLimitsService, useValue: planLimits },
      ],
    }).compile();
    service = module.get(FlowOptimizerService);
  });

  it('noop when flow not found', async () => {
    prisma.flow.findFirst.mockResolvedValue(null);
    await service.optimizeFlow('ws-1', 'flow-1');
    expect(chatCompletionWithRetryMock).not.toHaveBeenCalled();
    expect(prisma.flowVersion.create).not.toHaveBeenCalled();
  });

  it('noop when aiOptimization flag is false', async () => {
    prisma.flow.findFirst.mockResolvedValue({
      id: 'f',
      aiOptimization: false,
      executions: [],
      nodes: [],
      edges: [],
    });
    await service.optimizeFlow('ws-1', 'flow-1');
    expect(chatCompletionWithRetryMock).not.toHaveBeenCalled();
  });

  it('noop when conversion rate already >80%', async () => {
    const execs = Array(10).fill({ status: 'COMPLETED' });
    prisma.flow.findFirst.mockResolvedValue({
      id: 'f',
      aiOptimization: true,
      executions: execs,
      nodes: [],
      edges: [],
    });
    await service.optimizeFlow('ws-1', 'flow-1');
    expect(chatCompletionWithRetryMock).not.toHaveBeenCalled();
  });

  it('calls LLM and creates draft FlowVersion when suggestion has nodes', async () => {
    prisma.flow.findFirst.mockResolvedValue({
      id: 'f-1',
      aiOptimization: true,
      executions: [{ status: 'FAILED' }, { status: 'FAILED' }],
      nodes: [{ id: 'n1' }],
      edges: [{ from: 'n1' }],
    });
    chatCompletionWithRetryMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ nodes: [{ id: 'n2' }], reason: 'simplify' }),
          },
        },
      ],
      usage: { total_tokens: 250 },
    });

    await service.optimizeFlow('ws-1', 'f-1');

    expect(planLimits.ensureTokenBudget).toHaveBeenCalledWith('ws-1');
    expect(planLimits.trackAiUsage).toHaveBeenCalledWith('ws-1', 250);
    expect(prisma.flowVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        flowId: 'f-1',
        workspaceId: 'ws-1',
        label: expect.stringContaining('simplify'),
      }),
    });
  });

  it('does not create a FlowVersion when model returns invalid JSON', async () => {
    prisma.flow.findFirst.mockResolvedValue({
      id: 'f-1',
      aiOptimization: true,
      executions: [{ status: 'FAILED' }],
      nodes: [],
      edges: [],
    });
    chatCompletionWithRetryMock.mockResolvedValue({
      choices: [{ message: { content: 'not-json' } }],
    });
    await service.optimizeFlow('ws-1', 'f-1');
    expect(prisma.flowVersion.create).not.toHaveBeenCalled();
  });

  it('enforces workspace isolation on the flow lookup', async () => {
    prisma.flow.findFirst.mockResolvedValue(null);
    await service.optimizeFlow('ws-tenant-A', 'flow-X');
    expect(prisma.flow.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'flow-X', workspaceId: 'ws-tenant-A' },
      }),
    );
  });
});
