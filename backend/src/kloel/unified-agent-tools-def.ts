import type { ChatCompletionTool } from 'openai/resources/chat';
import { UNIFIED_AGENT_TOOLS_CONTROL } from './unified-agent-tools-control';
import { UNIFIED_AGENT_TOOLS_MESSAGING } from './unified-agent-tools-messaging';
import { UNIFIED_AGENT_TOOLS_PRODUCT } from './unified-agent-tools-product';
import { UNIFIED_AGENT_TOOLS_SALES } from './unified-agent-tools-sales';

/**
 * All tool definitions for the Unified Agent.
 * Split across four files to keep each under 400 lines:
 *   - unified-agent-tools-sales.ts       (VENDAS, LEADS, AGENDAMENTO)
 *   - unified-agent-tools-messaging.ts   (COMUNICAÇÃO, ATENDIMENTO, RETENÇÃO, FLUXOS, ANALYTICS)
 *   - unified-agent-tools-product.ts     (GERENCIAMENTO AUTÔNOMO, MARKETING TOOLS)
 *   - unified-agent-tools-control.ts     (AUTOPILOT, WORKSPACE OPS, BILLING)
 */
export const UNIFIED_AGENT_TOOLS: ChatCompletionTool[] = [
  ...UNIFIED_AGENT_TOOLS_SALES,
  ...UNIFIED_AGENT_TOOLS_MESSAGING,
  ...UNIFIED_AGENT_TOOLS_PRODUCT,
  ...UNIFIED_AGENT_TOOLS_CONTROL,
];
