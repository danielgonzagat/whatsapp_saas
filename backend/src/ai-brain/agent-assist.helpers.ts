import type { ChatCompletionMessageParam } from 'openai/resources/chat';
import {
  estimateOpenAiChatQuoteCostCents,
  quoteOpenAiChatActualCostCents,
} from '../wallet/provider-llm-billing';
import { UnknownProviderPricingModelError } from '../wallet/provider-pricing';
import { WalletService } from '../wallet/wallet.service';
import {
  InsufficientWalletBalanceError,
  UsagePriceNotFoundError,
  WalletNotFoundError,
} from '../wallet/wallet.types';

/** Wallet access error raised when AI usage cannot be charged. */
export class AgentAssistWalletAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentAssistWalletAccessError';
  }
}

/** Discriminator for the AI assistant capabilities billed through the wallet. */
export type AssistantAction =
  | 'analyze_sentiment'
  | 'generate_pitch'
  | 'suggest_reply'
  | 'summarize_conversation';

/** Default user-facing message when the prepaid wallet cannot cover an AI call. */
export function insufficientWalletMessage(): string {
  return 'Saldo insuficiente na wallet prepaid para usar o assistente de IA. Recarregue via PIX ou aguarde a auto-recarga antes de tentar novamente.';
}

/** Coerce an unknown value into a non-empty string workspace id, or undefined. */
export function readWorkspaceId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** Estimate an OpenAI chat completion cost — returns undefined when pricing is unknown. */
export function estimateOpenAiQuote(model: string, messages: unknown): bigint | undefined {
  try {
    return estimateOpenAiChatQuoteCostCents({ model, messages });
  } catch (error: unknown) {
    if (error instanceof UnknownProviderPricingModelError) {
      return undefined;
    }
    throw error;
  }
}

interface ChargeAiUsageArgs {
  walletService: WalletService;
  workspaceId: string | undefined | null;
  requestId: string;
  assistantAction: AssistantAction;
  metadata: Record<string, unknown>;
  estimatedCostCents?: bigint;
}

/**
 * Reserve wallet funds for an AI assistant call. Returns whether a charge was actually
 * recorded — `false` means the catalog had no price for this operation, and `true`
 * means a hold was placed that must be settled or refunded later.
 */
export async function chargeAiUsageIfNeeded(args: ChargeAiUsageArgs): Promise<boolean> {
  const { walletService, workspaceId, requestId, assistantAction, metadata, estimatedCostCents } =
    args;
  if (!workspaceId) {
    return false;
  }

  try {
    await walletService.chargeForUsage({
      workspaceId,
      operation: 'ai_message',
      ...(estimatedCostCents !== undefined
        ? { quotedCostCents: estimatedCostCents }
        : { units: 1 }),
      requestId,
      metadata: {
        channel: 'ai_assistant',
        capability: assistantAction,
        ...metadata,
      },
    });
    return true;
  } catch (error: unknown) {
    return handleChargeError(error);
  }
}

function handleChargeError(error: unknown): boolean {
  if (error instanceof UsagePriceNotFoundError) {
    return false;
  }
  if (error instanceof InsufficientWalletBalanceError || error instanceof WalletNotFoundError) {
    throw new AgentAssistWalletAccessError(insufficientWalletMessage());
  }
  throw error;
}

interface SettleAiUsageArgs {
  walletService: WalletService;
  workspaceId: string | undefined | null;
  requestId: string;
  assistantAction: AssistantAction;
  model: string;
  usage: unknown;
}

/** Reconcile a prior wallet hold against the provider's reported actual usage. */
export async function settleAiUsageIfNeeded(args: SettleAiUsageArgs): Promise<void> {
  const { walletService, workspaceId, requestId, assistantAction, model, usage } = args;
  if (!workspaceId) {
    return;
  }
  try {
    await walletService.settleUsageCharge({
      workspaceId,
      operation: 'ai_message',
      requestId,
      actualCostCents: quoteOpenAiChatActualCostCents({
        model,
        usage: usage as {
          completion_tokens?: number | null;
          prompt_tokens?: number | null;
          prompt_tokens_details?: { cached_tokens?: number | null } | null;
        },
      }),
      reason: 'ai_assistant_provider_usage',
      metadata: {
        channel: 'ai_assistant',
        capability: assistantAction,
        model,
      },
    });
  } catch (error: unknown) {
    if (!(error instanceof UnknownProviderPricingModelError)) {
      throw error;
    }
  }
}

interface RefundAiUsageArgs {
  walletService: WalletService;
  workspaceId: string | undefined | null;
  requestId: string;
  assistantAction: AssistantAction;
  reason: string;
}

/** Refund a previously placed wallet hold when the AI provider call fails. */
export async function refundAiUsageIfNeeded(args: RefundAiUsageArgs): Promise<void> {
  const { walletService, workspaceId, requestId, assistantAction, reason } = args;
  if (!workspaceId) {
    return;
  }
  await walletService.refundUsageCharge({
    workspaceId,
    operation: 'ai_message',
    requestId,
    reason,
    metadata: {
      channel: 'ai_assistant',
      capability: assistantAction,
    },
  });
}

/**
 * Decide the sentiment label from the model's free-text answer.
 *
 * @param raw - Raw text produced by the model.
 * @returns A normalized `positive` | `negative` | `neutral` label.
 */
export function classifySentimentLabel(raw: string): 'negative' | 'neutral' | 'positive' {
  const lower = raw.toLowerCase();
  if (lower.includes('positivo')) {
    return 'positive';
  }
  if (lower.includes('negativo')) {
    return 'negative';
  }
  return 'neutral';
}

/** Build the prompt + system message used by `analyzeSentiment`. */
export function buildSentimentMessages(text: string): ChatCompletionMessageParam[] {
  return [
    {
      role: 'system',
      content: 'Classifique sentimento em positivo, neutro ou negativo.',
    },
    { role: 'user', content: text || '' },
  ];
}

/** Build the prompt used to summarize a conversation history string. */
export function buildSummaryMessages(history: string): ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: 'Resuma em 3 linhas, português.' },
    { role: 'user', content: history },
  ];
}

/** Build the prompt used to suggest a reply, optionally with a user-supplied prompt. */
export function buildSuggestReplyMessages(
  prompt: string | undefined,
  latest: string,
): ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: 'Responda curto e direto, tom humano.' },
    {
      role: 'user',
      content: prompt ? `${prompt}\nContexto: ${latest}` : latest,
    },
  ];
}

/** Build the prompt used by `generatePitch`. */
export function buildPitchMessages(base: string): ChatCompletionMessageParam[] {
  return [
    {
      role: 'system',
      content: 'Crie um pitch curto, persuasivo, português BR, CTA claro.',
    },
    { role: 'user', content: base },
  ];
}
