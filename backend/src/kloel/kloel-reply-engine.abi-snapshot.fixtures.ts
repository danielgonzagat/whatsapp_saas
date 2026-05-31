import { Test, TestingModule } from '@nestjs/testing';
import { KloelReplyEngineService } from './kloel-reply-engine.service';
import { AbiBuilderService } from './abi/abi-builder.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { KloelThreadService } from './kloel-thread.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { UnifiedAgentService } from './unified-agent.service';

export const validAbi = {
  status: 'ok' as const,
  abi: {
    abiVersion: '1.1.0',
    lineage: {
      canonicalName: 'Kloel' as const,
      genesisEventId: 'g1',
      lineageStatus: 'intact' as const,
      operationalAge: { sinceGenesisDays: 1, sinceFirstWorkspaceDays: 0 },
      capabilities: [],
    },
    identityProjection: {
      audience: 'public' as const,
      currentMaturity: 'developing' as const,
      truthMode: 'observed' as const,
    },
    perception: { currentSnapshot: { channel: 'web' }, recentSalientEvents: [] },
    beliefs: [],
    predictions: { active: [], recentSurprises: [] },
    attention: { candidates: [] },
    memory: { workingMemory: [], episodicRefs: [], consolidatedRefs: [] },
    capabilities: { available: [], restricted: [] },
    valence: {
      recentTrace: [],
      aggregatedMood: { positive: 0, negative: 0, neutral: 1, ambiguous: 0, windowHours: 24 },
    },
    pulseTruth: {
      noOverclaimStatus: 'PASS' as const,
      capabilityHealthScore: 0,
      gates: [],
      certificationVerdict: {
        verdict: 'INSUFFICIENT_EVIDENCE' as const,
        score: 0,
        measuredAt: new Date().toISOString(),
      },
      overclaimRisk: 0,
    },
    currentInput: {
      raw: 'h',
      channel: 'web',
      arrivalTimestamp: new Date().toISOString(),
    },
  },
};

export const callParams = {
  systemPrompt: 'S',
  dynamicContext: 'D',
  recentMessages: [],
  userMessage: 'Hello',
  workspaceId: 'ws-1',
};

export function makeKloelMemoryRow(content: string, updatedAt: Date) {
  return {
    id: 'mem-1',
    workspaceId: 'ws-1',
    key: 'abi_snapshot_cache',
    category: 'abi_snapshot',
    content,
    value: {},
    updatedAt,
  };
}

export function extractCognitiveState(
  messages: Array<{ role: string; content: unknown }>,
): Record<string, unknown> {
  const last = messages[messages.length - 1];
  const str = typeof last?.content === 'string' ? last.content : '{}';
  const payload = JSON.parse(str) as Record<string, unknown>;
  return payload['cognitiveState'];
}

export interface BuildModuleOpts {
  kloelMemory: { findUnique: jest.Mock; upsert: jest.Mock };
  abiBuilder: { build: jest.Mock };
}

export async function buildAbiTestModule(opts: BuildModuleOpts): Promise<KloelReplyEngineService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      KloelReplyEngineService,
      {
        provide: PrismaService,
        useValue: {
          kloelMemory: opts.kloelMemory,
          workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'Test Co' }) },
        },
      },
      {
        provide: PlanLimitsService,
        useValue: {
          ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
          trackAiUsage: jest.fn().mockResolvedValue(undefined),
        },
      },
      {
        provide: KloelThreadService,
        useValue: {
          resolveThread: jest.fn().mockResolvedValue({ id: 't1', title: 'T' }),
          getThreadConversationState: jest
            .fn()
            .mockResolvedValue({ recentMessages: [], totalMessages: 0 }),
        },
      },
      {
        provide: KloelWorkspaceContextService,
        useValue: {
          getWorkspaceContext: jest.fn().mockResolvedValue('ctx'),
          contextFormatter: {
            sanitizeUserNameForAssistant: jest.fn(
              (n: string | null) => String(n || '').split(' ')[0] || 'U',
            ),
          },
        },
      },
      {
        provide: UnifiedAgentService,
        useValue: { processIncomingMessage: jest.fn().mockResolvedValue({ reply: 'ok' }) },
      },
      { provide: AbiBuilderService, useValue: opts.abiBuilder },
    ],
  }).compile();
  return module.get<KloelReplyEngineService>(KloelReplyEngineService);
}
