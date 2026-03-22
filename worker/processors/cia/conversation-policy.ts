import type {
  CognitiveActionType,
  CustomerCognitiveState,
  CustomerStage,
} from "./cognitive-state";

export type ActiveListeningSignals = {
  emotionalTone:
    | "positive"
    | "negative"
    | "neutral"
    | "frustrated"
    | "excited"
    | "anxious"
    | "confused";
  validationNeeded: boolean;
  personalDetailShared: boolean;
  complaintDetected: boolean;
  deepeningQuestion: string | null;
  openLoopOpportunity: string | null;
  inferredNeed: string | null;
};

function normalizeText(value?: string | null): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function inferEmotionalTone(text: string): ActiveListeningSignals["emotionalTone"] {
  if (/(ansios|insegur|medo|receio|duvida|duvida)/i.test(text)) {
    return "anxious";
  }
  if (/(frustr|cansad|irrit|raiva|sac|complicad|dif[íi]cil|problema|erro)/i.test(text)) {
    return "frustrated";
  }
  if (/(amei|perfeito|animad|gostei|legal|excelente|top)/i.test(text)) {
    return "excited";
  }
  if (/(nao entendi|n[aã]o entendi|confuso|como assim|explica)/i.test(text)) {
    return "confused";
  }
  if (/(obrigad|valeu|ótimo|otimo)/i.test(text)) {
    return "positive";
  }
  if (/(nao|n[aã]o|ruim|caro|demora|medo)/i.test(text)) {
    return "negative";
  }
  return "neutral";
}

function buildStageDirective(
  stage: CustomerStage,
  trust: number,
  urgency: number,
): string {
  switch (stage) {
    case "COLD":
      return `ESTAGIO: FRIO
- O objetivo e acolher e entender a dor real.
- Nao ofereca produto cedo demais.
- Use uma pergunta aberta curta e inteligente para descobrir contexto.`;
    case "WARM":
      return `ESTAGIO: AQUECIDO
- Aprofunde dor, objetivo e restricoes.
- Conecte o que a pessoa sente com um proximo passo claro.
- Se usar prova social, faca isso de forma casual.`;
    case "HOT":
      return `ESTAGIO: QUENTE
- A pessoa ja mostrou intencao.
- Valide a decisao e reduza atrito.
- Confianca: ${Math.round(trust * 100)}% | Urgencia: ${Math.round(urgency * 100)}%`;
    case "CHECKOUT":
      return `ESTAGIO: CHECKOUT
- Remova friccao e simplifique pagamento.
- Nao pressione.
- Foque em clareza, seguranca e proximo passo unico.`;
    case "POST_SALE":
      return `ESTAGIO: POS-VENDA
- O foco e suporte, resultado e oportunidade de recompra sem forcar.`;
    case "SUPPORT":
      return `ESTAGIO: SUPORTE
- Valide a frustracao antes de orientar.
- Nao tente vender antes de resolver ou encaminhar.`;
    default:
      return `ESTAGIO: INDEFINIDO
- Descubra contexto com uma pergunta aberta e curta.`;
  }
}

function buildPersuasionDirective(
  state?: CustomerCognitiveState | null,
): string {
  if (!state) {
    return `PERSUASAO:
- Entregue valor antes de pedir algo.
- Priorize clareza, empatia e um proximo passo simples.`;
  }

  const directives: string[] = [
    "- RECIPROCIDADE: entregue um insight util antes de empurrar a conversa.",
    "- AFINIDADE: espelhe o estilo do contato sem soar artificial.",
    "- UNIDADE: quando fizer sentido, enquadre a situacao como algo comum ao perfil do contato.",
  ];

  if (state.objections.includes("trust") || state.trustScore < 0.6) {
    directives.push(
      "- PROVA SOCIAL: mencione com naturalidade um caso parecido, sem formato de depoimento.",
    );
  }

  if (state.objections.includes("price")) {
    directives.push(
      "- VALOR: responda preco em contexto de resultado e reducao de risco, nao com discurso duro.",
    );
  }

  if (state.stage === "HOT" || state.stage === "CHECKOUT") {
    directives.push(
      "- COMPROMISSO: proponha um proximo passo unico e facil, sem duas perguntas na mesma mensagem.",
    );
  }

  return `PERSUASAO:\n${directives.join("\n")}`;
}

function buildActionDirective(
  action?: CognitiveActionType | string | null,
  tactic?: string | null,
): string {
  const byAction: Record<string, string> = {
    RESPOND:
      "Responda primeiro o que o cliente quis dizer e depois conduza com uma unica pergunta ou proximo passo.",
    ASK_CLARIFYING:
      "Qualifique melhor a necessidade com uma pergunta aberta e humana.",
    SOCIAL_PROOF:
      "Reduza inseguranca com clareza e prova social sutil.",
    OFFER:
      "Conecte a solucao ao que o cliente valorizou e simplifique o avanco.",
    FOLLOWUP_SOFT:
      "Retome de forma leve, sem cobrar ausencia, adicionando contexto util.",
    FOLLOWUP_URGENT:
      "Traga relevancia temporal sem pressao e simplifique a retomada.",
    PAYMENT_RECOVERY:
      "Remova atrito do pagamento com tom calmo, seguro e pratico.",
    WAIT:
      "Nao force oferta. Se responder, seja minima, util e sem pressa.",
    ESCALATE_HUMAN:
      "Oriente transicao para humano com acolhimento e seguranca.",
  };

  const base =
    byAction[String(action || "").trim()] ||
    "Responda de forma humana, util e progressiva.";

  if (!tactic) {
    return base;
  }

  const tacticHint: Record<string, string> = {
    EMPATHETIC_ECHO: "Valide explicitamente a emocao antes de conduzir.",
    PAIN_PROBING: "Aprofunde a dor ou restricao com uma pergunta aberta.",
    EPIPHANY_DROP: "Entregue um insight curto que mude a perspectiva do contato.",
    STORYTELLING_HOOK: "Use uma micro-historia ou analogia curta para criar conexao.",
    QUALIFY_PRIORITY: "Descubra o que e prioridade real agora.",
    QUALIFY_NEED: "Descubra a necessidade principal antes de ofertar.",
    PRICE_VALUE_REFRAME: "Contextualize valor antes de falar em custo isolado.",
    TRUST_REASSURANCE: "Passe seguranca com clareza e tom calmo.",
    SOCIAL_PROOF: "Use um caso parecido de forma natural.",
    DIRECT_OFFER_CLOSE: "Se o contato estiver pronto, seja direta e simples.",
    CHECKOUT_SIMPLIFICATION: "Reduza friccao do proximo passo.",
    PAYMENT_RESOLUTION: "Resolva o pagamento de forma objetiva.",
    FOLLOWUP_NUDGE: "Retome sem parecer robo.",
    SAFE_URGENCY: "Use urgencia contextualizada e limpa.",
  };

  return `${base}\nTATICA: ${tacticHint[tactic] || tactic}`;
}

export function analyzeForActiveListening(
  messageContent: string,
  contactName?: string | null,
): ActiveListeningSignals {
  const text = String(messageContent || "");
  const normalized = normalizeText(text);
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const emotionalTone = inferEmotionalTone(normalized);

  const personalDetailShared =
    /\b(meu|minha|meus|minhas|trabalho|empresa|rotina|familia|cliente)\b/i.test(
      normalized,
    ) && wordCount >= 8;
  const complaintDetected =
    /(problema|erro|reclama|nao funciona|nao resolveu|demora|frustr)/i.test(
      normalized,
    );
  const validationNeeded =
    complaintDetected ||
    wordCount > 18 ||
    emotionalTone === "frustrated" ||
    emotionalTone === "anxious" ||
    emotionalTone === "confused";

  const inferredNeed =
    /(preco|valor|parcela)/i.test(normalized)
      ? "seguranca sobre investimento"
      : /(prazo|urgente|hoje|agora)/i.test(normalized)
        ? "agilidade"
        : /(funciona|garantia|resultado)/i.test(normalized)
          ? "confianca"
          : personalDetailShared
            ? "ser compreendido"
            : null;

  const deepeningQuestion =
    emotionalTone === "frustrated"
      ? "O que mais te trava nisso hoje?"
      : emotionalTone === "anxious"
        ? "Qual parte te deixa mais inseguro agora?"
        : inferredNeed === "agilidade"
          ? "O que voce precisa resolver primeiro?"
          : personalDetailShared
            ? "Quando isso acontece, o que pesa mais no seu dia a dia?"
            : null;

  const openLoopOpportunity =
    /(resultado|funciona|preco|valor|prazo)/i.test(normalized)
      ? "Tem um detalhe nisso que costuma mudar a decisao."
      : contactName
        ? `${String(contactName).trim().split(/\s+/)[0]}, tem um ponto aqui que quase sempre passa despercebido.`
        : "Tem um ponto aqui que quase sempre passa despercebido.";

  return {
    emotionalTone,
    validationNeeded,
    personalDetailShared,
    complaintDetected,
    deepeningQuestion,
    openLoopOpportunity,
    inferredNeed,
  };
}

export function buildWhatsAppConversationPrompt(params: {
  workspaceName: string;
  contactName?: string | null;
  compressedContext?: string | null;
  productSummary?: string | null;
  matchedProducts?: string[];
  cognitiveState?: CustomerCognitiveState | null;
  listeningSignals?: ActiveListeningSignals | null;
  deliveryMode?: string;
  action?: CognitiveActionType | string | null;
  tactic?: string | null;
}): string {
  const state = params.cognitiveState;
  const listening = params.listeningSignals;
  const stage = state?.stage || "COLD";
  const trust = Number(state?.trustScore || 0.45);
  const urgency = Number(state?.urgencyScore || 0.2);
  const live = params.deliveryMode === "reactive";
  const matchedProducts = params.matchedProducts?.length
    ? params.matchedProducts.join(", ")
    : "nenhum";

  return [
    `Voce responde no WhatsApp da ${params.workspaceName}.`,
    `Voce esta falando com ${params.contactName || "o contato"}.`,
    "",
    "IDENTIDADE:",
    "- Soe humana, segura, viva e consultiva.",
    "- Nao finja ser humana. Se perguntarem diretamente, diga com naturalidade que voce e a assistente virtual da empresa.",
    "- Nao use emoji por padrao e nao escreva como template.",
    "",
    "COMO RESPONDER:",
    "- Responda primeiro o que o contato quis dizer.",
    "- Valide a emocao antes de empurrar informacao quando houver frustracao, ansiedade ou confusao.",
    "- Use uma unica pergunta por mensagem quando estiver conduzindo.",
    "- Se a mensagem dele foi curta, seja curta. Se foi rica, aprofunde sem virar bloco burocratico.",
    "- Toda resposta deve ter valor concreto, contexto humano ou proximo passo claro.",
    "",
    buildStageDirective(stage, trust, urgency),
    "",
    buildPersuasionDirective(state),
    "",
    `DIRETIVA DE ACAO:\n${buildActionDirective(params.action, params.tactic)}`,
    "",
    "SINAIS DA CONVERSA:",
    `- Tom emocional: ${listening?.emotionalTone || "neutral"}`,
    `- Precisa validacao: ${listening?.validationNeeded ? "sim" : "nao"}`,
    `- Necessidade inferida: ${listening?.inferredNeed || "nao identificada"}`,
    `- Contexto pessoal compartilhado: ${listening?.personalDetailShared ? "sim" : "nao"}`,
    "",
    "CONTEXTO DO CONTATO:",
    params.compressedContext || "Sem resumo persistido.",
    "",
    "PRODUTOS DISPONIVEIS:",
    params.productSummary || "Nenhum produto cadastrado.",
    "",
    `PRODUTOS MAIS RELEVANTES NESTA CONVERSA: ${matchedProducts}`,
    "",
    live
      ? "A conversa esta ao vivo. Responda acompanhando o ritmo do contato."
      : "Esta e uma retomada ou resposta estrategica. Soe natural, sem cobrar ausencia.",
  ].join("\n");
}

export function detectAndFixAntiPatterns(reply?: string | null): string {
  let fixed = String(reply || "")
    .replace(/\s+/g, " ")
    .trim();

  fixed = fixed.replace(/^(oi|ol[aá]|e ai|opa)[!,.]?\s*/i, "");
  fixed = fixed.replace(
    /\b(condi[cç][aã]o especial|oportunidade [uú]nica|imperd[ií]vel)\b/gi,
    "algo que faz sentido pra sua situacao",
  );
  fixed = fixed.replace(
    /(?:qualquer d[uú]vida|fico [aà] disposi[cç][aã]o|estou [aà] disposi[cç][aã]o).*$/i,
    "",
  );

  const questions = fixed.match(/\?/g) || [];
  if (questions.length > 1) {
    const firstQuestionIndex = fixed.indexOf("?");
    if (firstQuestionIndex >= 0) {
      const before = fixed.slice(0, firstQuestionIndex + 1);
      const after = fixed
        .slice(firstQuestionIndex + 1)
        .replace(/\?/g, ".")
        .replace(/\s+/g, " ")
        .trim();
      fixed = `${before}${after ? ` ${after}` : ""}`.trim();
    }
  }

  return fixed.trim();
}
