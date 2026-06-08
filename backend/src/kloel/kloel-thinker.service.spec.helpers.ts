import { KloelContextFormatter } from './kloel-context-formatter';
import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { KloelThinkerService } from './kloel-thinker.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { LLMBudgetService } from './llm-budget.service';
import type { Response } from 'express';
import { AbiBuilderService } from './abi/abi-builder.service';
import { MindCapabilityExecutor } from './mind/coordination';
import { StateBuilderService } from './state/state-builder.service';
import { MemoryService } from './mind/memory/memory.service';
import { ManifestInjectionBuilderService } from './manifest/manifest-injection.builder';

jest.mock('./kloel-thread.service', () => ({
  KloelThreadService: class MockKloelThreadService {},
  StoredProcessingTraceEntry: undefined,
  StoredResponseVersion: undefined,
  ChatMessage: undefined,
  ThreadConversationState: undefined,
}));

jest.mock('./kloel-workspace-context.service', () => ({
  KloelWorkspaceContextService: class MockKloelWorkspaceContextService {},
}));

jest.mock('./kloel-composer.service', () => ({
  KloelComposerService: class MockKloelComposerService {},
}));

jest.mock('./kloel-reply-engine.service', () => ({
  KloelReplyEngineService: class MockKloelReplyEngineService {},
  LocalToolExecutor: undefined,
}));

jest.mock('./kloel-llm-e2e-guard', () => ({
  KLOEL_LLM_E2E_GUARD: Symbol('KLOEL_LLM_E2E_GUARD'),
  KloelLLME2EGuard: class MockKloelLLME2EGuard {},
  NoopKloelLLME2EGuard: class MockNoopKloelLLME2EGuard {},
}));

jest.mock('./kloel-conversation-store', () => ({
  KloelConversationStore: class MockKloelConversationStore {},
}));

import { KloelThreadService } from './kloel-thread.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';
import { KloelComposerService } from './kloel-composer.service';
import { KloelReplyEngineService, type LocalToolExecutor } from './kloel-reply-engine.service';
import { KLOEL_LLM_E2E_GUARD, KloelLLME2EGuard } from './kloel-llm-e2e-guard';
import { KloelStreamWriter } from './kloel-stream-writer';
import {
  finalizeSuccessfulReply,
  runComposerCapabilityBranch,
} from './kloel-thinker-think.helpers';
jest.mock('./kloel-thinker.helpers', () => ({
  thinkSyncImpl: jest.fn(),
  regenerateThreadAssistantResponseImpl: jest.fn(),
}));

jest.mock('./kloel-thinker-think.helpers', () => {
  const actual = jest.requireActual<typeof import('./kloel-thinker-think.helpers')>(
    './kloel-thinker-think.helpers',
  );
  return {
    ...actual,
    runComposerCapabilityBranch: jest.fn(),
    runToolPlanningBranch: jest.fn(),
    finalizeSuccessfulReply: jest.fn(),
  };
});

jest.mock('./kloel-conversation-store', () => ({
  KloelConversationStore: jest.fn().mockImplementation(() => ({
    getConversationMessages: jest.fn().mockResolvedValue([]),
  })),
}));

jest.mock('./kloel-stream-writer', () => ({
  KloelStreamWriter: jest.fn().mockImplementation(() => ({
    init: jest.fn(),
    write: jest.fn(),
    close: jest.fn(),
    streamModelResponse: jest.fn(),
    getLastReasoning: jest.fn(() => ({ text: '', durationMs: undefined })),
  })),
}));

jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn(),
}));

import { chatCompletionWithFallback } from './openai-wrapper';

export {
  ForbiddenException,
  KloelStreamWriter,
  chatCompletionWithFallback,
  finalizeSuccessfulReply,
  runComposerCapabilityBranch,
};
export type { LocalToolExecutor, Response };

type ThinkerPrismaMock = {
  workspace: { findUnique: jest.Mock };
  agent: { findFirst: jest.Mock };
  chatThread: { findFirst: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
  chatMessage: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  $transaction: jest.Mock;
};

export let service: KloelThinkerService;
export let prisma: ThinkerPrismaMock;
export let planLimits: Pick<PlanLimitsService, 'ensureTokenBudget' | 'trackAiUsage'>;
export let llmBudget: Pick<LLMBudgetService, 'assertBudget' | 'recordSpend'>;
export let threadService: Pick<
  KloelThreadService,
  | 'resolveThread'
  | 'getThreadConversationState'
  | 'buildThreadSummarySystemMessage'
  | 'persistUserThreadMessage'
  | 'buildThreadMessageMetadata'
  | 'resolveClientRequestId'
  | 'appendStoredProcessingTraceEntry'
>;
export let wsContextService: Pick<KloelWorkspaceContextService, 'getWorkspaceContext'>;
export let composerService: Pick<KloelComposerService, 'searchWeb'>;
type KloelReplyEngineMock = Pick<
  KloelReplyEngineService,
  | 'hasOpenAiKey'
  | 'buildDashboardPrompt'
  | 'buildChatModelMessages'
  | 'buildDynamicRuntimeContext'
  | 'buildMarketingPromptAddendum'
  | 'detectExpertiseLevel'
  | 'shouldAttemptToolPlanningPass'
  | 'shouldUseLongFormBudget'
  | 'isClientDisconnected'
  | 'buildStreamAbortMessage'
  | 'openai'
  | 'unavailableMessage'
> & {
  contextFormatter: Pick<KloelContextFormatter, 'sanitizeUserNameForAssistant'>;
};

export let replyEngine: KloelReplyEngineMock;
export let llmE2EGuard: Pick<KloelLLME2EGuard, 'isEnabled' | 'buildStream'>;
export let abiBuilder: Pick<AbiBuilderService, 'build'>;
export let capabilityExecutor: Pick<MindCapabilityExecutor, 'buildCognitiveSubstrate'>;
export let memoryGraph: Pick<MemoryService, 'buildMemoryContextForModel' | 'extractFromTurn'>;
export let manifestInjection: Pick<ManifestInjectionBuilderService, 'assemble'>;
export const wsId = 'ws-1';

beforeEach(async () => {
  prisma = {
    workspace: { findUnique: jest.fn().mockResolvedValue({ id: wsId }) },
    agent: { findFirst: jest.fn().mockResolvedValue({ name: 'Test User' }) },
    chatThread: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'thread-1',
        title: 'Nova conversa',
        summary: null,
        summaryUpdatedAt: null,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    chatMessage: {
      create: jest.fn().mockResolvedValue({ id: 'msg-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest
      .fn()
      .mockImplementation((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (p: typeof prisma) => unknown)(prisma)
          : Promise.resolve(undefined),
      ),
  };

  planLimits = {
    ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
    trackAiUsage: jest.fn().mockResolvedValue(undefined),
  };

  llmBudget = {
    assertBudget: jest.fn().mockResolvedValue(undefined),
    recordSpend: jest.fn().mockResolvedValue(undefined),
  };

  threadService = {
    resolveThread: jest.fn().mockResolvedValue({
      id: 'thread-1',
      title: 'Nova conversa',
      summary: null,
      summaryUpdatedAt: null,
    }),
    getThreadConversationState: jest
      .fn()
      .mockResolvedValue({ recentMessages: [], totalMessages: 0 }),
    buildThreadSummarySystemMessage: jest.fn().mockReturnValue(null),
    persistUserThreadMessage: jest.fn().mockResolvedValue({ id: 'msg-user-1' }),
    buildThreadMessageMetadata: jest.fn().mockReturnValue({}),
    resolveClientRequestId: jest.fn().mockReturnValue('req-1'),
    appendStoredProcessingTraceEntry: jest.fn(),
  };

  wsContextService = {
    getWorkspaceContext: jest.fn().mockResolvedValue('Company context'),
  };

  composerService = {
    searchWeb: jest.fn().mockResolvedValue({ answer: 'result', sources: [] }),
  };

  replyEngine = {
    hasOpenAiKey: jest.fn().mockReturnValue(true),
    buildDashboardPrompt: jest.fn().mockReturnValue('system prompt'),
    buildChatModelMessages: jest.fn().mockReturnValue([]),
    buildDynamicRuntimeContext: jest.fn().mockResolvedValue([]),
    buildMarketingPromptAddendum: jest.fn().mockResolvedValue([]),
    detectExpertiseLevel: jest.fn().mockReturnValue('beginner'),
    shouldAttemptToolPlanningPass: jest.fn().mockReturnValue(false),
    shouldUseLongFormBudget: jest.fn().mockReturnValue(false),
    isClientDisconnected: jest.fn().mockReturnValue(false),
    buildStreamAbortMessage: jest.fn().mockReturnValue('timeout'),
    openai: {} as Pick<KloelReplyEngineService, 'openai'>['openai'],
    unavailableMessage:
      'Eu fiquei sem acesso ao motor de resposta agora. Me chama de novo em instantes que eu retomo sem te fazer repetir tudo.',
    contextFormatter: {
      sanitizeUserNameForAssistant: jest.fn().mockReturnValue('User'),
    },
  };

  llmE2EGuard = {
    isEnabled: jest.fn().mockReturnValue(false),
    buildStream: jest.fn(),
  };

  abiBuilder = {
    build: jest.fn().mockResolvedValue({ status: 'lineage_compromised', reason: 'test' }),
  };
  capabilityExecutor = {
    buildCognitiveSubstrate: jest.fn().mockResolvedValue({
      workingMemory: ['memória operacional'],
      beliefs: [{ predicate: 'has_products', confidence: 0.8, n: 3 }],
    }),
  };

  // wire-context: default to an empty memory recall + empty manifest so the
  // EXISTING tests are byte-identical (no injected text). Individual tests
  // override these to assert injection / degradation behavior.
  memoryGraph = {
    buildMemoryContextForModel: jest.fn().mockResolvedValue({
      userProfileStatic: [],
      userProfileDynamic: [],
      relevantMemories: [],
      preferences: [],
      constraints: [],
      text: '',
    }),
    extractFromTurn: jest
      .fn()
      .mockResolvedValue({ created: 0, updated: 0, contradictions: 0, forgotten: 0, nodeIds: [] }),
  };
  manifestInjection = {
    assemble: jest.fn().mockReturnValue({ text: '', internalNames: [] }),
  };

  jest.clearAllMocks();

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      KloelThinkerService,
      { provide: PrismaService, useValue: prisma },
      { provide: PlanLimitsService, useValue: planLimits },
      { provide: LLMBudgetService, useValue: llmBudget },
      { provide: KloelThreadService, useValue: threadService },
      { provide: KloelWorkspaceContextService, useValue: wsContextService },
      { provide: KloelComposerService, useValue: composerService },
      { provide: KloelReplyEngineService, useValue: replyEngine },
      { provide: KLOEL_LLM_E2E_GUARD, useValue: llmE2EGuard },
      {
        provide: StateBuilderService,
        useValue: {
          build: jest.fn().mockResolvedValue({
            workspace: { available: false },
            actor: { available: false },
            contact: null,
            recentEvents: [],
            memory: { shortTerm: [] },
            capabilities: [],
            risk: { available: false, reason: 'no risk service' },
            missingSources: [],
            assembledAt: new Date(),
          }),
        },
      },
      { provide: AbiBuilderService, useValue: abiBuilder },
      { provide: MindCapabilityExecutor, useValue: capabilityExecutor },
      { provide: MemoryService, useValue: memoryGraph },
      { provide: ManifestInjectionBuilderService, useValue: manifestInjection },
    ],
  }).compile();

  service = module.get<KloelThinkerService>(KloelThinkerService);
});

afterEach(() => {
  jest.clearAllMocks();
});
