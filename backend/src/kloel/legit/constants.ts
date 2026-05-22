type RegulatedCategory =
  | 'health_claims'
  | 'financial_advice'
  | 'legal_advice'
  | 'medical_device'
  | 'pharmaceutical'
  | 'tobacco'
  | 'alcohol'
  | 'gambling'
  | 'adult_content'
  | 'crypto_advice'
  | 'political'
  | 'hate_speech'
  | 'restricted_product';
export const CCPA_REQUIRED_DISCLOSURES: readonly string[] = [
  'categories_of_personal_information',
  'purposes_of_collection',
  'sale_of_data',
  'right_to_opt_out',
  'right_to_delete',
];
export const WHATSAPP_FORBIDDEN_CONTENT_PATTERNS: readonly string[] = [
  'spam',
  'bulk_unsolicited',
  'scraping',
  'fake_engagement',
  'impersonation',
  'hate_speech',
  'violence_incitement',
  'child_exploitation',
  'illegal_products',
  'prescription_drugs',
  'weapons',
  'adult_services',
  'gambling_unsolicited',
  'multi_level_marketing',
  'payday_loans',
];
export const EMAIL_SPAM_TRIGGERS: readonly string[] = [
  'act now',
  'limited time',
  'exclusive offer',
  'guaranteed',
  'risk free',
  'no obligation',
  'free access',
  'click here',
  'urgent',
  'instant',
  '100% free',
  'act immediately',
  'limited offer',
];
export const ADS_RESTRICTED_CATEGORIES_BR: readonly string[] = [
  'medicamentos',
  'saude',
  'bebidas_alcoolicas',
  'tabaco',
  'armas',
  'jogos_azar',
  'criptomoedas',
  'servicos_financeiros',
  'conteudo_adulto',
  'politico',
  'religioso',
];
export const AFFILIATE_REQUIRED_DISCLAIMERS: readonly string[] = [
  'transparency_affiliate_link',
  'no_false_scarcity',
  'no_fake_results',
  'no_fake_testimonials',
  'income_disclosure',
  'material_connection',
];
export const COMMERCIAL_PROMISE_RED_FLAGS: readonly string[] = [
  'garantia de resultados',
  'resultados garantidos',
  'sem esforco',
  'dinheiro facil',
  'enriquecimento rapido',
  'resultados instantaneos',
  '100% garantido',
  'sem risco',
  'comprovado cientificamente sem evidencia',
  'antes e depois falso',
  'depoimento falso',
  'resultados tipicos atipicos',
];
export const REGULATED_CONTENT_DISCLAIMERS: Readonly<Record<RegulatedCategory, string>> = {
  health_claims: 'Esta informacao nao substitui aconselhamento medico profissional.',
  financial_advice: 'Este conteudo nao constitui aconselhamento financeiro.',
  legal_advice: 'Este conteudo nao constitui aconselhamento juridico.',
  medical_device: 'Produto nao avaliado pela ANVISA. Consulte um profissional de saude.',
  pharmaceutical: 'Medicamento sujeito a prescricao. Consulte um medico.',
  tobacco: 'Este produto contem nicotina, substancia que causa dependencia.',
  alcohol: 'Beba com moderacao. Proibida a venda para menores de 18 anos.',
  gambling: 'Jogos de azar podem causar dependencia. Jogue com responsabilidade.',
  adult_content: 'Conteudo restrito a maiores de 18 anos.',
  crypto_advice: 'Investimentos em criptomoedas envolvem alto risco.',
  political: 'Este e um conteudo de natureza politica.',
  hate_speech: 'Este conteudo foi sinalizado como potencial discurso de odio.',
  restricted_product: 'A venda deste produto esta sujeita a restricoes legais.',
};
export function generateId(prefix: string): string {
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return `${prefix}_${suffix}`;
}
export function daysUntil(iso: string, nowMs: number): number {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) {
    return 0;
  }
  return Math.floor((ts - nowMs) / (1000 * 60 * 60 * 24));
}
export function containsAny(target: string, patterns: readonly string[]): boolean {
  const lower = target.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}
