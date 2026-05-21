import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import type { ChatCompletionMessageParam } from 'openai/resources/chat';
import { CANONICAL_FALLBACK_SYSTEM_PROMPT } from './kloel.prompts';
import { UnifiedAgentContextDataService } from './unified-agent-context-data.service';

import type { UnknownRecord } from '../common/types';

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
  private readonly logger = StructuredLogger.from(UnifiedAgentContextService.name);

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
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
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
    if (!Array.isArray(value)) {
      return 'nenhuma';
    }
    const tags = value
      .map((tag) => {
        if (typeof tag === 'string') {
          return tag.trim();
        }
        if (this.isRecord(tag)) {
          return this.readText(tag.name).trim();
        }
        return '';
      })
      .filter((tag) => tag.length > 0);
    return tags.join(', ') || 'nenhuma';
  }

  // ───────── prompt construction ─────────

  /**
   * @deprecated UTP-ABI-009 — The full system prompt is now assembled via the
   * ABI-sourced prompt path (ABI-005 through ABI-008). This method is retained
   * solely as a signature-preserving fallback. It unconditionally returns the
   * canonical cognitive-fallback constant.
   *
   * @see {@link ./kloel.prompts.CANONICAL_FALLBACK_SYSTEM_PROMPT}
   */
  buildSystemPrompt(
    _workspace: UnknownRecord,
    _products: UnknownRecord[],
    _aiConfigs: UnknownRecord[] = [],
  ): string {
    return CANONICAL_FALLBACK_SYSTEM_PROMPT;
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
    if (!normalized) {
      return false;
    }
    if (D__D_S_RE.test(normalized)) {
      return false;
    }
    if (CONTATO_RE.test(normalized)) {
      return false;
    }
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
      if (!label || this.isGenericWorkspaceLabel(label)) {
        continue;
      }
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
