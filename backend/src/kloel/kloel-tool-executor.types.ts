/** Type definitions for KloelToolExecutorService tool arguments. */

type UnknownRecord = Record<string, unknown>;

/** Generic tool result shape returned by all tool* methods. */
export interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

export interface ToolSaveProductArgs extends UnknownRecord {
  name: string;
  price: number;
  description?: string;
}
export interface ToolDeleteProductArgs extends UnknownRecord {
  productId?: string;
  productName?: string;
}
export interface ToolToggleAutopilotArgs extends UnknownRecord {
  enabled: boolean;
}
export interface ToolSetBrandVoiceArgs extends UnknownRecord {
  tone: string;
  personality?: string;
}
export interface ToolRememberUserInfoArgs extends UnknownRecord {
  key: string;
  value: string;
}
export interface ToolSearchWebArgs extends UnknownRecord {
  query: string;
}
export interface ToolCreateFlowArgs extends UnknownRecord {
  name: string;
  trigger: string;
  actions?: string[];
}
export interface ToolDashboardSummaryArgs extends UnknownRecord {
  period?: 'today' | 'week' | 'month';
}
export interface ToolSendWhatsAppMessageArgs extends UnknownRecord {
  phone: string;
  message: string;
}
export interface ToolPaginationArgs extends UnknownRecord {
  limit?: number;
}
export interface ToolCreateWhatsAppContactArgs extends UnknownRecord {
  phone: string;
  name?: string;
  email?: string;
}
export interface ToolGetWhatsAppMessagesArgs extends UnknownRecord {
  chatId?: string;
  phone?: string;
  limit?: number;
  offset?: number;
}
export interface ToolSetWhatsAppPresenceArgs extends UnknownRecord {
  chatId?: string;
  phone?: string;
  presence?: 'typing' | 'paused' | 'seen';
}
export interface ToolSyncWhatsAppHistoryArgs extends UnknownRecord {
  reason?: string;
}
export interface ToolListLeadsArgs extends UnknownRecord {
  limit?: number;
  status?: string;
}
export interface ToolGetLeadDetailsArgs extends UnknownRecord {
  phone?: string;
  leadId?: string;
}
export interface ToolSaveBusinessInfoArgs extends UnknownRecord {
  businessName?: string;
  description?: string;
  segment?: string;
}
export interface ToolSetBusinessHoursArgs extends UnknownRecord {
  weekdayStart?: string;
  weekdayEnd?: string;
  saturdayStart?: string;
  saturdayEnd?: string;
  workOnSunday?: boolean;
}
export interface ToolCreateCampaignArgs extends UnknownRecord {
  name: string;
  message: string;
  targetAudience?: string;
}
export interface ToolSendAudioArgs extends UnknownRecord {
  phone: string;
  text: string;
  voice?: string;
}
export interface ToolSendDocumentArgs extends UnknownRecord {
  phone: string;
  documentName?: string;
  url?: string;
  caption?: string;
}
export interface ToolTranscribeAudioArgs extends UnknownRecord {
  audioUrl?: string;
  audioBase64?: string;
  language?: string;
}
export interface ToolUpdateBillingInfoArgs extends UnknownRecord {
  returnUrl?: string;
}
export interface ToolChangePlanArgs extends UnknownRecord {
  newPlan: string;
  immediate?: boolean;
}
