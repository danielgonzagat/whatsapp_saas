/**
 * Pure helpers for partner-invite construction.
 *
 * Extracted from PartnershipsService so the URL/label logic can be unit-tested
 * directly without spinning up the NestJS module or stubbing Prisma.
 */

export const INVITABLE_PARTNER_TYPES = new Set([
  'AFFILIATE',
  'SUPPLIER',
  'COPRODUCER',
  'MANAGER',
]);

export const PARTNER_ROLE_LABELS: Record<string, string> = {
  AFFILIATE: 'afiliado',
  SUPPLIER: 'fornecedor',
  COPRODUCER: 'coprodutor',
  MANAGER: 'gerente',
  PRODUCER: 'produtor',
};

/**
 * Resolves a human-readable Portuguese label for a partner-type code.
 *
 * Falls back to the generic `parceiro` label when the type is unknown so
 * downstream copy (e.g. invite emails) always has something to render.
 */
export function getPartnerRoleLabel(type: string) {
  return PARTNER_ROLE_LABELS[type] || 'parceiro';
}

export interface PartnerInviteUrlParams {
  inviteToken: string;
  partnerEmail: string;
  partnerName: string;
  workspaceName: string;
  frontendUrl?: string | undefined;
}

/**
 * Builds the partner-invite registration URL with all four required query
 * parameters preserved verbatim. When `frontendUrl` is omitted, falls back to
 * `http://localhost:3000` to match the previous in-service default.
 */
export function buildPartnerInviteUrl(params: PartnerInviteUrlParams) {
  const base = params.frontendUrl || 'http://localhost:3000';
  const url = new URL('/register', base);
  url.searchParams.set('affiliateInviteToken', params.inviteToken);
  url.searchParams.set('email', params.partnerEmail);
  url.searchParams.set('partnerName', params.partnerName);
  url.searchParams.set('inviterWorkspaceName', params.workspaceName);
  return url.toString();
}
