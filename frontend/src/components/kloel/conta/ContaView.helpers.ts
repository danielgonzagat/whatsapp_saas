// Pure helpers extracted from ContaView.tsx to reduce cyclomatic complexity.
// No JSX, no React — these are data-shape transforms only.

import type { KycCompletion } from '@/hooks/useKyc';
import { legalConstants } from '@/lib/legal-constants';
import type { SettingsSectionKey } from './ContaTypes';
import { DEFAULT_SETTINGS_SECTION } from './ContaConstants';

/** Section keys for which the SystemAlertsCard is rendered above the panel. */
const SECTIONS_WITH_SYSTEM_ALERTS: ReadonlySet<SettingsSectionKey> = new Set<SettingsSectionKey>([
  'account',
  'billing',
  'apps',
  'brain',
  'crm',
  'analytics',
  'activity',
]);

/** Account closure requests are handled by the real account help section. */
export const ACCOUNT_CLOSURE_SUPPORT_SECTION: SettingsSectionKey = 'ajuda';

/** Canonical support email shared with public legal pages. */
export const KLOEL_SUPPORT_EMAIL = legalConstants.company.emailSupport;

/** Subscription status union accepted by the BillingSettingsSection. */
export type SubscriptionStatus = 'none' | 'trial' | 'active' | 'expired' | 'suspended';

/** Subset of billing subscription payload that ContaView consumes. */
export interface BillingSubscriptionPayload {
  status?: SubscriptionStatus | string | null;
  trialDaysLeft?: number | null;
  creditsBalance?: number | null;
}

/** Subset of payment methods payload that ContaView consumes. */
export interface BillingPaymentMethodsPayload {
  paymentMethods?: unknown[] | null;
}

/** Normalized billing summary used by ContaView. */
export interface BillingSummary {
  subscriptionStatus: SubscriptionStatus;
  trialDaysLeft: number;
  creditsBalance: number;
  hasCard: boolean;
}

/** Default billing summary when no data is available or a request errored. */
export const EMPTY_BILLING_SUMMARY: BillingSummary = {
  subscriptionStatus: 'none',
  trialDaysLeft: 0,
  creditsBalance: 0,
  hasCard: false,
};

/** Safely returns the KYC completion percentage. Defaults to 0. */
export function getCompletionPercentage(completion: KycCompletion | null | undefined): number {
  const pct = completion?.percentage;
  return typeof pct === 'number' && Number.isFinite(pct) ? pct : 0;
}

/** Safely returns the current KYC status. Defaults to 'pending'. */
export function getKycStatusValue(status: { kycStatus?: string | null } | null | undefined): string {
  return status?.kycStatus || 'pending';
}

/**
 * Returns whether a KYC completion sub-section is approved.
 * 'approved' when the named section is marked complete, otherwise 'pending'.
 */
export function getSectionStatus(
  completion: KycCompletion | null | undefined,
  name: string,
): 'approved' | 'pending' {
  const section = completion?.sections?.find((s) => s.name === name);
  return section?.complete ? 'approved' : 'pending';
}

/** True when KYC is incomplete or not yet approved — gates premium features. */
export function isKycBlocked(percentage: number, kycStatus: string): boolean {
  return percentage < 100 || kycStatus !== 'approved';
}

/** True when KYC is complete enough to be submitted for review. */
export function canSubmitKyc(percentage: number, kycStatus: string): boolean {
  return percentage >= 100 && kycStatus === 'pending';
}

/** True when the SystemAlertsCard should be rendered above the section panel. */
export function shouldShowSystemAlerts(section: SettingsSectionKey): boolean {
  return SECTIONS_WITH_SYSTEM_ALERTS.has(section);
}

/**
 * Compute the next URL query string when the user switches settings sections.
 * Drops the `section` param when switching to the default section, otherwise
 * sets it to the new value. Returns the rebuilt query string (without `?`).
 */
export function buildSectionQueryString(
  currentSearch: URLSearchParams | string,
  nextSection: SettingsSectionKey,
  defaultSection: SettingsSectionKey = DEFAULT_SETTINGS_SECTION,
): string {
  const params = new URLSearchParams(
    typeof currentSearch === 'string' ? currentSearch : currentSearch.toString(),
  );
  if (nextSection === defaultSection) {
    params.delete('section');
  } else {
    params.set('section', nextSection);
  }
  return params.toString();
}

/**
 * Build the next router URL (pathname plus optional query) when switching
 * sections. Returns just the pathname when no query params remain.
 */
export function buildSectionUrl(
  pathname: string,
  currentSearch: URLSearchParams | string,
  nextSection: SettingsSectionKey,
  defaultSection: SettingsSectionKey = DEFAULT_SETTINGS_SECTION,
): string {
  const query = buildSectionQueryString(currentSearch, nextSection, defaultSection);
  return query ? `${pathname}?${query}` : pathname;
}


/** Build the canonical route for account closure support requests. */
export function buildAccountClosureSupportUrl(
  pathname: string,
  currentSearch: URLSearchParams | string,
): string {
  return buildSectionUrl(pathname, currentSearch, ACCOUNT_CLOSURE_SUPPORT_SECTION);
}

function isPlaceholderWhatsappNumber(digits: string): boolean {
  const localNumber = digits.startsWith('55') ? digits.slice(2) : digits;
  return localNumber.length > 0 && /^0+$/.test(localNumber);
}

function normalizeWhatsappDigits(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15 || isPlaceholderWhatsappNumber(digits)) {
    return null;
  }
  return digits;
}

/** Build a support mail link using the canonical Kloel support address. */
export function buildKloelSupportMailHref(subject?: string): string {
  const normalizedSubject = subject?.trim();
  if (!normalizedSubject) {
    return `mailto:${KLOEL_SUPPORT_EMAIL}`;
  }
  return `mailto:${KLOEL_SUPPORT_EMAIL}?subject=${encodeURIComponent(normalizedSubject)}`;
}

/** Build a WhatsApp support link only when a real number or wa.me URL is configured. */
export function buildKloelSupportWhatsappHref(raw?: string | null): string | null {
  const value = raw?.trim();
  if (!value) {
    return null;
  }

  const existingWaMeUrl = value.match(/^https:\/\/wa\.me\/(\d{10,15})(\?.*)?$/);
  if (existingWaMeUrl) {
    return isPlaceholderWhatsappNumber(existingWaMeUrl[1]) ? null : value;
  }

  const digits = normalizeWhatsappDigits(value);
  return digits ? `https://wa.me/${digits}` : null;
}

/**
 * Coerce a raw subscription status (any value) into the strict union accepted
 * by the BillingSettingsSection. Unknown / nullish values collapse to 'none'.
 */
export function normalizeSubscriptionStatus(value: unknown): SubscriptionStatus {
  if (value === 'trial' || value === 'active' || value === 'expired' || value === 'suspended') {
    return value;
  }
  return 'none';
}

/** Coerce a numeric-ish input to a finite non-negative integer, defaulting to 0. */
function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

/**
 * Parse billing responses into a normalized BillingSummary. When `subscription`
 * is nullish the subscription fields collapse to defaults; the card flag is
 * derived from the payment-methods payload length.
 */
export function parseBillingSummary(
  subscription: BillingSubscriptionPayload | null | undefined,
  paymentMethods: BillingPaymentMethodsPayload | null | undefined,
): BillingSummary {
  if (!subscription) {
    return {
      ...EMPTY_BILLING_SUMMARY,
      hasCard: !!paymentMethods?.paymentMethods?.length,
    };
  }
  return {
    subscriptionStatus: normalizeSubscriptionStatus(subscription.status),
    trialDaysLeft: toCount(subscription.trialDaysLeft),
    creditsBalance: toCount(subscription.creditsBalance),
    hasCard: !!paymentMethods?.paymentMethods?.length,
  };
}

// BrasilAPI CNPJ response subset used for auto-fill.
export interface BrasilApiCnpjResponse {
  /** Razao_social property. */
  razao_social?: string;
  /** Nome_fantasia property. */
  nome_fantasia?: string;
  /** Cep property. */
  cep?: string;
  /** Logradouro property. */
  logradouro?: string;
  /** Numero property. */
  numero?: string;
  /** Complemento property. */
  complemento?: string;
  /** Bairro property. */
  bairro?: string;
  /** Municipio property. */
  municipio?: string;
  /** Uf property. */
  uf?: string;
  /** Qsa property. */
  qsa?: Array<{ nome_socio?: string; cnpj_cpf_do_socio?: string }>;
}

// ViaCEP response subset used for address auto-fill.
export interface ViaCepResponse {
  /** Logradouro property. */
  logradouro?: string;
  /** Complemento property. */
  complemento?: string;
  /** Bairro property. */
  bairro?: string;
  /** Localidade property. */
  localidade?: string;
  /** Uf property. */
  uf?: string;
  /** Erro property. */
  erro?: boolean;
}

/**
 * Merge ViaCEP response onto an existing form state without overwriting
 * values the user already filled in. Preserves prev values when the API
 * response is missing a field.
 */
export function mergeCepIntoForm<
  T extends {
    rua: string;
    complemento: string;
    bairro: string;
    cidade: string;
    uf: string;
  },
>(prev: T, data: ViaCepResponse): T {
  return {
    ...prev,
    rua: data.logradouro || prev.rua,
    complemento: data.complemento || prev.complemento,
    bairro: data.bairro || prev.bairro,
    cidade: data.localidade || prev.cidade,
    uf: data.uf || prev.uf,
  };
}

/**
 * Merge BrasilAPI CNPJ response onto an existing fiscal form state without
 * overwriting values the user already filled in. Preserves prev values when
 * the API response is missing a field.
 */
export function mergeCnpjIntoForm<
  T extends {
    razaoSocial: string;
    nomeFantasia: string;
    cep: string;
    rua: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    uf: string;
    responsavelNome: string;
    responsavelCpf: string;
  },
>(prev: T, data: BrasilApiCnpjResponse): T {
  return {
    ...prev,
    razaoSocial: data.razao_social || prev.razaoSocial,
    nomeFantasia: data.nome_fantasia || prev.nomeFantasia,
    cep: data.cep || prev.cep,
    rua: data.logradouro || prev.rua,
    numero: data.numero || prev.numero,
    complemento: data.complemento || prev.complemento,
    bairro: data.bairro || prev.bairro,
    cidade: data.municipio || prev.cidade,
    uf: data.uf || prev.uf,
    responsavelNome: data.qsa?.[0]?.nome_socio || prev.responsavelNome,
    responsavelCpf: data.qsa?.[0]?.cnpj_cpf_do_socio || prev.responsavelCpf,
  };
}
