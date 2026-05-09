// Domain types extracted from ContaView.tsx.
// Re-imports from useKyc for types that originate there.

import type { KycCompletion, KycDocument } from '@/hooks/useKyc';

export type FiscalType = 'PF' | 'PJ';

export interface KycProfile {
  id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  avatarUrl?: string | null;
  documentNumber?: string | null;
  publicName?: string | null;
  bio?: string | null;
  website?: string | null;
  instagram?: string | null;
}

export interface KycFiscal {
  type?: FiscalType | null;
  cpf?: string | null;
  fullName?: string | null;
  cnpj?: string | null;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  inscricaoEstadual?: string | null;
  inscricaoMunicipal?: string | null;
  responsavelCpf?: string | null;
  responsavelNome?: string | null;
  cep?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
}

export type { KycDocument, KycCompletion };

export interface KycBankAccount {
  bankName?: string | null;
  bankCode?: string | null;
  agency?: string | null;
  account?: string | null;
  accountType?: string | null;
  pixKey?: string | null;
  pixKeyType?: string | null;
  holderName?: string | null;
  holderDocument?: string | null;
}

export interface MetaAuthStatus {
  connected: boolean;
  pageName?: string | null;
  instagramUsername?: string | null;
  adAccountId?: string | null;
  tokenExpired?: boolean;
}

export interface MetaAuthUrlResponse {
  url?: string;
  data?: { url?: string };
}

export type TeamMemberStatus = 'active' | 'pending';

export interface TeamMember {
  id: string;
  name?: string | null;
  email: string;
  role: string;
  status?: TeamMemberStatus | string;
}

export type TeamInviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface TeamInvite {
  id: string;
  email: string;
  role: string;
  status: TeamInviteStatus | string;
}

export interface TeamApiResponse {
  members?: TeamMember[];
  invites?: TeamInvite[];
}

export type SettingsSectionKey =
  | 'account'
  | 'pessoal'
  | 'fiscal'
  | 'documentos'
  | 'bancario'
  | 'billing'
  | 'apps'
  | 'brain'
  | 'crm'
  | 'analytics'
  | 'activity'
  | 'seguranca'
  | 'equipe'
  | 'notificacoes'
  | 'perfil'
  | 'idiomas'
  | 'presentear'
  | 'saiba-mais'
  | 'ajuda'
  | 'sair';

export interface LanguageDef {
  key: string;
  label: string;
  code: string;
  disabled: boolean;
}
