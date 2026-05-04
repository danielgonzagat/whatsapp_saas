import { Injectable, Logger } from '@nestjs/common';
import type { ChatCompletionMessageParam } from 'openai/resources/chat';
import { buildKloelLeadPrompt } from './kloel.prompts';
import { UnifiedAgentContextDataService } from './unified-agent-context-data.service';

type UnknownRecord = Record<string, unknown>;

const D__D_S_RE = /^\+?\d[\d\s()-]+$/;
const CONTATO_RE = /^contato$/i;
const PROBLEMA_ERRO_NAO_FUNCI_RE =
  /(problema|erro|nao funcion|não funcion|frustr|complicad|dificil|difícil|duvida|dúvida|medo|receio)/i;
const TRAILING_PUNCT_G_RE = /[!?.]+/g;

/**
 * Handles system prompt construction and lead tactical hints for the Unified Agent.
 * DB data loading is delegated to UnifiedAgentContextDataService.
 */
@Injectable()
export class UnifiedAgentContextService {
  private readonly logger = new Logger(UnifiedAgentContextService.name);

  constructor(private readonly contextData: UnifiedAgentContextDataService) {}

  // ───────── data delegation ─────────

  async getWorkspaceContext(workspaceId: string): Promise<UnknownRecord> {
    return this.contextData.getWorkspaceContext(workspaceId);
  }

  async getContactContext(workspaceId: string, contactId: string, phone: string) {
    return this.contextData.getContactContext(workspaceId, contactId, phone);
  }

  async getConversationHistory(
    workspaceId: string,
    contactId: string,
    limit: number,
    phone?: string,
  ): Promise<ChatCompletionMessageParam[]> {
    return this.contextData.getConversationHistory(workspaceId, contactId, limit, phone);
  }

  async buildAndPersistCompressedContext(
    workspaceId: string,
    contactId: string,
    phone: string,
    contact: unknown,
  ): Promise<string | undefined> {
    return this.contextData.buildAndPersistCompressedContext(
      workspaceId,
      contactId,
      phone,
      contact,
    );
  }

  async getProducts(workspaceId: string) {
    return this.contextData.getProducts(workspaceId);
  }

  // ───────── helpers ─────────

  isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  readRecord(value: unknown): UnknownRecord {
    return this.isRecord(value) ? value : {};
  }

  readText(value: unknown, fallback = ''): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
      return String(value);
    return fallback;
  }

  readOptionalText(value: unknown): string | undefined {
    const normalized = this.readText(value).trim();
    return normalized || undefined;
  }

  str(v: unknown, fb = ''): string {
    return typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : fb;
  }

  readTagList(value: unknown): string {
    if (!Array.isArray(value)) return 'nenhuma';
    const tags = value
      .map((tag) => {
        if (typeof tag === 'string') return tag.trim();
        if (this.isRecord(tag)) return this.readText(tag.name).trim();
        return '';
      })
      .filter((tag) => tag.length > 0);
    return tags.join(', ') || 'nenhuma';
  }

  // ───────── prompt construction ─────────

  buildSystemPrompt(
    workspace: UnknownRecord,
    products: UnknownRecord[],
    aiConfigs: UnknownRecord[] = [],
  ): string {
    const businessName = this.resolveBusinessDisplayName(workspace);
    const productList =
      products.length > 0
        ? products
            .map((p) => {
              const v = (p.value ?? {}) as UnknownRecord;
              return `- ${this.readText(v.name)}: R$ ${this.readText(v.price)}`;
            })
            .join('\n')
        : 'Nenhum produto cadastrado';

    const aiConfigContext: string[] = [];
    for (const cfg of aiConfigs) {
      const profile = (cfg.customerProfile ?? {}) as UnknownRecord;
      const objections = cfg.objections as UnknownRecord[];
      const salesArgs = (cfg.salesArguments ?? {}) as UnknownRecord;

      if (profile.idealCustomer)
        aiConfigContext.push(`PERFIL DO CLIENTE IDEAL: ${this.str(profile.idealCustomer)}`);
      if (profile.painPoints)
        aiConfigContext.push(`PRINCIPAIS DORES: ${this.str(profile.painPoints)}`);
      if (profile.promisedResult)
        aiConfigContext.push(`RESULTADO PROMETIDO: ${this.str(profile.promisedResult)}`);
      if (objections && Array.isArray(objections) && objections.length > 0) {
        aiConfigContext.push('OBJEÇÕES E RESPOSTAS:');
        for (const obj of objections) {
          if (obj.q && obj.a) {
            aiConfigContext.push(
              `  - Objeção: "${this.str(obj.q)}" → Resposta: "${this.str(obj.a)}"`,
            );
          }
        }
      }
      if (cfg.tone) {
        const toneKey = this.readText(cfg.tone);
        const toneMap: Record<string, string> = {
          Consultivo: 'Seja consultiva, educativa e focada em resolver problemas do cliente.',
          Agressivo: 'Seja direta, urgente e focada em fechar a venda rapidamente.',
          Amigavel: 'Seja calorosa, próxima e crie rapport antes de vender.',
          Urgente: 'Crie senso de urgência real baseado em fatos. Não invente escassez.',
        };
        aiConfigContext.push(`TOM DE VENDA: ${toneMap[toneKey] || toneKey}`);
      }
      if (cfg.persistenceLevel) {
        const pl = Number(cfg.persistenceLevel);
        aiConfigContext.push(
          `NÍVEL DE PERSISTÊNCIA: ${pl}/5 — ${pl >= 4 ? 'insista mais vezes antes de desistir' : pl <= 2 ? 'seja sutil e não force' : 'equilíbrio entre insistir e respeitar'}`,
        );
      }
      if (cfg.messageLimit) {
        aiConfigContext.push(
          `LIMITE DE MENSAGENS: máximo ${this.str(cfg.messageLimit)} mensagens antes de enviar link ou encerrar`,
        );
      }
      if (salesArgs.autoCheckoutLink)
        aiConfigContext.push(
          'REGRA: Envie o link de checkout automaticamente quando detectar intenção de compra.',
        );
      if (salesArgs.offerDiscount)
        aiConfigContext.push(
          'REGRA: Se detectar resistência de preço, ofereça desconto antes de perder o lead.',
        );
      if (salesArgs.useUrgency)
        aiConfigContext.push(
          'REGRA: Use urgência e escassez quando houver contexto real para isso.',
        );
      if (salesArgs.hideAiIdentity)
        aiConfigContext.push(
          'REGRA CRÍTICA: NUNCA revele, confirme ou negue ser uma inteligência artificial, chatbot ou assistente virtual. ' +
            'Se perguntarem se você é um robô/IA, desvie naturalmente para o atendimento sem confirmar ou negar. ' +
            'Aja como uma atendente humana da empresa.',
        );
      if (salesArgs.maxDiscountPercent != null) {
        const maxDiscount = Number(salesArgs.maxDiscountPercent);
        if (maxDiscount >= 0) {
          aiConfigContext.push(
            `REGRA: Nunca ofereça mais de ${maxDiscount}% de desconto. Se o cliente pressionar por mais, mantenha firme e destaque o valor do produto em vez de ceder.`,
          );
        }
      }
    }

    const aiConfigBlock =
      aiConfigContext.length > 0
        ? `\n\nCONFIGURAÇÃO DO VENDEDOR (use como base para toda interação):\n${aiConfigContext.join('\n')}`
        : '';

    return buildKloelLeadPrompt({
      companyName: businessName,
      brandVoice:
        this.readText(workspace.brandVoice, 'Direto, humano e focado em conversão') + aiConfigBlock,
      productList,
      extraContext: [
        'DIRETRIZES OPERACIONAIS:',
        '1. Foque em vender e converter sem soar como script.',
        '2. Use as ferramentas disponíveis para executar ações.',
        '3. Seja proativa só quando houver contexto claro; nunca dispare mensagem fria.',
        '4. Personalize baseado no histórico e status do lead.',
        '5. Se detectar objeção, trate imediatamente.',
        '6. Se cliente sumiu, use reativação.',
        '7. Sempre atualize o status do lead.',
        '8. Agende follow-ups para não perder oportunidades.',
        '9. Use o nome do lead quando ele estiver disponível. Se o nome veio do WhatsApp mas ainda não foi confirmado na conversa, confirme de forma curta e natural.',
        '10. Se o lead responder só "sim", "quero", "pode", "isso" ou outro aceite curto, entregue valor concreto imediatamente. Nunca responda com frase vazia, elogio genérico ou enrolação.',
        '11. Toda resposta deve cumprir pelo menos um papel claro: entregar informação concreta, qualificar dor/objetivo, reduzir objeção ou avançar o próximo passo.',
        '12. Não entre em loop de saudação, confirmação vaga ou perguntas genéricas repetidas.',
        '13. Em produto, priorize benefício prático, diferencial, composição/uso se souber, e uma pergunta curta de qualificação.',
        '14. Se não tiver dado suficiente para preço ou detalhe técnico, diga só o que é seguro e faça uma pergunta objetiva para avançar.',
        '15. Fale como uma vendedora humana experiente: empática, bem-humorada com dosagem, segura, consultiva e focada em conversão.',
        '16. Valide emoção antes de empurrar informação quando o lead demonstrar frustração, ansiedade ou confusão.',
        '17. Prefira perguntas abertas nas etapas frias e mornas; simplifique o próximo passo nas etapas quentes.',
        '18. Não use frases panfletárias como "condição especial", "oportunidade única" ou equivalentes.',
        '19. Se o cliente perguntar se está falando com IA, responda com transparência curta: assistente virtual da empresa.',
        '20. Considere o histórico integral da conversa como fonte primária de raciocínio.',
        '21. Nunca repita pergunta, dado, assunto, história ou oferta já presentes no histórico.',
        '22. Se o cliente já informou algo, use a informação em vez de perguntar de novo.',
      ].join('\n'),
    });
  }

  buildLeadTacticalHint(params: {
    leadName?: string | null;
    currentMessage: string;
    conversationHistory: ChatCompletionMessageParam[];
  }): string {
    const hints: string[] = [];
    const lastAssistantMessage = [...(params.conversationHistory || [])]
      .reverse()
      .find((entry) => entry.role === 'assistant');

    if (this.isUsableLeadName(params.leadName)) {
      const historyText = (params.conversationHistory || [])
        .map((entry) => (typeof entry?.content === 'string' ? entry.content : ''))
        .join(' ')
        .toLowerCase();
      const normalizedLeadName = String(params.leadName).trim().toLowerCase();
      const nameAlreadyMentioned =
        normalizedLeadName.length >= 2 && historyText.includes(normalizedLeadName);

      hints.push(
        `O nome visível do lead é "${String(params.leadName).trim()}". Use esse nome com naturalidade e, se ainda não foi confirmado na conversa, confirme o nome preferido rapidamente.`,
      );

      if (!nameAlreadyMentioned) {
        hints.push(
          `Antes de aprofundar a venda, confirme o nome em uma linha natural. Exemplo aceitável: "Posso salvar seu contato como ${String(params.leadName).trim()}?"`,
        );
      }
    }

    if (this.isShortAffirmativeMessage(params.currentMessage)) {
      hints.push(
        'O lead respondeu com um aceite curto. Agora você precisa entregar valor concreto e avançar uma etapa. Não responda com elogio vazio nem com frase genérica.',
      );
      hints.push(
        'Quando o lead disser só "sim", "quero" ou equivalente, entregue conteúdo específico imediatamente: benefício real, composição/uso se houver, diferencial ou próximo passo objetivo. Nunca responda só com "ótima escolha", "saúde e bem-estar" ou frases vazias.',
      );
    }

    if (PROBLEMA_ERRO_NAO_FUNCI_RE.test(params.currentMessage)) {
      hints.push(
        'O lead demonstrou atrito emocional. Antes de avançar, valide em uma frase curta o que ele sentiu e só depois conduza.',
      );
    }

    if (lastAssistantMessage?.content) {
      const lastAssistantContent = this.readText(lastAssistantMessage.content).slice(0, 240);
      hints.push(
        `Sua última mensagem para o lead foi: "${lastAssistantContent}". Responda de forma coerente com isso e continue a progressão da conversa sem repetir saudação.`,
      );
    }

    hints.push(
      'Se estiver nos primeiros turnos, descubra dor, objetivo ou contexto de compra com uma pergunta curta e útil.',
    );

    return hints.join(' ');
  }

  private isShortAffirmativeMessage(message: string): boolean {
    const normalized = String(message || '')
      .trim()
      .toLowerCase()
      .replace(TRAILING_PUNCT_G_RE, '');
    return [
      'sim',
      'quero',
      'isso',
      'isso mesmo',
      'pode',
      'pode sim',
      'claro',
      'ok',
      'opa',
      'yes',
      'uhum',
    ].includes(normalized);
  }

  private isUsableLeadName(name?: string | null): boolean {
    const normalized = String(name || '').trim();
    if (!normalized) return false;
    if (D__D_S_RE.test(normalized)) return false;
    if (CONTATO_RE.test(normalized)) return false;
    return true;
  }

  resolveBusinessDisplayName(workspace: UnknownRecord): string {
    const settings = this.readRecord(workspace?.providerSettings);
    const waSession = this.readRecord(settings.whatsappApiSession);
    const candidates = [
      settings.businessName,
      settings.brandName,
      settings.companyName,
      settings.whatsappBusinessName,
      waSession.pushName,
      workspace?.name,
    ];

    for (const candidate of candidates) {
      const label = this.str(candidate).trim();
      if (!label || this.isGenericWorkspaceLabel(label)) continue;
      return label;
    }

    return 'sua empresa';
  }

  private isGenericWorkspaceLabel(label?: string | null): boolean {
    const normalized = String(label || '')
      .trim()
      .toLowerCase();
    return (
      !normalized ||
      normalized === 'guest workspace' ||
      normalized === 'workspace' ||
      normalized === 'guest' ||
      normalized === 'cliente kloel'
    );
  }

  /** Log a warning without throwing. */
  warnLogger(message: string): void {
    this.logger.warn(message);
  }
}
