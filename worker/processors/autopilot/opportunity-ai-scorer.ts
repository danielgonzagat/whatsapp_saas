import { AIProvider } from '../../providers/ai-provider';
import { log, extractFirstJsonObject, scoreToProbabilityBucket } from './autopilot-utils';
import { type UnknownRecord } from './autopilot-types';

export async function maybeScoreContactWithAi(input: {
  contactName?: string | null;
  phone?: string | null;
  history: string;
  wonDealTitle?: string | null;
  wonDealValue?: number | null;
}): Promise<{
  leadScore: number;
  purchaseProbability: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  purchaseProbabilityScore: number;
  sentiment: string;
  intent: string;
  summary: string;
  nextBestAction: string;
  reasons: string[];
  buyerStatus: 'BOUGHT' | 'NOT_BOUGHT' | 'UNKNOWN';
  purchasedProduct: string | null;
  purchaseValue: number | null;
  purchaseReason: string | null;
  notPurchasedReason: string | null;
  preferences: string[];
  importantDetails: string[];
  purchaseProbabilityPercent: number;
  demographics: {
    gender: string;
    ageRange: string;
    location: string;
    confidence: number;
  };
} | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    const ai = new AIProvider(process.env.OPENAI_API_KEY);
    const response = await ai.generateChatResponse(
      [
        {
          role: 'system',
          content: 'Você é um analista comercial. Responda apenas JSON válido.',
        },
        {
          role: 'user',
          content: [
            `Contato: ${input.contactName || input.phone || 'sem_nome'}`,
            `Negócio ganho conhecido: ${input.wonDealTitle || 'nenhum'}`,
            `Valor já registrado: ${input.wonDealValue || 0}`,
            'Analise a transcrição abaixo e retorne JSON com:',
            'buyerStatus ("BOUGHT" | "NOT_BOUGHT" | "UNKNOWN")',
            'purchasedProduct (string ou null)',
            'purchaseValue (número ou null)',
            'purchaseReason (string curta ou null)',
            'notPurchasedReason (string curta ou null)',
            'leadScore (0-100 inteiro)',
            'purchaseProbability ("LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH")',
            'purchaseProbabilityScore (0-1 número)',
            'purchaseProbabilityPercent (0-100 inteiro, inclusive para recompra de quem já comprou)',
            'sentiment ("POSITIVE" | "NEUTRAL" | "NEGATIVE")',
            'intent ("BUY" | "INFO" | "SUPPORT" | "COMPLAINT" | "COLD")',
            'summary (resumo completo e objetivo, com nome, contexto, interesse, objeções, preferências e próximos passos)',
            'nextBestAction (string curta)',
            'reasons (array de justificativas curtas)',
            'preferences (array de preferências ou interesses)',
            'importantDetails (array de fatos relevantes do lead)',
            'gender (string: masculino, feminino ou unknown)',
            'ageRange (string curta como 18-24, 25-34, 35-44 ou UNKNOWN)',
            'location (string curta ou UNKNOWN)',
            'demographicsConfidence (0-1 número)',
            '',
            'Transcrição:',
            input.history,
          ].join('\n'),
        },
      ],
      'brain',
    );

    const parsed = extractFirstJsonObject(String(response?.content || ''));
    if (!parsed) {
      return null;
    }

    const leadScore = Math.max(
      0,
      Math.min(100, Math.round(Number(parsed.leadScore || parsed.score || 0) || 0)),
    );
    const bucketCandidate = String(parsed.purchaseProbability || parsed.purchase_bucket || '')
      .trim()
      .toUpperCase();
    const purchaseProbability =
      bucketCandidate === 'VERY_HIGH' ||
      bucketCandidate === 'HIGH' ||
      bucketCandidate === 'MEDIUM' ||
      bucketCandidate === 'LOW'
        ? (bucketCandidate as 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH')
        : scoreToProbabilityBucket(leadScore);
    const probabilityScore = Math.max(
      0,
      Math.min(
        1,
        Number(
          parsed.purchaseProbabilityScore || parsed.purchase_probability_score || leadScore / 100,
        ) || 0,
      ),
    );
    const purchaseProbabilityPercent = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          Number(
            parsed.purchaseProbabilityPercent ||
              parsed.purchase_probability_percent ||
              probabilityScore * 100,
          ) || 0,
        ),
      ),
    );
    const buyerStatusCandidate = String(parsed.buyerStatus || parsed.customerStatus || '')
      .trim()
      .toUpperCase();
    const buyerStatus =
      buyerStatusCandidate === 'BOUGHT' ||
      buyerStatusCandidate === 'NOT_BOUGHT' ||
      buyerStatusCandidate === 'UNKNOWN'
        ? (buyerStatusCandidate as 'BOUGHT' | 'NOT_BOUGHT' | 'UNKNOWN')
        : 'UNKNOWN';
    const purchasedProduct =
      String(parsed.purchasedProduct || parsed.productBought || parsed.product || '').trim() ||
      null;
    const purchaseValueRaw = Number(
      parsed.purchaseValue || parsed.amountPaid || parsed.valuePaid || 0,
    );
    const purchaseValue =
      Number.isFinite(purchaseValueRaw) && purchaseValueRaw > 0
        ? Number(purchaseValueRaw.toFixed(2))
        : null;

    return {
      leadScore,
      purchaseProbability,
      purchaseProbabilityScore: probabilityScore,
      purchaseProbabilityPercent,
      sentiment:
        String(parsed.sentiment || 'NEUTRAL')
          .trim()
          .toUpperCase() || 'NEUTRAL',
      intent:
        String(parsed.intent || 'INFO')
          .trim()
          .toUpperCase() || 'INFO',
      summary: String(parsed.summary || '').trim(),
      nextBestAction:
        String(parsed.nextBestAction || parsed.next_best_action || '').trim() ||
        (buyerStatus === 'BOUGHT' ? 'CUSTOMER_SUCCESS' : 'REVIEW_MANUALLY'),
      reasons: Array.isArray(parsed.reasons)
        ? parsed.reasons.map((reason: UnknownRecord) => String(reason || '').trim()).filter(Boolean)
        : [],
      buyerStatus,
      purchasedProduct,
      purchaseValue,
      purchaseReason: String(parsed.purchaseReason || parsed.purchase_reason || '').trim() || null,
      notPurchasedReason:
        String(parsed.notPurchasedReason || parsed.not_purchased_reason || '').trim() || null,
      preferences: Array.isArray(parsed.preferences)
        ? parsed.preferences.map((item: UnknownRecord) => String(item || '').trim()).filter(Boolean)
        : [],
      importantDetails: Array.isArray(parsed.importantDetails)
        ? parsed.importantDetails
            .map((item: UnknownRecord) => String(item || '').trim())
            .filter(Boolean)
        : [],
      demographics: {
        gender:
          String(parsed.gender || parsed.demographics?.gender || 'UNKNOWN')
            .trim()
            .toUpperCase() || 'UNKNOWN',
        ageRange:
          String(parsed.ageRange || parsed.demographics?.ageRange || 'UNKNOWN')
            .trim()
            .toUpperCase() || 'UNKNOWN',
        location:
          String(parsed.location || parsed.demographics?.location || 'UNKNOWN').trim() || 'UNKNOWN',
        confidence: Math.max(
          0,
          Math.min(
            1,
            Number(parsed.demographicsConfidence || parsed.demographics?.confidence || 0) || 0,
          ),
        ),
      },
    };
  } catch (error: unknown) {
    const errorInstanceofError =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'unknown error');
    log.warn('catalog_ai_score_failed', { error: errorInstanceofError?.message || error });
    return null;
  }
}
