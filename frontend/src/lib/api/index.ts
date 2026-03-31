// Barrel re-export — every symbol from the original api.ts
// This ensures `import { X } from '@/lib/api'` continues to work.

// Core: types, tokenStorage, apiFetch, helpers, wallet, memory, leads, generic api
export {
  // Types
  type WalletBalance,
  type WalletTransaction,
  type MemoryItem,
  type Product,
  type Lead,
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
  // Wallet
  getWalletBalance,
  getWalletTransactions,
  processSale,
  requestWithdrawal,
  confirmTransaction,
  // Memory
  getMemoryStats,
  getMemoryList,
  saveProduct,
  searchMemory,
  // Leads
  getLeads,
  // Generic API client
  api,
} from './core';

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

// Kloel health, PDF, payments
export {
  type KloelHealth,
  getKloelHealth,
  uploadPdf,
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

// Asaas & external payments
export {
  type AsaasStatus,
  type AsaasBalance,
  type AsaasPaymentRecord,
  type SalesReportSummary,
  type ExternalPaymentPlatformConfig,
  type KnowledgeSourceItem,
  type KnowledgeBaseItem,
  getAsaasStatus,
  connectAsaas,
  disconnectAsaas,
  getAsaasBalance,
  createAsaasPix,
  createAsaasBoleto,
  getAsaasPayment,
  listAsaasPayments,
  type ExternalPaymentLink,
  type ExternalPaymentSummary,
  getExternalPaymentLinks,
  addExternalPaymentLink,
  toggleExternalPaymentLink,
  deleteExternalPaymentLink,
  searchExternalPayments,
  listExternalPlatforms,
  createExternalPlatform,
} from './asaas';

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

// Products, external payments, knowledge base
export {
  type CatalogProduct,
  productApi,
  externalPaymentApi,
  knowledgeBaseApi,
} from './products';

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

// Misc: notifications, metrics, calendar, tools, member area, affiliate, dashboard
export {
  registerNotificationDevice,
  getMetrics,
  getQueueMetrics,
  type CalendarEvent,
  listCalendarEvents,
  createCalendarEvent,
  cancelCalendarEvent,
  type FollowUpConfig,
  type MeetingConfig,
  type DocumentUpload,
  type AIToolInfo,
  listAITools,
  scheduleFollowUp,
  listScheduledFollowUps,
  cancelFollowUp,
  uploadDocument,
  listDocuments,
  saveObjectionScript,
  listObjectionScripts,
  getDashboardStats,
  installMarketplaceTemplate,
  getFollowupsApi,
  getFollowupStatsApi,
  memberAreaApi,
  memberAreaStudentsApi,
  affiliateApi,
  campaignMassSendApi,
  kycApi,
  growthApi,
  kloelMemoryApi,
  patchFollowup,
  getKloelFollowups,
  gdprApi,
  listMarketplaceTemplates,
  importProducts,
} from './misc';

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
import { whatsappApi } from './whatsapp-api';
import { kloelApi } from './kloel-api';
import { billingApi } from './billing';
import { workspaceApi } from './workspace';
import { productApi, externalPaymentApi, knowledgeBaseApi } from './products';
import { crmApi, segmentationApi } from './crm';
import { kycApi } from './misc';

const apiClient = {
  auth: authApi,
  whatsapp: whatsappApi,
  kloel: kloelApi,
  billing: billingApi,
  workspace: workspaceApi,
  products: productApi,
  externalPayments: externalPaymentApi,
  knowledgeBase: knowledgeBaseApi,
  crm: crmApi,
  segmentation: segmentationApi,
  kyc: kycApi,
};

export default apiClient;
