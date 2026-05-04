// Barrel re-export — every symbol from the original api.ts
// This ensures `import { X } from '@/lib/api'` continues to work.

// Core: types, tokenStorage, apiFetch, helpers, wallet, memory, leads, generic api
export {
  type WhatsAppConnectionStatus,
  type WhatsAppProofEntry,
  type WhatsAppConnectResponse,
  type WhatsAppScreencastTokenResponse,
  // Token & auth helpers
  tokenStorage,
  resolveWorkspaceFromAuthPayload,
  apiFetch,
  buildQuery,
  authHeaders,
  // Generic API client
  api,
} from './core';

// Wallet
export {
  type WalletBalance,
  type WalletTransaction,
  getWalletBalance,
  getWalletTransactions,
  processSale,
  requestWithdrawal,
  confirmTransaction,
} from './wallet';

// Memory
export {
  type MemoryItem,
  type Product,
  getMemoryStats,
  getMemoryList,
  saveProduct,
  searchMemory,
} from './memory';

// Leads
export { type Lead, getLeads } from './leads';

// WhatsApp connection + messaging
export {
  getWhatsAppScreencastWsBase,
  buildWhatsAppScreencastWsUrl,
  getWhatsAppStatus,
  initiateWhatsAppConnection,
  getWhatsAppQR,
  disconnectWhatsApp,
  logoutWhatsApp,
  getWhatsAppViewer,
  getWhatsAppScreencastToken,
  performWhatsAppViewerAction,
  takeoverWhatsAppViewer,
  resumeWhatsAppAgent,
  pauseWhatsAppAgent,
  reconcileWhatsAppSession,
  getWhatsAppProofs,
  runWhatsAppActionTurn,
  // Session management (advanced)
  getWhatsAppSessionDiagnostics,
  forceWhatsAppSessionCheck,
  forceWhatsAppReconnect,
  repairWhatsAppSessionConfig,
  linkWhatsAppSession,
  recreateWhatsAppSessionIfInvalid,
  getWhatsAppProviderStatus,
  checkWhatsAppPhone,
  // Catalog
  type WhatsAppCatalogContact,
  getWhatsAppCatalogContacts,
  getWhatsAppCatalogRanking,
  refreshWhatsAppCatalog,
  scoreWhatsAppCatalog,
  // WhatsApp messaging
  type WhatsappTemplate,
  connectWhatsapp,
  sendWhatsappMessage,
  sendWhatsappTemplate,
  listWhatsappTemplates,
  whatsappOptIn,
  whatsappOptOut,
  whatsappOptStatus,
} from './whatsapp';

// Analytics
export {
  type AnalyticsDashboardStats,
  type AnalyticsDailyActivityItem,
  type AnalyticsAdvancedResponse,
  getAnalyticsDashboard,
  getAnalyticsDailyActivity,
  getAnalyticsAdvanced,
} from './analytics';

// Dashboard Home
export {
  type DashboardHomePeriod,
  type DashboardHomeProduct,
  type DashboardHomeConversation,
  type DashboardHomeResponse,
  getDashboardHome,
} from './home';

// Kloel health, PDF, chat uploads, payments
export {
  type KloelHealth,
  getKloelHealth,
  uploadPdf,
  uploadChatFile,
  type PaymentLinkResponse,
  createPaymentLink,
} from './kloel';

// Campaigns
export {
  type Campaign,
  listCampaigns,
  createCampaign,
  launchCampaign,
  createCampaignVariants,
  evaluateCampaignDarwin,
} from './campaigns';

// Shared finance and knowledge types
export type { SalesReportSummary, KnowledgeSourceItem, KnowledgeBaseItem } from './shared-types';

// Autopilot
export {
  type AutopilotStatus,
  type AutopilotStats,
  type AutopilotImpact,
  type AutopilotPipeline,
  type SystemHealth,
  type AutopilotSmokeTest,
  type AutopilotConfig,
  type AutopilotAction,
  getAutopilotStatus,
  toggleAutopilot,
  getAutopilotConfig,
  updateAutopilotConfig,
  getAutopilotStats,
  getAutopilotImpact,
  getAutopilotPipeline,
  runAutopilotSmokeTest,
  getSystemHealth,
  getAutopilotActions,
  exportAutopilotActions,
  retryAutopilotContact,
  markAutopilotConversion,
  runAutopilot,
  getAutopilotMoneyReport,
  getAutopilotRevenueEvents,
  getAutopilotNextBestAction,
  type MoneyMachineResult,
  activateMoneyMachine,
  type AskInsightsResult,
  askAutopilotInsights,
  type SendDirectResult,
  sendAutopilotDirectMessage,
  type RuntimeConfig,
  getAutopilotRuntimeConfig,
} from './autopilot';

// Flows
export {
  type FlowNode,
  type FlowEdge,
  type Flow,
  type FlowExecutionLog,
  type FlowTemplate,
  getFlowTemplates,
  runFlow,
  runSavedFlow,
  saveFlow,
  updateFlow,
  createFlowVersion,
  logFlowExecution,
  getFlowLogs,
  listFlows,
  getFlow,
  listFlowExecutions,
  getFlowExecution,
  retryFlowExecution,
  listFlowVersions,
  getFlowVersion,
  createFlowFromTemplate,
  listPublicFlowTemplates,
  listAllFlowTemplates,
  getFlowTemplate,
  createFlowTemplate,
  downloadFlowTemplate,
  optimizeFlow,
} from './flows';

// Conversations / Inbox
export {
  type Conversation,
  type InboxAgent,
  type Message,
  listConversations,
  listInboxAgents,
  getConversationMessages,
  closeConversation,
  assignConversation,
} from './conversations';

// Auth API
export { authApi } from './auth';

// Cookie consent API
export { cookieConsentApi } from './cookie-consent';

// WhatsApp API object
export { whatsappApi } from './whatsapp-api';

// CIA API
export {
  type CiaSurfaceResponse,
  type CiaCognitiveHighlight,
  type CiaHumanTask,
  type CiaAccountApproval,
  type CiaInputSession,
  type CiaWorkItem,
  type CiaAccountRuntime,
  type CiaCapabilityRegistry,
  type CiaConversationActionRegistry,
  type CiaProof,
  type CiaConversationProof,
  ciaApi,
  autostartCia,
} from './cia';

// Kloel chat API
export { kloelApi } from './kloel-api';

// Billing API object
export { billingApi } from './billing';

// Workspace API
export {
  type WorkspaceSettings,
  saveWorkspaceSettings,
  type ApiKey,
  listApiKeys,
  createApiKey,
  deleteApiKey,
  type CheckoutResponse,
  createCheckoutSession,
  type SubscriptionStatus,
  getSubscriptionStatus,
  activateTrial,
  cancelSubscription,
  getBillingUsage,
  type PaymentMethod,
  type SetupIntentResponse,
  createSetupIntent,
  attachPaymentMethod,
  listPaymentMethods,
  setDefaultPaymentMethod,
  removePaymentMethod,
  type WorkspaceInfo,
  getWorkspace,
  regenerateApiKey,
  workspaceApi,
} from './workspace';

// Products and knowledge base
export { type CatalogProduct, productApi, knowledgeBaseApi } from './products';

// Member area
export { memberAreaApi, memberAreaStudentsApi } from './member-area';

// Affiliate
export { affiliateApi } from './affiliate';

export { smartPaymentApi } from './smart-payment';
export { checkoutPublicApi } from './checkout-public';
export { getAdSpendReport, sendReportEmail } from './reports';
export { aiAssistantApi, uploadKnowledgeBase } from './ai-assistant';
export { scrapersApi } from './scrapers';
export { launchApi } from './launch';
export { partnershipsApi } from './partnerships';
export { webinarApi } from './webinars';
export { type VoiceProfile, mediaApi, videoApi, voiceApi } from './media';
export { getPaymentsStatus, getFinanceWebhookRecent } from './finance';
export { kycChangePassword, kycApi } from './kyc';
export { registerNotificationDevice } from './notifications';
export { getMetrics, getQueueMetrics } from './metrics';
export {
  type CalendarEvent,
  listCalendarEvents,
  createCalendarEvent,
  cancelCalendarEvent,
} from './calendar';
export { type AIToolInfo, listAITools } from './agent-tools';
export { type DocumentUpload, uploadDocument, listDocuments } from './documents';
export {
  type FollowUpConfig,
  type MeetingConfig,
  scheduleFollowUp,
  listScheduledFollowUps,
  cancelFollowUp,
  getFollowupsApi,
  getFollowupStatsApi,
  patchFollowup,
  getKloelFollowups,
} from './followups';
export { saveObjectionScript, listObjectionScripts } from './objections';
export { getDashboardStats } from './dashboard';
export { installMarketplaceTemplate, listMarketplaceTemplates } from './marketplace';
export { growthApi } from './growth';
export { kloelMemoryApi } from './kloel-memory';
export { gdprApi } from './privacy';
export { importProducts } from './product-import';
export { campaignMassSendApi } from './campaign-mass-send';
export { onboardingApi } from './onboarding';
export { adRulesApi } from './ad-rules';
export { kloelLeadsApi } from './kloel-leads';

// CRM & Segmentation & Neuro
export {
  type CrmContactTag,
  type CrmContact,
  type CrmStage,
  type CrmPipeline,
  type CrmDeal,
  type SegmentationPreset,
  type SegmentationStats,
  crmApi,
  segmentationApi,
  type NeuroAnalysis,
  type NeuroNextBestAction,
  type NeuroCluster,
  type NeuroSimulationResult,
  neuroCrmApi,
} from './crm';

// Meta Ads, Instagram, Messenger
export {
  type MetaCampaign,
  type MetaInsight,
  type MetaLeadForm,
  type MetaLead,
  metaAdsApi,
  type InstagramMedia,
  type InstagramComment,
  instagramApi,
  type MessengerConversation,
  messengerApi,
} from './meta';

// Default export: the apiClient composite object
import { authApi } from './auth';
import { affiliateApi } from './affiliate';
import { billingApi } from './billing';
import { crmApi, segmentationApi } from './crm';
import { kycApi } from './kyc';
import { kloelApi } from './kloel-api';
import { knowledgeBaseApi, productApi } from './products';
import { whatsappApi } from './whatsapp-api';
import { workspaceApi } from './workspace';

const apiClient = {
  auth: authApi,
  whatsapp: whatsappApi,
  kloel: kloelApi,
  billing: billingApi,
  workspace: workspaceApi,
  products: productApi,
  knowledgeBase: knowledgeBaseApi,
  crm: crmApi,
  segmentation: segmentationApi,
  kyc: kycApi,
};

export default apiClient;
