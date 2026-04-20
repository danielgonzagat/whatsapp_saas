import type { MarketingSkillCatalogEntry } from './marketing-skill.types';

const DEFINITIONS: Record<
  string,
  Omit<MarketingSkillCatalogEntry, 'id' | 'title'> & { title?: string }
> = {
  'ab-test-setup': {
    summary: 'Design and structure A/B tests with real hypotheses and success criteria.',
    keywords: ['a/b', 'ab test', 'teste ab', 'experimento', 'pricing test', 'teste de página'],
    brazilNotes: [
      'Prefer checkout, landing, offer and pricing experiments that fit BR acquisition flows.',
    ],
  },
  'ad-creative': {
    summary: 'Create and iterate paid-ad creative angles and assets.',
    keywords: ['criativo', 'creative', 'anuncio', 'ads criativo', 'hook de anuncio'],
    brazilNotes: [
      'Use BR direct-response hooks, creator-style assets, and WhatsApp-friendly CTA language.',
    ],
  },
  'ai-seo': {
    summary: 'Use AI-native SEO workflows without publishing empty AI sludge.',
    keywords: ['ai seo', 'seo com ia', 'conteúdo seo', 'blog seo'],
    brazilNotes: [
      'Keep PT-BR search intent and Brazilian SERP reality above generic AI-content tactics.',
    ],
  },
  'analytics-tracking': {
    summary: 'Improve marketing instrumentation and event coverage.',
    keywords: ['tracking', 'tagueamento', 'pixel', 'analytics', 'evento', 'utm'],
    brazilNotes: ['Prefer practical event coverage for checkout, leads, ads and launch funnels.'],
  },
  'aso-audit': {
    summary: 'Audit app-store style growth surfaces.',
    keywords: ['aso', 'app store', 'play store', 'app growth'],
    brazilNotes: ['Only use when the request is really about app-store optimization.'],
  },
  'churn-prevention': {
    summary: 'Reduce churn with save tactics, retention loops and recovery motions.',
    keywords: ['churn', 'cancelamento', 'retenção', 'retenção de sellers', 'evitar cancelamento'],
    brazilNotes: [
      'Use lifecycle, save-offer and operator-retention tactics that fit BR subscription behavior.',
    ],
  },
  'cold-email': {
    summary: 'Write and improve outbound cold-email sequences.',
    keywords: ['cold email', 'email frio', 'outbound', 'prospecção'],
    brazilNotes: [
      'Prefer concise PT-BR outreach that sounds operator-native, not SDR-template translated.',
    ],
  },
  'community-marketing': {
    summary: 'Use community loops to create distribution and retention.',
    keywords: ['comunidade', 'grupo', 'community', 'grupo de clientes'],
    brazilNotes: [
      'Brazilian launch groups and WhatsApp/Telegram communities matter more than forum-heavy defaults.',
    ],
  },
  'competitor-alternatives': {
    summary: 'Position against competitors and alternatives.',
    keywords: ['concorrente', 'alternativa', 'vs', 'comparativo'],
    brazilNotes: [
      'Map against BR commerce stack alternatives and operator workflows, not just US SaaS peers.',
    ],
  },
  'content-strategy': {
    summary: 'Plan content programs tied to acquisition and conversion.',
    keywords: ['conteúdo', 'content', 'editorial', 'calendário', 'blog'],
    brazilNotes: ['Keep content tied to demand capture, not brand-only vanity content.'],
  },
  'copy-editing': {
    summary: 'Tighten and improve existing marketing copy.',
    keywords: ['editar copy', 'copy editing', 'revisar copy', 'lapidar copy'],
    brazilNotes: ['Preserve Brazilian cadence, directness and conversion pressure where it helps.'],
  },
  copywriting: {
    summary: 'Write conversion-focused marketing copy.',
    keywords: ['copy', 'headline', 'hero', 'homepage', 'landing copy', 'pagina de vendas'],
    brazilNotes: ['Use native PT-BR direct response, launch, checkout and WhatsApp language.'],
  },
  'customer-research': {
    summary: 'Structure customer insight gathering and synthesis.',
    keywords: ['pesquisa', 'customer research', 'entrevista', 'voz do cliente'],
    brazilNotes: ['Push for verbatim Brazilian operator language, not polished abstractions.'],
  },
  'email-sequence': {
    summary: 'Build lifecycle, activation and sales email sequences.',
    keywords: ['sequencia de email', 'email sequence', 'automação email', 'email de recuperação'],
    brazilNotes: [
      'Blend launch, abandonment, and WhatsApp-follow-up logic common in BR info-product ops.',
    ],
  },
  'form-cro': {
    summary: 'Optimize forms and field friction.',
    keywords: ['formulario', 'form', 'cadastro', 'lead form'],
    brazilNotes: ['Prefer simpler forms for mobile-heavy BR traffic and WhatsApp-first capture.'],
  },
  'free-tool-strategy': {
    summary: 'Use free tools as acquisition wedges.',
    keywords: ['ferramenta gratis', 'free tool', 'lead magnet tool'],
    brazilNotes: ['Good fit when Kloel wants acquisition loops beyond standard content.'],
  },
  'launch-strategy': {
    summary: 'Plan launches and release motions.',
    keywords: ['lançamento', 'launch', 'pré lançamento', 'aquecimento', 'abertura de carrinho'],
    brazilNotes: [
      'Prefer BR info-product launch choreography, affiliate warmup and WhatsApp groups.',
    ],
  },
  'lead-magnets': {
    summary: 'Create lead magnets and opt-in offers.',
    keywords: ['lead magnet', 'isca digital', 'ebook', 'captura'],
    brazilNotes: ['Make the asset feel useful and immediately actionable for Brazilian operators.'],
  },
  'marketing-ideas': {
    summary: 'Generate structured marketing ideas, not random brainstorm sludge.',
    keywords: ['ideias', 'ideas', 'brainstorm marketing', 'campanhas ideias'],
    brazilNotes: ['Tie ideation to channels Kloel can actually execute or support.'],
  },
  'marketing-psychology': {
    summary: 'Apply persuasion and behavioral principles to conversion work.',
    keywords: ['psicologia', 'gatilhos', 'persuasão', 'behavioral'],
    brazilNotes: [
      'Use culturally fluent urgency and proof, never literal translated trigger words.',
    ],
  },
  'onboarding-cro': {
    summary: 'Improve activation and early user conversion after signup.',
    keywords: ['onboarding', 'ativação', 'activation', 'primeiros passos'],
    brazilNotes: ['Relevant for seller activation inside Kloel and lifecycle sequences.'],
  },
  'page-cro': {
    summary: 'Improve conversion on marketing pages.',
    keywords: ['landing', 'homepage', 'conversão', 'cro', 'pagina', 'checkout baixo'],
    brazilNotes: [
      'Use page structures that fit BR direct-response pages, not sterile SaaS layouts.',
    ],
  },
  'paid-ads': {
    summary: 'Plan and optimize paid acquisition campaigns.',
    keywords: ['meta ads', 'facebook ads', 'google ads', 'paid ads', 'roas', 'cpa', 'tráfego pago'],
    brazilNotes: [
      'Optimize for BR platform mix, creator traffic, WhatsApp journeys and checkout economics.',
    ],
  },
  'paywall-upgrade-cro': {
    summary: 'Optimize upgrade surfaces and in-product monetization asks.',
    keywords: ['upgrade', 'paywall', 'upsell interno', 'upgrade page'],
    brazilNotes: [
      'Use only when the ask is about paywalls or in-app upgrades, not full pricing strategy.',
    ],
  },
  'popup-cro': {
    summary: 'Use popups and modal interruptions carefully for conversion.',
    keywords: ['popup', 'modal', 'exit intent', 'pop-up'],
    brazilNotes: [
      'Prefer tasteful recovery and capture patterns, especially on mobile checkout traffic.',
    ],
  },
  'pricing-strategy': {
    summary: 'Set pricing, packaging and monetization structure.',
    keywords: ['pricing', 'preço', 'precificação', 'planos', 'mensal', 'anual', 'ticket'],
    brazilNotes: ['Tie price logic to BR willingness-to-pay, launch offers, and seller economics.'],
  },
  'product-marketing-context': {
    summary: 'Create the foundational product marketing context document.',
    keywords: ['product context', 'marketing context', 'icp', 'posicionamento'],
    brazilNotes: [
      'For Kloel, always ground this in the actual platform and audience, not aspiration-only messaging.',
    ],
  },
  'programmatic-seo': {
    summary: 'Build programmatic SEO surfaces with structure and intent.',
    keywords: ['programmatic seo', 'seo programatico', 'paginas programaticas'],
    brazilNotes: ['Only use when scale content surfaces are the real motion.'],
  },
  'referral-program': {
    summary: 'Design referral and affiliate-style growth loops.',
    keywords: ['referral', 'indicação', 'afiliado', 'afiliados', 'programa de afiliados'],
    brazilNotes: ['For Kloel, affiliate economics beat simplistic referral defaults.'],
  },
  revops: {
    summary: 'Structure revenue operations, handoffs and commercial process.',
    keywords: ['revops', 'processo comercial', 'pipeline', 'handoff', 'receita'],
    brazilNotes: ['Use when the ask is operational plumbing, not copy or channel strategy.'],
  },
  'sales-enablement': {
    summary: 'Help sales teams close with better materials and structure.',
    keywords: ['sales enablement', 'argumento de vendas', 'deck comercial', 'material comercial'],
    brazilNotes: ['Useful when Kloel needs founder-led sales or partner-enablement materials.'],
  },
  'schema-markup': {
    summary: 'Use structured data markup for search visibility.',
    keywords: ['schema', 'markup', 'rich results', 'dados estruturados'],
    brazilNotes: ['Use only when search markup is materially relevant.'],
  },
  'seo-audit': {
    summary: 'Audit SEO performance and technical/content gaps.',
    keywords: ['seo', 'audit seo', 'organic', 'ranqueamento', 'search console'],
    brazilNotes: ['Focus on PT-BR intent and the actual buyer/searcher language.'],
  },
  'signup-flow-cro': {
    summary: 'Improve signup and registration conversion.',
    keywords: ['signup', 'cadastro', 'registro', 'flow de cadastro'],
    brazilNotes: ['Good fit for seller acquisition or account-creation friction.'],
  },
  'site-architecture': {
    summary: 'Design site structure and information architecture for growth.',
    keywords: ['arquitetura do site', 'site architecture', 'estrutura do site', 'blog structure'],
    brazilNotes: ['Pair with SEO or landing work when the issue is site structure, not only copy.'],
  },
  'social-content': {
    summary: 'Create social content systems and platform-native posts.',
    keywords: ['social', 'linkedin', 'instagram', 'tiktok', 'conteúdo social'],
    brazilNotes: ['Prefer Brazilian creator/operator tone over corporate social posting.'],
  },
};

function titleFromId(id: string): string {
  return id
    .split('-')
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

/** Marketing_skill_catalog. */
export const MARKETING_SKILL_CATALOG: MarketingSkillCatalogEntry[] = Object.entries(
  DEFINITIONS,
).map(([id, definition]) => ({
  id,
  title: definition.title || titleFromId(id),
  summary: definition.summary,
  keywords: Array.from(new Set([id, ...id.split('-'), ...definition.keywords])),
  brazilNotes: definition.brazilNotes,
}));

/** Marketing_skill_ids. */
export const MARKETING_SKILL_IDS = MARKETING_SKILL_CATALOG.map((entry) => entry.id);
