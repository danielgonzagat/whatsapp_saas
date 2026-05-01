export const NON_DIGIT_RE = /\D/g;

/** Generic tool result shape. */
export interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
}
export interface ToolSendWhatsAppMessageArgs {
  phone: string;
  message: string;
}
export interface ToolPaginationArgs {
  limit?: number;
}
export interface ToolCreateWhatsAppContactArgs {
  phone: string;
  name?: string;
  email?: string;
}
export interface ToolGetWhatsAppMessagesArgs {
  chatId?: string;
  phone?: string;
  limit?: number;
  offset?: number;
}
export interface ToolSetWhatsAppPresenceArgs {
  chatId?: string;
  phone?: string;
  presence?: 'typing' | 'paused' | 'seen';
}
export interface ToolSyncWhatsAppHistoryArgs {
  reason?: string;
}
export interface ToolSendAudioArgs {
  phone: string;
  text: string;
  voice?: string;
}
export interface ToolSendDocumentArgs {
  phone: string;
  documentName?: string;
  url?: string;
  caption?: string;
}
export interface ToolTranscribeAudioArgs {
  audioUrl?: string;
  audioBase64?: string;
  language?: string;
}
