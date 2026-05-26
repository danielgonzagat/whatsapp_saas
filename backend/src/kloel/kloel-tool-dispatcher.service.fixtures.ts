import { PlanLimitsService } from '../billing/plan-limits.service';
import { KloelChatToolsService } from './kloel-chat-tools.service';
import { KloelBusinessConfigToolsService } from './kloel-business-config-tools.service';
import { KloelWhatsAppToolsService } from './kloel-whatsapp-tools.service';
import { KloelComposerService } from './kloel-composer.service';
import { AuditService } from '../audit/audit.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { KloelCodeToolsService } from './kloel-code-tools.service';
import { KloelCodeAnalysisService } from './kloel-code-analysis.service';
import { AccountService } from './account.service';

type DispatcherPrismaMock = {
  workspace: { findUnique: jest.Mock };
  approvalRequest: { create: jest.Mock; findFirst: jest.Mock; updateMany: jest.Mock };
  $transaction: jest.Mock;
};

type DispatcherChatToolsMock = Pick<
  KloelChatToolsService,
  | 'toolSaveProduct'
  | 'toolListProducts'
  | 'toolDeleteProduct'
  | 'toolToggleAutopilot'
  | 'toolSetBrandVoice'
  | 'toolSetSalesPolicy'
  | 'toolRememberUserInfo'
  | 'toolCreateFlow'
  | 'toolListFlows'
  | 'toolGetDashboardSummary'
  | 'toolCreateAgentJob'
  | 'toolListAgentJobs'
  | 'toolSetAgentJobEnabled'
  | 'toolSearchAgentMemory'
  | 'toolSearchAgentMemoryWithContacts'
  | 'toolSearchAgentSessions'
  | 'toolGetAgentArtifact'
  | 'toolUpsertAgentSkill'
  | 'toolRecordAgentSkillOutcome'
  | 'toolRecordAgentDelegation'
  | 'toolRecordAgentEvidence'
  | 'toolSearchAgentEvidence'
  | 'toolListAgentEvidence'
  | 'toolVerifyAgentEvidence'
  | 'toolCreatePaymentLink'
>;

type DispatcherAccountMock = Pick<AccountService, 'updatePersonalData'>;

type DispatcherBizConfigMock = Pick<
  KloelBusinessConfigToolsService,
  | 'toolListLeads'
  | 'toolGetLeadDetails'
  | 'toolSaveBusinessInfo'
  | 'toolSetBusinessHours'
  | 'toolCreateCampaign'
  | 'toolUpdateBillingInfo'
  | 'toolGetBillingStatus'
  | 'toolChangePlan'
>;

type DispatcherWhatsappMock = Pick<
  KloelWhatsAppToolsService,
  | 'toolConnectWhatsapp'
  | 'toolGetWhatsAppStatus'
  | 'toolSendWhatsAppMessage'
  | 'toolListWhatsAppContacts'
  | 'toolCreateWhatsAppContact'
  | 'toolListWhatsAppChats'
  | 'toolGetWhatsAppMessages'
  | 'toolGetWhatsAppBacklog'
  | 'toolSetWhatsAppPresence'
  | 'toolSyncWhatsAppHistory'
  | 'toolSendAudio'
  | 'toolSendDocument'
  | 'toolSendVoiceNote'
  | 'toolTranscribeAudio'
>;

type DispatcherComposerMock = Pick<KloelComposerService, 'searchWeb'>;

type DispatcherCodeToolsMock = Pick<
  KloelCodeToolsService,
  | 'toolReadSourceFile'
  | 'toolListSourceDir'
  | 'toolSearchCodebase'
  | 'toolCodeOutline'
  | 'toolReadPrismaSchema'
  | 'toolGitLog'
  | 'toolGitDiff'
  | 'toolGitStatus'
  | 'toolRunBackendTests'
  | 'toolBuildStatus'
>;

type DispatcherAuditMock = Pick<AuditService, 'logWithTx' | 'recentForWorkspace' | 'findById'>;

type DispatcherSelfHealthMock = { snapshot: jest.Mock };

type DispatcherSelfGapsMock = { diffRegistryVsDispatcher: jest.Mock };

type DispatcherCapRegistryV2Mock = { get: jest.Mock };

type DispatcherOpsAlertMock = Pick<OpsAlertService, 'alertOnCriticalError'>;

type DispatcherPlanLimitsMock = Pick<PlanLimitsService, 'ensureTokenBudget' | 'trackAiUsage'>;

export type {
  DispatcherPrismaMock,
  DispatcherChatToolsMock,
  DispatcherBizConfigMock,
  DispatcherAccountMock,
  DispatcherWhatsappMock,
  DispatcherComposerMock,
  DispatcherCodeToolsMock,
  DispatcherAuditMock,
  DispatcherOpsAlertMock,
  DispatcherPlanLimitsMock,
  DispatcherSelfHealthMock,
  DispatcherSelfGapsMock,
  DispatcherCapRegistryV2Mock,
};

const DEFAULT_WS_ID = 'ws-1';

export function createPrismaMock(): DispatcherPrismaMock {
  const prisma: DispatcherPrismaMock = {
    workspace: {
      findUnique: jest.fn().mockResolvedValue({ id: DEFAULT_WS_ID, providerSettings: {} }),
    },
    approvalRequest: {
      create: jest.fn().mockResolvedValue({
        id: 'ap-1',
        kind: 'kloel_tool:create_campaign',
        state: 'OPEN',
        title: 'Title',
        createdAt: new Date(),
      }),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest
      .fn()
      .mockImplementation((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: DispatcherPrismaMock) => unknown)(prisma)
          : Promise.resolve(undefined),
      ),
  };
  return prisma;
}

export function createPlanLimitsMock(): DispatcherPlanLimitsMock {
  return {
    ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
    trackAiUsage: jest.fn().mockResolvedValue(undefined),
  };
}

export function createChatToolsMock(): DispatcherChatToolsMock {
  return {
    toolSaveProduct: jest.fn().mockResolvedValue({ success: true }),
    toolListProducts: jest.fn().mockResolvedValue({ success: true, products: [] }),
    toolDeleteProduct: jest.fn().mockResolvedValue({ success: true }),
    toolToggleAutopilot: jest.fn().mockResolvedValue({ success: true, enabled: true }),
    toolSetBrandVoice: jest.fn().mockResolvedValue({ success: true }),
    toolSetSalesPolicy: jest.fn().mockResolvedValue({ success: true }),
    toolRememberUserInfo: jest.fn().mockResolvedValue({ success: true }),
    toolCreateFlow: jest.fn().mockResolvedValue({ success: true, flow: {} }),
    toolListFlows: jest.fn().mockResolvedValue({ success: true, flows: [] }),
    toolGetDashboardSummary: jest.fn().mockResolvedValue({ success: true, stats: {} }),
    toolCreateAgentJob: jest.fn().mockResolvedValue({ success: true, key: 'agent_job:daily' }),
    toolListAgentJobs: jest.fn().mockResolvedValue({ success: true, jobs: [] }),
    toolSetAgentJobEnabled: jest.fn().mockResolvedValue({ success: true }),
    toolSearchAgentMemory: jest.fn().mockResolvedValue({ success: true, memories: [] }),
    toolSearchAgentMemoryWithContacts: jest.fn().mockResolvedValue({
      success: true,
      memories: [],
      contacts: [],
    }),
    toolSearchAgentSessions: jest.fn().mockResolvedValue({ success: true, sessions: [] }),
    toolGetAgentArtifact: jest.fn().mockResolvedValue({ success: true, content: '{}' }),
    toolUpsertAgentSkill: jest.fn().mockResolvedValue({ success: true, skillId: 'skill_1' }),
    toolRecordAgentSkillOutcome: jest.fn().mockResolvedValue({ success: true }),
    toolRecordAgentDelegation: jest.fn().mockResolvedValue({ success: true }),
    toolRecordAgentEvidence: jest.fn().mockResolvedValue({ success: true }),
    toolSearchAgentEvidence: jest.fn().mockResolvedValue({ success: true, evidence: [] }),
    toolListAgentEvidence: jest.fn().mockResolvedValue({ success: true, evidence: [] }),
    toolVerifyAgentEvidence: jest.fn().mockResolvedValue({ success: true }),
    toolCreatePaymentLink: jest
      .fn()
      .mockResolvedValue({ success: true, paymentUrl: 'https://pay.test' }),
  };
}

export function createBizConfigToolsMock(): DispatcherBizConfigMock {
  return {
    toolListLeads: jest.fn().mockResolvedValue({ success: true, leads: [] }),
    toolGetLeadDetails: jest.fn().mockResolvedValue({ success: true }),
    toolSaveBusinessInfo: jest.fn().mockResolvedValue({ success: true }),
    toolSetBusinessHours: jest.fn().mockResolvedValue({ success: true }),
    toolCreateCampaign: jest.fn().mockResolvedValue({ success: true, campaignId: 'c-1' }),
    toolUpdateBillingInfo: jest.fn().mockResolvedValue({ success: true }),
    toolGetBillingStatus: jest.fn().mockResolvedValue({ success: true }),
    toolChangePlan: jest.fn().mockResolvedValue({ success: true }),
  };
}

export function createWhatsappToolsMock(): DispatcherWhatsappMock {
  return {
    toolConnectWhatsapp: jest.fn().mockResolvedValue({ success: true }),
    toolGetWhatsAppStatus: jest.fn().mockResolvedValue({ success: true, connected: false }),
    toolSendWhatsAppMessage: jest.fn().mockResolvedValue({ success: true }),
    toolListWhatsAppContacts: jest.fn().mockResolvedValue({ success: true, contacts: [] }),
    toolCreateWhatsAppContact: jest.fn().mockResolvedValue({ success: true }),
    toolListWhatsAppChats: jest.fn().mockResolvedValue({ success: true, chats: [] }),
    toolGetWhatsAppMessages: jest.fn().mockResolvedValue({ success: true, messages: [] }),
    toolGetWhatsAppBacklog: jest.fn().mockResolvedValue({ success: true, backlog: [] }),
    toolSetWhatsAppPresence: jest.fn().mockResolvedValue({ success: true }),
    toolSyncWhatsAppHistory: jest.fn().mockResolvedValue({ success: true }),
    toolSendAudio: jest.fn().mockResolvedValue({ success: true }),
    toolSendDocument: jest.fn().mockResolvedValue({ success: true }),
    toolSendVoiceNote: jest.fn().mockResolvedValue({ success: true }),
    toolTranscribeAudio: jest.fn().mockResolvedValue({ success: true, transcription: 'text' }),
  };
}

export function createComposerMock(): DispatcherComposerMock {
  return {
    searchWeb: jest.fn().mockResolvedValue({ answer: 'search result', sources: [] }),
  };
}

export function createAuditMock(): DispatcherAuditMock {
  return {
    logWithTx: jest.fn().mockResolvedValue(undefined),
    recentForWorkspace: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
  };
}

export function createSelfHealthMock(): DispatcherSelfHealthMock {
  return {
    snapshot: jest.fn().mockResolvedValue({
      db: 'ok',
      redis: 'ok',
      whatsapp: 'unknown',
      llm: 'unknown',
      lastChecked: new Date().toISOString(),
    }),
  };
}

export function createSelfGapsMock(): DispatcherSelfGapsMock {
  return {
    diffRegistryVsDispatcher: jest.fn().mockResolvedValue({
      unwired: [],
      wired: [],
    }),
  };
}

export function createCapRegistryV2Mock(): DispatcherCapRegistryV2Mock {
  return {
    get: jest.fn().mockReturnValue(undefined),
  };
}

export function createOpsAlertMock(): DispatcherOpsAlertMock {
  return {
    alertOnCriticalError: jest.fn(),
  };
}

export function createCodeToolsMock(): DispatcherCodeToolsMock {
  return {
    toolReadSourceFile: jest.fn().mockResolvedValue({ success: true, content: 'file content' }),
    toolListSourceDir: jest.fn().mockResolvedValue({ success: true, entries: [] }),
    toolSearchCodebase: jest.fn().mockResolvedValue({ success: true, matches: [] }),
    toolCodeOutline: jest.fn().mockResolvedValue({ success: true, symbols: [] }),
    toolReadPrismaSchema: jest.fn().mockResolvedValue({ success: true, schema: '' }),
    toolGitLog: jest.fn().mockResolvedValue({ success: true, log: '' }),
    toolGitDiff: jest.fn().mockResolvedValue({ success: true, diff: '' }),
    toolGitStatus: jest.fn().mockResolvedValue({ success: true, status: '' }),
    toolRunBackendTests: jest.fn().mockResolvedValue({ success: true, results: [] }),
    toolBuildStatus: jest.fn().mockResolvedValue({ success: true, status: 'ok' }),
  };
}

export { DEFAULT_WS_ID };

type DispatcherCodeAnalysisMock = Pick<
  KloelCodeAnalysisService,
  'toolCodeLint' | 'toolCodeDetectIssues'
>;

export type { DispatcherCodeAnalysisMock };

export function createCodeAnalysisMock(): DispatcherCodeAnalysisMock {
  return {
    toolCodeLint: jest.fn().mockResolvedValue({ success: true, issues: [] }),
    toolCodeDetectIssues: jest.fn().mockResolvedValue({ success: true, issues: [] }),
  };
}

export function createAccountMock(): DispatcherAccountMock {
  return {
    updatePersonalData: jest
      .fn()
      .mockResolvedValue({ success: true, message: 'Personal data updated' }),
  };
}
