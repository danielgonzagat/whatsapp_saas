import { Injectable, Logger } from '@nestjs/common';
import type { IntentClassification } from '../capability-registry-v2/capability-registry-v2.types';
import { CapabilityRegistryV2Service } from '../capability-registry-v2/capability-registry-v2.service';

/**
 * Intent Router — deterministic pre-LLM classification layer.
 *
 * Every user message passes through this router BEFORE reaching the LLM.
 * The LLM never decides whether to call a tool. The router classifies the
 * intent, and if it matches a known capability, the ToolPlanner takes over.
 *
 * This implements Principle 2.1 of the Kloel Organism mission:
 * "Roteador determinístico antes do LLM."
 */
@Injectable()
export class IntentRouterService {
  private readonly logger = new Logger(IntentRouterService.name);

  // Pattern-based matchers for high-confidence intents
  private readonly PATTERNS: Array<{
    regex: RegExp;
    capabilityId: string;
    extract: (match: RegExpMatchArray) => Record<string, unknown>;
  }> = [
    // === Self-awareness ===
    {
      regex: /(?:o que|quais|liste|lista|mostre|que)\s.*(?:consegue|capaci|sabe|pode)\s.*(?:fazer?|operar?)/i,
      capabilityId: 'self.capabilities',
      extract: () => ({}),
    },
    {
      regex: /(?:sa[uú]de|health|status|funcionando|quebrad[ao])/i,
      capabilityId: 'self.health',
      extract: () => ({}),
    },
    {
      regex: /(?:gap|lacuna|falt[ae]|incompleto|ausente|nao funciona)/i,
      capabilityId: 'self.gaps',
      extract: () => ({}),
    },
    {
      regex: /(?:log|audit[oó]ria|a[cç][oõ]es?\s.*execut|o que vc fez|historico)/i,
      capabilityId: 'self.audit_log',
      extract: () => ({}),
    {
      regex: /lista(?:r|ndo)?\s+(?:meus\s+)?(?:produtos|ofertas|cat[aá]logo)/i,
      capabilityId: 'list_products',
      extract: () => ({}),
    },

    // === Products ===
    {
      regex: /(?:cri[ae]r?\s.*produt|cadastra\s.*produt|nov[oa]\s.*produt)/i,
      capabilityId: 'products.create',
      extract: (match) => ({
        name: match[0].match(/produto\s+["""']?([^""""'"]+)/i)?.[1] || undefined,
        price: parseFloat(match[0].match(/r?\$?\s*(\d+(?:[.,]\d+)?)/i)?.[1]?.replace(',', '.') ?? '') || undefined,
      }),
    },
    {
      regex: /(?:edit[ae]r?\s.*produt|alter[ae]r?\s.*produt|atualiz[ae]r?\s.*produt)/i,
      capabilityId: 'products.update',
      extract: () => ({}),
    },
    {
      regex: /(?:imagem|foto)\s.*(?:produto|subir|anex[ae]r?|coloc[ae]r?)/i,
      capabilityId: 'products.upload_image',
      extract: () => ({}),
    },
    {
      regex: /(?:ativ[ae]r?|desativ[ae]r?|public[ae]r?|dispon[ií]vel)\s.*(?:vend[ae]r?|produt)/i,
      capabilityId: 'products.update',
      extract: () => ({ active: true }),
    },

    // === Plans ===
    {
      regex: /(?:cri[ae]r?\s.*plan|nov[oa]\s.*plan|adicion[ae]r?\s.*plan)/i,
      capabilityId: 'plans.create',
      extract: () => ({}),
    },
    {
      regex: /(?:edit[ae]r?\s.*plan|alter[ae]r?\s.*plan)\s/i,
      capabilityId: 'plans.update',
      extract: () => ({}),
    },

    // === Checkouts ===
    {
      regex: /(?:cri[ae]r?\s.*checkout|nov[oa]\s.*checkout)/i,
      capabilityId: 'checkouts.create',
      extract: () => ({}),
    },
    {
      regex: /(?:edit[ae]r?\s.*checkout|alter[ae]r?\s.*checkou)/i,
      capabilityId: 'checkouts.update',
      extract: () => ({}),
    },

    // === Coupons ===
    {
      regex: /(?:cri[ae]r?\s.*cupom|cupom\s.*nov[oa]|cadastra\s.*cupom)/i,
      capabilityId: 'coupons.create',
      extract: () => ({}),
    },
    {
      regex: /(?:exclu[ui]r?\s.*cupom|remov[ae]r?\s.*cupom|delet[ae]r?\s.*cupom)/i,
      capabilityId: 'coupons.delete',
      extract: () => ({}),
    },

    // === Sales / PIX / Boleto ===
    {
      regex: /(?:emit[ei]r?\s.*pix|ger[ae]r?\s.*pix|cri[ae]r?\s.*pix)/i,
      capabilityId: 'sales.create_pix',
      extract: (match) => {
        const amount = parseFloat(match[0].match(/r?\$?\s*(\d+(?:[.,]\d+)?)/i)?.[1]?.replace(',', '.') ?? '') || undefined;
        return { amount: amount || undefined };
      },
    },
    {
      regex: /(?:emit[ei]r?\s.*bolet|ger[ae]r?\s.*bolet|cri[ae]r?\s.*bolet)/i,
      capabilityId: 'sales.create_boleto',
      extract: () => ({}),
    },
    {
      regex: /(?:consult[ae]r?\s.*vend[ae]|status\s.*vend[ae]|buscar?\s.*vend[ae]|mostr[ae]r?\s.*vend[ae])/i,
      capabilityId: 'sales.list',
      extract: () => ({}),
    },

    // === URLs ===
    {
      regex: /(?:adicion[ae]r?\s.*url|url\s.*nov[oa])/i,
      capabilityId: 'urls.add',
      extract: () => ({}),
    },

    // === Affiliates ===
    {
      regex: /(?:ativ[ae]r?\s.*afil|desativ[ae]r?\s.*afil|configur[ae]r?\s.*afil|programa\s.*afil)/i,
      capabilityId: 'affiliates.configure',
      extract: () => ({}),
    },

    // === Wallet ===
    {
      regex: /(?:saldo|carteir|meu\s.*saldo|quanto\s.*tenho)/i,
      capabilityId: 'wallet.balance',
      extract: () => ({}),
    },
    {
      regex: /(?:saqu[ei]|solicit[ae]r?\s.*saqu|ped[ei]r?\s.*saqu|sac[ae]r?)/i,
      capabilityId: 'wallet.withdraw',
      extract: () => ({}),
    },

    // === Reports ===
    {
      regex: /(?:relat[oó]rio\s.*opera[cç][ãa]o|opera[cç][õo]es)/i,
      capabilityId: 'reports.operations',
      extract: () => ({}),
    },
    {
      regex: /(?:abandon|carrinho abandon)/i,
      capabilityId: 'reports.abandonments',
      extract: () => ({}),
    },

    // === CRM ===
    {
      regex: /(?:pipeline|crm|stage|est[áa]gio)/i,
      capabilityId: 'crm.pipeline',
      extract: () => ({}),
    },

    // === Configuration ===
    {
      regex: /(?:tema\s.*(?:clar[oa]?|escur[oa]?)|(?:clar[oa]?|escur[oa]?)\s.*tema)/i,
      capabilityId: 'ui.theme',
      extract: (match) => ({
        theme: match[0].toLowerCase().includes('escuro') ? 'dark' : 'light',
      }),
    },
    {
      regex: /(?:dados?\s.*fisc|atualiz[ae]r?\s.*fisc|alter[ae]r?\s.*fisc|c?p[fjn]|cnpj)/i,
      capabilityId: 'account.update_fiscal',
      extract: () => ({}),
    },
    {
      regex: /(?:dados?\s.*banc[áa]ri|atualiz[ae]r?\s.*banc|alter[ae]r?\s.*banc|conta\s.*banc)/i,
      capabilityId: 'account.update_bank',
      extract: () => ({}),
    },
    {
      regex: /(?:chave\s.*pix|pix\s.*chave|cadastr[ae]r?\s.*pix)/i,
      capabilityId: 'account.set_pix_key',
      extract: () => ({}),
    },
    {
      regex: /(?:envi[ae]r?\s.*(?:doc|pdf|arquiv|contrat|identidad))|(?:document[oa]?\s.*fisc)/i,
      capabilityId: 'account.upload_document',
      extract: () => ({}),
    },
  ];

  constructor(
    private readonly registry: CapabilityRegistryV2Service,
  ) {}

  /**
   * Classify a user message into an intent.
   *
   * Three-stage classification:
   * 1. Pattern matching (regex/keywords) — highest confidence
   * 2. Registry-based keyword scoring — fallback
   * 3. Chat — no capability matched
   */
  classify(
    message: string,
    surface: string,
    permissions: string[],
  ): { classification?: IntentClassification; isChat: boolean } {
    const startTime = Date.now();
    const normalized = message.trim();

    if (!normalized) {
      return { isChat: true };
    }

    // Stage 1: Pattern matching
    for (const pattern of this.PATTERNS) {
      const match = normalized.match(pattern.regex);
      if (match) {
        const cap = this.registry.get(pattern.capabilityId);
        if (!cap) continue;

        const entities = pattern.extract(match);
        const missingInputs = cap.inputSchema
          .filter((f) => f.required && !entities[f.key])
          .map((f) => f.key);

        this.logger.debug(
          `Intent matched pattern: "${pattern.capabilityId}" in ${Date.now() - startTime}ms`,
        );

        return {
          classification: {
            intent: pattern.capabilityId,
            capabilityId: pattern.capabilityId,
            entities,
            confidence: 0.9,
            missingInputs,
            requiresConfirmation: cap.requiresConfirmation,
          },
          isChat: false,
        };
      }
    }

    // Stage 2: Registry-based classification
    const registryResult = this.registry.classifyIntent(normalized, surface, permissions);
    if (registryResult && registryResult.confidence >= 0.5) {
      return { classification: registryResult, isChat: false };
    }

    // Stage 3: Chat — no capability matched
    return { isChat: true };
  }
}