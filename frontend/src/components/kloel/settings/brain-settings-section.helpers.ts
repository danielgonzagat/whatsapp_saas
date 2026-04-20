// Pure data helpers extracted from brain-settings-section.tsx to reduce
// cyclomatic complexity. No React, no JSX — these are payload-shape
// transforms only.

import { aiAssistantApi } from '@/lib/api/misc';

const D_RE = /[^\d,.-]/g;
const D_3___D_RE = /\.(?=\d{3}(\D|$))/g;

/** Company profile shape. */
export interface CompanyProfile {
  /** Name property. */
  name: string;
  /** Sector property. */
  sector: string;
  /** Description property. */
  description: string;
  /** Mission property. */
  mission: string;
  /** Differentials property. */
  differentials: string[];
}

/** Voice tone profile shape. */
export interface VoiceToneProfile {
  /** Style property. */
  style: string;
  /** Custom instructions property. */
  customInstructions: string;
  /** Use professional property. */
  useProfessional: boolean;
  /** Use friendly property. */
  useFriendly: boolean;
  /** Use persuasive property. */
  usePersuasive: boolean;
}

/** Faq item shape. */
export interface FaqItem {
  /** Id property. */
  id: string;
  /** Question property. */
  question: string;
  /** Answer property. */
  answer: string;
}

/** Opening message profile shape. */
export interface OpeningMessageProfile {
  /** Message property. */
  message: string;
  /** Use emojis property. */
  useEmojis: boolean;
  /** Is formal property. */
  isFormal: boolean;
  /** Is friendly property. */
  isFriendly: boolean;
}

/** Emergency mode profile shape. */
export interface EmergencyModeProfile {
  /** Emergency action property. */
  emergencyAction: string;
  /** Fixed message property. */
  fixedMessage: string;
}

/** Format currency. */
export function formatCurrency(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '';
  }
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/** Parse currency. */
export function parseCurrency(value: string) {
  const normalized = String(value || '')
    .replace(D_RE, '')
    .replace(D_3___D_RE, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Normalize company profile. */
export function normalizeCompanyProfile(value: unknown): CompanyProfile {
  const obj = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const differentials = Array.isArray(obj.differentials)
    ? obj.differentials.filter((entry: unknown) => typeof entry === 'string')
    : [];

  return {
    name: typeof obj.name === 'string' ? obj.name : '',
    sector: typeof obj.sector === 'string' ? obj.sector : '',
    description: typeof obj.description === 'string' ? obj.description : '',
    mission: typeof obj.mission === 'string' ? obj.mission : '',
    differentials: (differentials as string[]).length > 0 ? (differentials as string[]) : [''],
  };
}

/** Normalize voice tone profile. */
export function normalizeVoiceToneProfile(value: unknown): VoiceToneProfile {
  const obj = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  return {
    style: typeof obj.style === 'string' ? obj.style : '',
    customInstructions: typeof obj.customInstructions === 'string' ? obj.customInstructions : '',
    useProfessional: obj.useProfessional !== false,
    useFriendly: obj.useFriendly === true,
    usePersuasive: obj.usePersuasive === true,
  };
}

/** Normalize faqs. */
export function normalizeFaqs(value: unknown): FaqItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry: unknown, index: number) => {
      const faq = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<
        string,
        unknown
      >;
      return {
        id: typeof faq.id === 'string' ? faq.id : `faq-${index + 1}`,
        question: typeof faq.question === 'string' ? faq.question : '',
        answer: typeof faq.answer === 'string' ? faq.answer : '',
      };
    })
    .filter((faq) => faq.question || faq.answer);
}

/** Normalize opening message. */
export function normalizeOpeningMessage(value: unknown): OpeningMessageProfile {
  const obj = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  return {
    message: typeof obj.message === 'string' ? obj.message : '',
    useEmojis: obj.useEmojis !== false,
    isFormal: obj.isFormal === true,
    isFriendly: obj.isFriendly !== false,
  };
}

/** Normalize emergency mode. */
export function normalizeEmergencyMode(value: unknown): EmergencyModeProfile {
  const obj = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  return {
    emergencyAction: typeof obj.emergencyAction === 'string' ? obj.emergencyAction : '',
    fixedMessage: typeof obj.fixedMessage === 'string' ? obj.fixedMessage : '',
  };
}

/** Ai tool data type. */
export type AiToolData = {
  sentiment?: string;
  score?: number;
  label?: string;
  summary?: string;
  suggestion?: string;
  pitch?: string;
};

/** Ai tool kind type. */
export type AiToolKind = 'analyzeSentiment' | 'summarize' | 'suggest' | 'pitch';

/** Invoke ai tool. */
export async function invokeAiTool(
  tool: AiToolKind,
  text: string,
  workspaceId: string,
): Promise<{ data?: AiToolData; error?: string }> {
  if (tool === 'analyzeSentiment') {
    const res = await aiAssistantApi.analyzeSentiment(text);
    return { data: res.data as AiToolData | undefined, error: res.error };
  }
  if (tool === 'summarize') {
    const res = await aiAssistantApi.summarize(text);
    return { data: res.data as AiToolData | undefined, error: res.error };
  }
  if (tool === 'suggest') {
    const res = await aiAssistantApi.suggest(workspaceId, text);
    return { data: res.data as AiToolData | undefined, error: res.error };
  }
  const res = await aiAssistantApi.pitch(workspaceId, text);
  return { data: res.data as AiToolData | undefined, error: res.error };
}

/** Format ai tool output. */
export function formatAiToolOutput(data: AiToolData | undefined): string {
  if (data?.sentiment) {
    return `${data.sentiment} (score: ${data.score ?? '\u2014'}, label: ${data.label ?? '\u2014'})`;
  }
  return data?.summary || data?.suggestion || data?.pitch || JSON.stringify(data, null, 2);
}
