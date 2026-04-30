import { Injectable, Logger, Optional } from '@nestjs/common';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AudioService } from './audio.service';

const NON_DIGIT_RE = /\D/g;
/** Generic tool result shape. */
interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
}
interface ToolSendWhatsAppMessageArgs {
  phone: string;
  message: string;
}
interface ToolPaginationArgs {
  limit?: number;
}
interface ToolCreateWhatsAppContactArgs {
  phone: string;
  name?: string;
  email?: string;
}
interface ToolGetWhatsAppMessagesArgs {
  chatId?: string;
  phone?: string;
  limit?: number;
  offset?: number;
}
interface ToolSetWhatsAppPresenceArgs {
  chatId?: string;
  phone?: string;
  presence?: 'typing' | 'paused' | 'seen';
}
interface ToolSyncWhatsAppHistoryArgs {
  reason?: string;
}
interface ToolSendAudioArgs {
  phone: string;
  text: string;
  voice?: string;
}
interface ToolSendDocumentArgs {
  phone: string;
  documentName?: string;
  url?: string;
  caption?: string;
}
interface ToolTranscribeAudioArgs {
  audioUrl?: string;
  audioBase64?: string;
  language?: string;
}
import "../../../scripts/pulse/__companions__/kloel-whatsapp-tools.service.companion";
