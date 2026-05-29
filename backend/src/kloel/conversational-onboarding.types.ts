import OpenAI from 'openai';
import { ONBOARDING_TOOLS } from './conversational-onboarding-tools-schema';

export const ONBOARDING_SAFE_SETUP_TOOL_NAMES = [
  'save_business_info',
  'save_contact_info',
  'add_product',
  'set_brand_voice',
  'set_business_hours',
  'set_main_goal',
] as const;

function isFunctionOnboardingTool(
  tool: OpenAI.ChatCompletionTool,
): tool is OpenAI.ChatCompletionTool & { type: 'function' } {
  return tool.type === 'function';
}

export const ONBOARDING_SAFE_SETUP_TOOLS = ONBOARDING_TOOLS.filter(
  (tool) =>
    isFunctionOnboardingTool(tool) &&
    ONBOARDING_SAFE_SETUP_TOOL_NAMES.some((name) => name === tool.function.name),
);

export interface OnboardingMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

/** Prisma extension with dynamic models not yet in generated types */
export interface PrismaWithDynamicModels {
  kloelMemory: {
    findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    findMany(args: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
  };
  autopilotEvent: {
    findMany(args: {
      where: { workspaceId: string; createdAt: { gte: Date } };
      orderBy: { createdAt: 'desc' };
      take: number;
      select: { id: true; intent: true; action: true; createdAt: true };
    }): Promise<
      Array<{ id: string; intent: string | null; action: string | null; createdAt: Date }>
    >;
  };
  $transaction: <T>(fn: (tx: PrismaWithDynamicModels) => Promise<T>) => Promise<T>;
}
