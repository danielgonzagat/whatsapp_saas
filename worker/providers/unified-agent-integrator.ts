/**
 * Unified Agent Integrator para o Worker
 * 
 * Permite que o worker use o UnifiedAgentService do backend
 * para decisões avançadas com tool calling.
 */

import { WorkerLogger } from "../logger";

const log = new WorkerLogger("unified-agent-integrator");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";

interface UnifiedAgentResult {
  response: string;
  actions: Array<{
    tool: string;
    args: Record<string, any>;
    result?: any;
  }>;
  model: string;
}

/**
 * Chama o UnifiedAgentService do backend para processar mensagem.
 * Usado para decisões complexas que requerem tool calling.
 */
export async function processWithUnifiedAgent(params: {
  workspaceId: string;
  contactId?: string;
  phone: string;
  message: string;
  context?: Record<string, any>;
}): Promise<UnifiedAgentResult | null> {
  const { workspaceId, contactId, phone, message, context } = params;

  try {
    const url = `${BACKEND_URL}/kloel/agent/${workspaceId}/process`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(INTERNAL_API_KEY ? { "X-Internal-Key": INTERNAL_API_KEY } : {}),
      },
      body: JSON.stringify({
        contactId,
        phone,
        message,
        context,
      }),
    });

    if (!response.ok) {
      log.warn("unified_agent_request_failed", {
        status: response.status,
        workspaceId,
      });
      return null;
    }

    const data = await response.json();
    
    log.info("unified_agent_response", {
      workspaceId,
      actionsCount: data.actions?.length || 0,
      model: data.model,
    });

    return {
      response: data.response,
      actions: data.actions || [],
      model: data.model,
    };
  } catch (err: any) {
    log.error("unified_agent_error", {
      error: err.message,
      workspaceId,
    });
    return null;
  }
}

/**
 * Determina se a mensagem deve usar o UnifiedAgent ao invés do Autopilot básico.
 * Critérios:
 * - Mensagens complexas (múltiplas sentenças)
 * - Perguntas sobre produtos específicos
 * - Negociações
 * - Quando o contato tem alto lead score
 */
export function shouldUseUnifiedAgent(params: {
  messageContent: string;
  leadScore?: number;
  settings?: any;
}): boolean {
  const { messageContent, leadScore, settings } = params;
  
  // Se explicitamente desabilitado
  if (settings?.autopilot?.useUnifiedAgent === false) {
    return false;
  }

  // Se explicitamente habilitado
  if (settings?.autopilot?.useUnifiedAgent === true) {
    return true;
  }

  // Leads quentes sempre usam o agente unificado
  if (leadScore && leadScore >= 70) {
    return true;
  }

  const text = messageContent.toLowerCase();
  
  // Mensagens mais longas/complexas
  if (messageContent.length > 200) {
    return true;
  }
  
  // Múltiplas perguntas
  const questionCount = (messageContent.match(/\?/g) || []).length;
  if (questionCount >= 2) {
    return true;
  }

  // Sinais de negociação
  const negotiationKeywords = [
    "desconto", "promoção", "parcelar", "parcela",
    "negociar", "melhor preço", "consigo menos",
    "tá caro", "está caro", "caro demais",
    "se eu pagar", "à vista", "a vista",
  ];
  if (negotiationKeywords.some(k => text.includes(k))) {
    return true;
  }

  // Perguntas sobre produto específico
  const productKeywords = [
    "como funciona", "quanto tempo", "garantia",
    "entrega", "prazo", "inclui", "diferença entre",
    "qual a diferença", "comparar",
  ];
  if (productKeywords.some(k => text.includes(k))) {
    return true;
  }

  return false;
}

/**
 * Mapeia ações do UnifiedAgent para ações do Autopilot legado.
 * Isso permite compatibilidade com o executeAction existente.
 */
export function mapUnifiedActionsToAutopilot(
  actions: UnifiedAgentResult["actions"]
): {
  intent: string;
  action: string;
  reason: string;
  confidence: number;
  alreadyExecuted: boolean;
} {
  if (!actions || actions.length === 0) {
    return {
      intent: "IDLE",
      action: "NONE",
      reason: "no_actions_from_unified_agent",
      confidence: 0.5,
      alreadyExecuted: false,
    };
  }

  // O primeiro tool geralmente indica a intenção principal
  const primaryAction = actions[0];
  const tool = primaryAction.tool;

  // Mapear tools para intents do Autopilot legado
  const toolToIntent: Record<string, string> = {
    send_product_info: "BUYING",
    create_payment_link: "BUYING",
    apply_discount: "BUYING",
    handle_objection: "OBJECTION",
    qualify_lead: "FOLLOW_UP",
    update_lead_status: "FOLLOW_UP",
    add_tag: "FOLLOW_UP",
    schedule_meeting: "SCHEDULING",
    schedule_followup: "FOLLOW_UP",
    send_message: "FOLLOW_UP",
    send_media: "FOLLOW_UP",
    send_voice_note: "FOLLOW_UP",
    transfer_to_human: "SUPPORT",
    search_knowledge_base: "SUPPORT",
    anti_churn_action: "CHURN_RISK",
    reactivate_ghost: "FOLLOW_UP",
    trigger_flow: "FOLLOW_UP",
    log_event: "IDLE",
  };

  // Mapear tools para actions do Autopilot legado
  const toolToAction: Record<string, string> = {
    send_product_info: "SEND_OFFER",
    create_payment_link: "SEND_OFFER",
    apply_discount: "SEND_OFFER",
    handle_objection: "HANDLE_OBJECTION",
    qualify_lead: "QUALIFY",
    update_lead_status: "FOLLOW_UP",
    add_tag: "FOLLOW_UP",
    schedule_meeting: "SEND_CALENDAR",
    schedule_followup: "FOLLOW_UP",
    send_message: "FOLLOW_UP",
    send_media: "SEND_OFFER",
    send_voice_note: "FOLLOW_UP",
    transfer_to_human: "TRANSFER_AGENT",
    search_knowledge_base: "FOLLOW_UP",
    anti_churn_action: "ANTI_CHURN",
    reactivate_ghost: "GHOST_CLOSER",
    trigger_flow: "FOLLOW_UP",
    log_event: "NONE",
  };

  return {
    intent: toolToIntent[tool] || "FOLLOW_UP",
    action: toolToAction[tool] || "FOLLOW_UP",
    reason: `unified_agent:${tool}`,
    confidence: 0.9, // Alta confiança quando o agente unificado decide
    alreadyExecuted: true, // O UnifiedAgent já executou a ação
  };
}

/**
 * Extrai a resposta de texto das ações do UnifiedAgent.
 */
export function extractTextResponse(result: UnifiedAgentResult): string {
  // Se tem resposta direta, usa ela
  if (result.response) {
    return result.response;
  }

  // Se tem ação send_message, extrai o texto
  const sendMessage = result.actions.find(a => a.tool === "send_message");
  if (sendMessage?.args?.message) {
    return sendMessage.args.message;
  }

  return "";
}
