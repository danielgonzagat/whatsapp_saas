'use client';

export interface DashboardContextParams {
  conversationId?: string | null;
  source?: string | null;
  leadId?: string | null;
  phone?: string | null;
  email?: string | null;
  name?: string | null;
  productId?: string | null;
  productName?: string | null;
  planId?: string | null;
  planName?: string | null;
  draft?: string | null;
  purpose?: string | null;
}

export interface DashboardContextMetadata {
  source?: string;
  leadId?: string;
  phone?: string;
  email?: string;
  name?: string;
  productId?: string;
  productName?: string;
  planId?: string;
  planName?: string;
  draft?: string;
  purpose?: string;
  sourceLabel?: string;
}

const SOURCE_LABELS: Record<string, string> = {
  landing: 'Landing',
  leads: 'Leads',
  followups: 'Follow-ups',
  inbox: 'Inbox',
  marketing: 'Marketing',
  scrapers: 'Scrapers',
  flow: 'Flow',
  checkout: 'Checkout',
  pricing: 'Pricing',
  chat: 'Chat',
};

function clean(value?: string | null): string {
  return String(value || '').trim();
}

export function normalizeDashboardContext(
  input?: DashboardContextParams | null,
): DashboardContextMetadata | null {
  if (!input) return null;

  const normalized: DashboardContextMetadata = {
    source: clean(input.source) || undefined,
    leadId: clean(input.leadId) || undefined,
    phone: clean(input.phone) || undefined,
    email: clean(input.email) || undefined,
    name: clean(input.name) || undefined,
    productId: clean(input.productId) || undefined,
    productName: clean(input.productName) || undefined,
    planId: clean(input.planId) || undefined,
    planName: clean(input.planName) || undefined,
    draft: clean(input.draft) || undefined,
    purpose: clean(input.purpose) || undefined,
  };

  normalized.sourceLabel = getDashboardSourceLabel(normalized.source);

  const hasValue = Object.values(normalized).some((value) => Boolean(value));
  return hasValue ? normalized : null;
}

export function buildDashboardContextMetadata(
  input?: DashboardContextParams | null,
): { dashboardContext: DashboardContextMetadata } | undefined {
  const normalized = normalizeDashboardContext(input);
  if (!normalized) return undefined;
  return { dashboardContext: normalized };
}

export function readDashboardContextFromMetadata(value: any): DashboardContextMetadata | null {
  const candidate =
    value?.dashboardContext && typeof value.dashboardContext === 'object'
      ? value.dashboardContext
      : value && typeof value === 'object'
        ? value
        : null;

  if (!candidate) return null;

  return normalizeDashboardContext(candidate);
}

export function getDashboardSourceLabel(source?: string | null): string {
  return SOURCE_LABELS[clean(source).toLowerCase()] || 'Operação';
}

export function buildDashboardHref(input: DashboardContextParams): string {
  const params = new URLSearchParams();

  const entries: Array<[string, string | null | undefined]> = [
    ['conversationId', input.conversationId],
    ['source', input.source],
    ['leadId', input.leadId],
    ['phone', input.phone],
    ['email', input.email],
    ['name', input.name],
    ['productId', input.productId],
    ['productName', input.productName],
    ['planId', input.planId],
    ['planName', input.planName],
    ['draft', input.draft],
    ['purpose', input.purpose],
  ];

  for (const [key, value] of entries) {
    const normalized = clean(value);
    if (normalized) params.set(key, normalized);
  }

  const query = params.toString();
  return query ? `/dashboard?${query}` : '/dashboard';
}

export function buildDashboardSourceHref(input: DashboardContextParams): string | null {
  const source = clean(input.source).toLowerCase();
  const params = new URLSearchParams();

  const pushIfPresent = (key: string, value?: string | null) => {
    const normalized = clean(value);
    if (normalized) params.set(key, normalized);
  };

  switch (source) {
    case 'leads':
      pushIfPresent('leadId', input.leadId);
      pushIfPresent('phone', input.phone);
      pushIfPresent('email', input.email);
      return params.toString() ? `/leads?${params.toString()}` : '/leads';
    case 'followups':
      pushIfPresent('source', 'dashboard');
      pushIfPresent('leadId', input.leadId);
      pushIfPresent('phone', input.phone);
      return params.toString() ? `/followups?${params.toString()}` : '/followups';
    case 'inbox':
      pushIfPresent('source', 'dashboard');
      pushIfPresent('phone', input.phone);
      pushIfPresent('draft', input.draft);
      return params.toString() ? `/inbox?${params.toString()}` : '/inbox';
    case 'pricing':
      return '/pricing';
    case 'checkout':
      return clean(input.planId) ? `/checkout/${encodeURIComponent(clean(input.planId))}` : null;
    case 'marketing':
      return '/marketing';
    case 'scrapers':
      return '/scrapers';
    case 'flow':
      pushIfPresent('source', 'dashboard');
      pushIfPresent('leadId', input.leadId);
      pushIfPresent('phone', input.phone);
      pushIfPresent('purpose', input.purpose);
      params.set('tab', 'editor');
      return `/flow?${params.toString()}`;
    case 'landing':
      return '/';
    default:
      return null;
  }
}

export function buildDashboardContextPrompt(input: DashboardContextParams): string {
  const explicitDraft = clean(input.draft);
  if (explicitDraft) return explicitDraft;

  const lines: string[] = [];
  const sourceLabel = getDashboardSourceLabel(input.source);
  const purpose = clean(input.purpose).toLowerCase();

  lines.push(`Quero sua ajuda com este contexto vindo de ${sourceLabel}.`);

  const name = clean(input.name);
  const phone = clean(input.phone);
  const email = clean(input.email);
  const leadId = clean(input.leadId);
  const productName = clean(input.productName);
  const productId = clean(input.productId);
  const planName = clean(input.planName);
  const planId = clean(input.planId);

  if (name) lines.push(`Nome do contato: ${name}`);
  if (phone) lines.push(`Telefone: ${phone}`);
  if (email) lines.push(`Email: ${email}`);
  if (leadId) lines.push(`Lead ID: ${leadId}`);
  if (productName) lines.push(`Produto: ${productName}`);
  if (productId) lines.push(`Produto ID: ${productId}`);
  if (planName) lines.push(`Plano: ${planName}`);
  if (planId) lines.push(`Plano ID: ${planId}`);

  if (purpose === 'recovery') {
    lines.push(
      'Objetivo: analisar o contexto, sugerir a próxima melhor ação e montar uma abordagem de recuperação.',
    );
  } else if (clean(input.source).toLowerCase() === 'inbox') {
    lines.push(
      'Objetivo: analisar a situação deste contato e sugerir a melhor resposta e a próxima ação comercial.',
    );
  } else if (clean(input.source).toLowerCase() === 'leads') {
    lines.push(
      'Objetivo: qualificar este lead e me orientar sobre a melhor ação para avançar a venda.',
    );
  } else if (clean(input.source).toLowerCase() === 'followups') {
    lines.push(
      'Objetivo: retomar este contato e decidir entre inbox, flow ou campanha para avançar a conversão.',
    );
  } else if (clean(input.source).toLowerCase() === 'checkout') {
    lines.push(
      'Objetivo: me ajudar a destravar a venda deste checkout e responder objeções comerciais com clareza.',
    );
  } else if (clean(input.source).toLowerCase() === 'pricing') {
    lines.push('Objetivo: me ajudar a escolher, justificar e concluir o plano ideal agora.');
  } else if (clean(input.source).toLowerCase() === 'landing') {
    lines.push(
      'Objetivo: responder dúvidas, qualificar interesse e transformar curiosidade em próximo passo concreto.',
    );
  } else {
    lines.push('Objetivo: sugerir a próxima melhor ação com base neste contexto.');
  }

  return lines.join('\n');
}

export function summarizeDashboardContext(input: DashboardContextParams): string[] {
  const summary: string[] = [];
  const sourceLabel = getDashboardSourceLabel(input.source);

  if (sourceLabel) summary.push(`Origem: ${sourceLabel}`);
  if (clean(input.name)) summary.push(`Contato: ${clean(input.name)}`);
  if (clean(input.phone)) summary.push(`Telefone: ${clean(input.phone)}`);
  if (clean(input.email)) summary.push(`Email: ${clean(input.email)}`);
  if (clean(input.productName)) summary.push(`Produto: ${clean(input.productName)}`);
  if (clean(input.planName)) summary.push(`Plano: ${clean(input.planName)}`);
  if (clean(input.purpose)) summary.push(`Objetivo: ${clean(input.purpose)}`);

  return summary;
}
