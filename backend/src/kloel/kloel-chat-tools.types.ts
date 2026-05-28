export const NON_SLUG_CHAR_RE = /[^a-z0-9_:-]+/g;

export function safeStr(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
}

export interface ToolSaveProductArgs {
  name: string;
  price: number;
  description?: string;
  format?: string;
  category?: string;
  imageUrl?: string;
  tags?: string[];
  warrantyDays?: number;
  salesPageUrl?: string;
  thankyouUrl?: string;
  supportEmail?: string;
  active?: boolean;
}
export interface ToolDeleteProductArgs {
  productId?: string;
  productName?: string;
}
export interface ToolToggleAutopilotArgs {
  enabled: boolean;
}
export interface ToolSetBrandVoiceArgs {
  tone: string;
  personality?: string;
}
export interface ToolSetSalesPolicyArgs {
  aggressiveness?: string;
  tone?: string;
  instructions?: string;
  appliesTo?: string;
}
export interface ToolRememberUserInfoArgs {
  key: string;
  value: string;
}
export interface ToolCreateFlowArgs {
  name: string;
  trigger: string;
  actions?: string[];
}
export interface ToolDashboardSummaryArgs {
  period?: 'today' | 'week' | 'month';
}
export function centsFromUnknown(value: unknown): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return 0;
}
