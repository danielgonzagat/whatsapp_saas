import { Test, TestingModule } from '@nestjs/testing';
import { KloelReplyEngineService } from './kloel-reply-engine.service';
import { AbiBuilderService } from './abi/abi-builder.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { KloelThreadService } from './kloel-thread.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { UnifiedAgentService } from './unified-agent.service';

const mockWarnCalls: Array<[string, Record<string, unknown>]> = [];

jest.mock('../logging/structured-logger', () => {
  const actual = jest.requireActual<typeof import('../logging/structured-logger')>('../logging/structured-logger');
  return {
    ...actual,
    StructuredLogger: class extends actual.StructuredLogger {
      static override from(context: string | { name?: string }) {
        const inst = new this(typeof context === 'string' ? context : context.name ?? 'unknown');
        return inst;
      }
      override warn(a: string | Record<string, unknown>, b?: unknown): void {
        if (typeof a === 'string' && b && typeof b === 'object') {
          mockWarnCalls.push([a, b as Record<string, unknown>]);
        }
        if (typeof a === 'string') {
          console.warn(a);
        }
      }
    },
  };
});

jest.mock('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
  })),
}));

jest.mock('stripe', () => {
  const MockStripe = jest.fn().mockImplementation(() => ({
    customers: { create: jest.fn(), retrieve: jest.fn() },
    paymentMethods: { list: jest.fn(), attach: jest.fn() },
  }));
  (MockStripe as unknown as Record<string, unknown>).API_VERSION = '2025-01-27.acacia';
  return { default: MockStripe };
});

jest.mock('./kloel-reply-engine.helpers', () => ({
  WHITESPACE_RE: /\s+/,
  RELAT_O__RIO_DOCUMENTO_RE: /relat[oó]rio|documento/i,
  CRIE_CADASTRAR_CADASTRE_RE: /crie|cadastrar|cadastre/i,
  PRODUTO_CAT_A__LOGO_AUT_RE: /produto|cat[aá]logo|automa/i,
  KLOEL_STREAM_ABORT_REASON_TIMEOUT: 'kloel_stream_timeout',
  KLOEL_STREAM_ABORT_REASON_CLIENT_DISCONNECTED: 'client_disconnected',
  buildDynamicRuntimeContextHelper: jest.fn().mockResolvedValue('Dynamic context'),
  buildAssistantReplyImpl: jest.fn().mockResolvedValue('Assistant reply'),
}));

interface DegradedLogPayload {
  tag: string;
  builder_present: boolean;
  build_status: string | null;
  validation_issues: string[];
  exception_message: string | null;
  workspaceId: string | null;
}

function parseDegradedLog(): DegradedLogPayload[] {
  return mockWarnCalls
    .filter(([, extra]) => extra?.tag === 'kloel_abi_degraded')
    .map(([, extra]) => extra as unknown as DegradedLogPayload);
}

describe('KloelReplyEngineService ABI degraded logging', () => {
  let service: KloelReplyEngineService;
  let abiBuilder: { build: jest.Mock };

  const basePrisma = {
    workspace: { findUnique: jest.fn().mockResolvedValue({ name: 'Test Co' }) },
  };
  const basePlanLimits = {
    ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
    trackAiUsage: jest.fn().mockResolvedValue(undefined),
  };
  const baseThreadService = {
    resolveThread: jest.fn().mockResolvedValue({ id: 't1', title: 'T' }),
    getThreadConversationState: jest.fn().mockResolvedValue({ recentMessages: [], totalMessages: 0 }),
  };
  const baseWsContext = {
    getWorkspaceContext: jest.fn().mockResolvedValue('ctx'),
    contextFormatter: { sanitizeUserNameForAssistant: jest.fn((n: string | null) => String(n || '').split(' ')[0] || 'U') },
  };
  const baseUnifiedAgent = {
    processIncomingMessage: jest.fn().mockResolvedValue({ reply: 'ok' }),
  };

  async function buildService(): Promise<void> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelReplyEngineService,
        { provide: PrismaService, useValue: basePrisma },
        { provide: PlanLimitsService, useValue: basePlanLimits },
        { provide: KloelThreadService, useValue: baseThreadService },
        { provide: KloelWorkspaceContextService, useValue: baseWsContext },
        { provide: UnifiedAgentService, useValue: baseUnifiedAgent },
        { provide: AbiBuilderService, useValue: abiBuilder },
      ],
    }).compile();
    service = module.get<KloelReplyEngineService>(KloelReplyEngineService);
  }

  beforeEach(() => {
    mockWarnCalls.length = 0;
  });

  const callParams = {
    systemPrompt: 'S',
    dynamicContext: 'D',
    recentMessages: [],
    userMessage: 'Hello',
  };

  describe('build failure (lineage_compromised)', () => {
    beforeEach(async () => {
      abiBuilder = {
        build: jest.fn().mockResolvedValue({ status: 'lineage_compromised', reason: 'origin identity mismatch' }),
      };
      await buildService();
    });

    it('emits kloel_abi_degraded log with build_status set', async () => {
      await service.buildChatModelMessages(callParams);
      const logs = parseDegradedLog();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        tag: 'kloel_abi_degraded',
        builder_present: true,
        build_status: 'lineage_compromised',
        validation_issues: [],
        exception_message: null,
      });
    });

    it('passes workspaceId when provided', async () => {
      await service.buildChatModelMessages({ ...callParams, workspaceId: 'ws-42' });
      const logs = parseDegradedLog();
      expect(logs[0].workspaceId).toBe('ws-42');
    });

    it('defaults workspaceId to null when omitted', async () => {
      await service.buildChatModelMessages(callParams);
      const logs = parseDegradedLog();
      expect(logs[0].workspaceId).toBeNull();
    });
  });

  describe('validation failure', () => {
    beforeEach(async () => {
      abiBuilder = {
        build: jest.fn().mockResolvedValue({
          status: 'ok',
          abi: { abiVersion: '1.0.0' },
        }),
      };
      await buildService();
    });

    it('emits kloel_abi_degraded log with validation issues sliced to 3', async () => {
      await service.buildChatModelMessages(callParams);
      const logs = parseDegradedLog();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        tag: 'kloel_abi_degraded',
        builder_present: true,
        build_status: 'ok',
        exception_message: null,
      });
      expect(logs[0].validation_issues.length).toBeGreaterThan(0);
      expect(logs[0].validation_issues.length).toBeLessThanOrEqual(3);
      expect(logs[0].validation_issues[0]).toMatch(/^[A-Z_]+: /);
    });
  });

  describe('build exception', () => {
    beforeEach(async () => {
      abiBuilder = {
        build: jest.fn().mockRejectedValue(new Error('projector timeout')),
      };
      await buildService();
    });

    it('emits kloel_abi_degraded log with exception_message', async () => {
      await service.buildChatModelMessages(callParams);
      const logs = parseDegradedLog();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        tag: 'kloel_abi_degraded',
        builder_present: true,
        build_status: null,
        validation_issues: [],
        exception_message: 'projector timeout',
      });
    });
  });

  describe('success path produces no degraded log', () => {
    const validAbi = {
      status: 'ok' as const,
      abi: {
        abiVersion: '1.1.0',
        lineage: { canonicalName: 'Kloel' as const, genesisEventId: 'g1', lineageStatus: 'intact' as const, operationalAge: { sinceGenesisDays: 1, sinceFirstWorkspaceDays: 0 }, capabilities: [] },
        identityProjection: { audience: 'public' as const, currentMaturity: 'developing' as const, truthMode: 'observed' as const },
        perception: { currentSnapshot: { channel: 'web' }, recentSalientEvents: [] },
        beliefs: [],
        predictions: { active: [], recentSurprises: [] },
        attention: { candidates: [] },
        memory: { workingMemory: [], episodicRefs: [], consolidatedRefs: [] },
        capabilities: { available: [], restricted: [] },
        valence: { recentTrace: [], aggregatedMood: { positive: 0, negative: 0, neutral: 1, ambiguous: 0, windowHours: 24 } },
        pulseTruth: { noOverclaimStatus: 'PASS' as const, capabilityHealthScore: 0, gates: [], certificationVerdict: { verdict: 'INSUFFICIENT_EVIDENCE' as const, score: 0, measuredAt: new Date().toISOString() }, overclaimRisk: 0 },
        currentInput: { raw: 'h', channel: 'web', arrivalTimestamp: new Date().toISOString() },
      },
    };

    beforeEach(async () => {
      abiBuilder = { build: jest.fn().mockResolvedValue(validAbi) };
      await buildService();
    });

    it('does not emit kloel_abi_degraded when ABI passes', async () => {
      await service.buildChatModelMessages(callParams);
      const logs = parseDegradedLog();
      expect(logs).toHaveLength(0);
    });
  });
});
