'use client';

import { kloelT } from '@/lib/i18n/t';
import { PulseLoader } from '@/components/kloel/PulseLoader';
import { AccountSettingsSection } from '@/components/kloel/settings/account-settings-section';
import { ActivitySection } from '@/components/kloel/settings/activity-section';
import { AnalyticsSettingsSection } from '@/components/kloel/settings/analytics-settings-section';
import { BillingSettingsSection } from '@/components/kloel/settings/billing-settings-section';
import { BrainSettingsSection } from '@/components/kloel/settings/brain-settings-section';
import { CrmSettingsSection } from '@/components/kloel/settings/crm-settings-section';
import { SystemAlertsCard } from '@/components/kloel/settings/system-alerts-card';
import { BRAZILIAN_BANKS, POPULAR_BANK_CODES, formatBankCode } from '@/data/brazilian-banks';
import { useSellerConnectAccount } from '@/hooks/useConnectAccounts';
import {
  useBankAccount,
  useBankMutations,
  useDocumentMutations,
  useFiscalData,
  useFiscalMutations,
  useKycCompletion,
  useKycDocuments,
  useKycStatus,
  useKycSubmit,
  useProfile,
  useProfileMutations,
  useSecurityMutations,
  type KycCompletion,
  type KycDocument,
} from '@/hooks/useKyc';
import { usePersistentImagePreview } from '@/hooks/usePersistentImagePreview';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import { billingApi } from '@/lib/api';
import { apiFetch, tokenStorage } from '@/lib/api/core';
import { inviteTeamMember, removeTeamMember, revokeTeamInvite } from '@/lib/api/team';
import { swrFetcher } from '@/lib/fetcher';
import { readFileAsDataUrl } from '@/lib/media-upload';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useId } from 'react';
import { mutate as globalMutate } from 'swr'; // PULSE:OK — globalMutate used after Meta disconnect; SWR mutate() used in TeamSection for invite/revoke/remove
import useSWR from 'swr';

const D_RE = /\D/g;
const U0300__U036F_RE = /[\u0300-\u036f]/g;

const HTTPS_RE = /^https?:\/\//;

// ═══ DOMAIN TYPES ═══
// Shape of KYC data returned by the backend. Fields are optional because the
// backend returns partial records while onboarding is in progress.

type FiscalType = 'PF' | 'PJ';

interface KycProfile {
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

interface KycFiscal {
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

// KycDocument type now imported from @/hooks/useKyc to avoid duplication.

interface KycBankAccount {
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

// KycCompletion type now imported from @/hooks/useKyc to avoid duplication.

// Meta Platform (Instagram / Messenger / Ads) OAuth status.
interface MetaAuthStatus {
  connected: boolean;
  pageName?: string | null;
  instagramUsername?: string | null;
  adAccountId?: string | null;
  tokenExpired?: boolean;
}

interface MetaAuthUrlResponse {
  url?: string;
  data?: { url?: string };
}

// Team API shapes.
type TeamMemberStatus = 'active' | 'pending';

interface TeamMember {
  id: string;
  name?: string | null;
  email: string;
  role: string;
  status?: TeamMemberStatus | string;
}

type TeamInviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

interface TeamInvite {
  id: string;
  email: string;
  role: string;
  status: TeamInviteStatus | string;
}

interface TeamApiResponse {
  members?: TeamMember[];
  invites?: TeamInvite[];
}

import {
  type BrasilApiCnpjResponse,
  type ViaCepResponse,
  mergeCepIntoForm,
  mergeCnpjIntoForm,
} from './ContaView.helpers';
import {
  summarizeSellerConnectAccount,
  type SellerConnectState,
} from './ContaConnectStatus.helpers';

// ═══ HELPERS ═══

/** Extract a user-facing error message from an unknown thrown value.
 *  Required because TS (strict) types catch variables as `unknown`. */
function getErrorMessage(err: unknown): string | undefined {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message: unknown }).message;
    return typeof msg === 'string' ? msg : undefined;
  }
  return undefined;
}

/** Strip empty-string values from payload before sending to backend.
 *  class-validator's @IsOptional() only skips undefined/null, not "". */
function cleanPayload<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [k, v] of Object.entries(obj) as Array<[keyof T, T[keyof T]]>) {
    if (v !== '' && v !== undefined && v !== null) {
      result[k] = v;
    }
  }
  return result;
}

// ═══ CONSTANTS ═══

const SORA = "'Sora', sans-serif";
const MONO = "'JetBrains Mono', monospace";
const EMBER = '#E85D30';

// ═══ ICONS ═══

const Icons = {
  user: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d={kloelT(`M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2`)} />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  building: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d={kloelT(`M9 22v-4h6v4`)} />
      <path
        d={kloelT(
          `M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01`,
        )}
      />
    </svg>
  ),
  doc: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d={kloelT(`M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z`)} />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  bank: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d={kloelT(`M3 21h18`)} />
      <path d={kloelT(`M3 10h18`)} />
      <path d={kloelT(`M5 6l7-3 7 3`)} />
      <path d={kloelT(`M4 10v11`)} />
      <path d={kloelT(`M20 10v11`)} />
      <path d={kloelT(`M8 14v3`)} />
      <path d={kloelT(`M12 14v3`)} />
      <path d={kloelT(`M16 14v3`)} />
    </svg>
  ),
  shield: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d={kloelT(`M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z`)} />
    </svg>
  ),
  bell: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d={kloelT(`M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9`)} />
      <path d={kloelT(`M13.73 21a2 2 0 0 1-3.46 0`)} />
    </svg>
  ),
  globe: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path
        d={kloelT(
          `M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z`,
        )}
      />
    </svg>
  ),
  check: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  clock: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  alert: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        d={kloelT(
          `M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z`,
        )}
      />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  upload: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d={kloelT(`M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4`)} />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  camera: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        d={kloelT(
          `M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z`,
        )}
      />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  eye: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d={kloelT(`M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z`)} />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  x: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  trash: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path
        d={kloelT(`M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2`)}
      />
    </svg>
  ),
  language: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path
        d={kloelT(
          `M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z`,
        )}
      />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontSize="10"
        fontWeight="bold"
      >
        A
      </text>
    </svg>
  ),
  help: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d={kloelT(`M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3`)} />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  logout: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d={kloelT(`M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4`)} />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  users: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d={kloelT(`M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2`)} />
      <circle cx="9" cy="7" r="4" />
      <path d={kloelT(`M23 21v-2a4 4 0 0 0-3-3.87`)} />
      <path d={kloelT(`M16 3.13a4 4 0 0 1 0 7.75`)} />
    </svg>
  ),
  mail: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        d={kloelT(`M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z`)}
      />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  plus: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
};

// ═══ STATUS CONFIG ═══

const STATUS_CONFIG = {
  pending: { label: 'Pendente', color: '#F59E0B', bg: 'rgba(245,158,11,.06)', icon: Icons.clock },
  submitted: { label: 'Em analise', color: '#3B82F6', bg: 'rgba(59,130,246,.06)', icon: Icons.eye },
  approved: { label: 'Aprovado', color: '#10B981', bg: 'rgba(16,185,129,.06)', icon: Icons.check },
  rejected: { label: 'Reprovado', color: '#EF4444', bg: 'rgba(239,68,68,.06)', icon: Icons.alert },
};

const CONNECT_STATE_CONFIG: Record<
  SellerConnectState,
  { color: string; bg: string; border: string; icon: (s: number) => React.ReactNode }
> = {
  not_started: {
    color: 'var(--app-text-secondary)',
    bg: 'var(--app-bg-secondary)',
    border: 'var(--app-border-primary)',
    icon: Icons.clock,
  },
  action_required: {
    color: '#F59E0B',
    bg: 'rgba(245,158,11,.08)',
    border: 'rgba(245,158,11,.18)',
    icon: Icons.alert,
  },
  in_review: {
    color: '#3B82F6',
    bg: 'rgba(59,130,246,.08)',
    border: 'rgba(59,130,246,.18)',
    icon: Icons.eye,
  },
  restricted: {
    color: '#EF4444',
    bg: 'rgba(239,68,68,.08)',
    border: 'rgba(239,68,68,.18)',
    icon: Icons.x,
  },
  active: {
    color: '#10B981',
    bg: 'rgba(16,185,129,.08)',
    border: 'rgba(16,185,129,.18)',
    icon: Icons.check,
  },
};

type SettingsSectionKey =
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

const DEFAULT_SETTINGS_SECTION: SettingsSectionKey = 'pessoal';

const SETTINGS_SECTION_ALIASES: Record<string, SettingsSectionKey> = {
  workspace: 'account',
  account: 'account',
  configuracao: 'account',
  'configuracao-da-conta': 'account',
  pessoal: 'pessoal',
  personal: 'pessoal',
  fiscal: 'fiscal',
  documentos: 'documentos',
  documents: 'documentos',
  bancario: 'bancario',
  bank: 'bancario',
  billing: 'billing',
  pagamentos: 'billing',
  payment: 'billing',
  payments: 'billing',
  upgrades: 'billing',
  plano: 'billing',
  apps: 'apps',
  integracoes: 'apps',
  integrations: 'apps',
  brain: 'brain',
  kloel: 'brain',
  crm: 'crm',
  analytics: 'analytics',
  activity: 'activity',
  atividade: 'activity',
  seguranca: 'seguranca',
  security: 'seguranca',
  equipe: 'equipe',
  team: 'equipe',
  notificacoes: 'notificacoes',
  notifications: 'notificacoes',
  perfil: 'perfil',
  profile: 'perfil',
  idiomas: 'idiomas',
  language: 'idiomas',
  languages: 'idiomas',
  presentear: 'presentear',
  gift: 'presentear',
  'saiba-mais': 'saiba-mais',
  'learn-more': 'saiba-mais',
  about: 'saiba-mais',
  ajuda: 'ajuda',
  help: 'ajuda',
  sair: 'sair',
  logout: 'sair',
};

function resolveSettingsSection(raw: string | null | undefined): SettingsSectionKey {
  if (!raw) {
    return DEFAULT_SETTINGS_SECTION;
  }
  return SETTINGS_SECTION_ALIASES[raw] || DEFAULT_SETTINGS_SECTION;
}

function StatusBadge({ status }: { status: string }) {
  const st = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        background: st.bg,
        borderRadius: 4,
      }}
    >
      <span style={{ color: st.color }}>{st.icon(10)}</span>
      <span style={{ fontSize: 9, fontWeight: 600, color: st.color, fontFamily: SORA }}>
        {st.label}
      </span>
    </div>
  );
}

// ═══ REUSABLE FIELD ═══

function Field({
  label,
  placeholder,
  value,
  onChange,
  onBlur: onBlurProp,
  type = 'text',
  mono = false,
  half = false,
  required = true,
  disabled = false,
  rows,
  suffix,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  type?: string;
  mono?: boolean;
  half?: boolean;
  required?: boolean;
  disabled?: boolean;
  rows?: number;
  suffix?: React.ReactNode;
}) {
  const baseStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    background: disabled ? 'var(--app-bg-primary)' : 'var(--app-bg-input)',
    border: '1px solid var(--app-border-primary)',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: mono ? MONO : SORA,
    color: disabled ? 'var(--app-text-placeholder)' : 'var(--app-text-primary)',
    boxSizing: 'border-box' as const,
    transition: 'border-color .15s',
    outline: 'none',
    cursor: disabled ? 'not-allowed' : 'text',
    resize: 'none' as const,
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!disabled) {
      e.currentTarget.style.borderColor = EMBER;
      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(232,93,48,.06)';
    }
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = 'var(--app-border-primary)';
    e.currentTarget.style.boxShadow = 'none';
    onBlurProp?.();
  };

  const fieldId = useId();

  return (
    <div style={{ flex: half ? 1 : 'none', width: half ? 'auto' : '100%' }}>
      <label
        htmlFor={`${fieldId}-input`}
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--app-text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginBottom: 6,
          fontFamily: SORA,
        }}
      >
        {label} {required && <span style={{ color: EMBER, fontSize: 8 }}>*</span>}
      </label>
      <div style={{ position: 'relative' as const }}>
        {rows ? (
          <textarea
            id={`${fieldId}-input`}
            aria-label={label}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            rows={rows}
            style={baseStyle}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        ) : (
          <input
            id={`${fieldId}-input`}
            aria-label={label}
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            style={baseStyle}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        )}
        {suffix && (
          <span
            style={{
              position: 'absolute' as const,
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// ═══ SAVE BUTTON ═══

function SaveButton({
  saving,
  onClick,
  label = 'Salvar alteracoes',
}: {
  saving: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      style={{
        padding: '11px 28px',
        background: saving ? 'var(--app-text-placeholder)' : EMBER,
        border: 'none',
        borderRadius: 6,
        color: 'var(--app-text-on-accent)',
        fontSize: 13,
        fontWeight: 600,
        cursor: saving ? 'not-allowed' : 'pointer',
        fontFamily: SORA,
        transition: 'all 150ms ease',
        opacity: saving ? 0.7 : 1,
      }}
    >
      {saving ? 'Salvando...' : label}
    </button>
  );
}

// ═══ SAVE STATUS ROW ═══
// Shared inline status label + error message used by every editable section.
// Extracted to reduce per-section render complexity (Lizard CCN hotspots).

function SaveStatusLabel({ status }: { status: 'idle' | 'success' | 'error' }) {
  if (status === 'success') {
    return (
      <span style={{ fontSize: 12, fontWeight: 600, color: '#10B981', fontFamily: SORA }}>
        {kloelT(`Salvo!`)}
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span style={{ fontSize: 12, fontWeight: 600, color: '#EF4444', fontFamily: SORA }}>
        {kloelT(`Erro ao salvar`)}
      </span>
    );
  }
  return null;
}

function ErrorText({ message }: { message: string | null | undefined }) {
  if (!message) {
    return null;
  }
  return (
    <span
      style={{
        fontSize: 11,
        color: '#EF4444',
        marginTop: 8,
        display: 'block',
        fontFamily: SORA,
      }}
    >
      {message}
    </span>
  );
}

function SaveActions({
  error,
  saveStatus,
  saving,
  onSave,
}: {
  error: string | null | undefined;
  saveStatus: 'idle' | 'success' | 'error';
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <>
      <ErrorText message={error} />
      <div
        style={{
          marginTop: 20,
          display: 'flex',
          justifyContent: 'flex-end' as const,
          alignItems: 'center',
          gap: 12,
        }}
      >
        <SaveStatusLabel status={saveStatus} />
        <SaveButton saving={saving} onClick={onSave} />
      </div>
    </>
  );
}

// ═══ SECTION CARD WRAPPER ═══

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: 'var(--app-bg-card)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 6,
        padding: 24,
        marginBottom: 16,
      }}
    >
      <h2
        style={{
          fontSize: 15,
          fontWeight: 600,
          margin: 0,
          color: 'var(--app-text-primary)',
          fontFamily: SORA,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--app-text-secondary)',
            margin: '4px 0 0',
            fontFamily: SORA,
          }}
        >
          {subtitle}
        </p>
      )}
      <div style={{ marginTop: 20 }}>{children}</div>
    </div>
  );
}

function ConnectAccountStatusCard({
  isMobile,
  sellerAccount,
  isLoading,
  error,
}: {
  isMobile: boolean;
  sellerAccount: ReturnType<typeof useSellerConnectAccount>['sellerAccount'];
  isLoading: boolean;
  error: unknown;
}) {
  const summary = summarizeSellerConnectAccount(sellerAccount);
  const onboarding = sellerAccount?.onboarding;
  const tone = CONNECT_STATE_CONFIG[summary.state];
  const openRequirements = summary.requirements.slice(0, 5);
  const remainingRequirements = Math.max(summary.requirements.length - openRequirements.length, 0);
  const helperText = sellerAccount
    ? 'Sempre que uma nova pendência for solicitada, ela aparece aqui para regularização dentro do seu fluxo Kloel.'
    : 'Assim que você concluir o cadastro e enviar para análise, esta área passa a mostrar as verificações e liberações da sua conta de recebimento.';
  const metrics = [
    {
      label: 'Cadastro enviado',
      value: onboarding?.detailsSubmitted ? 'Sim' : sellerAccount ? 'Parcial' : 'Não',
    },
    {
      label: 'Recebimentos',
      value: onboarding?.chargesEnabled ? 'Liberados' : sellerAccount ? 'Pendentes' : 'Aguardando',
    },
    {
      label: 'Saques',
      value: onboarding?.payoutsEnabled ? 'Liberados' : sellerAccount ? 'Pendentes' : 'Aguardando',
    },
    {
      label: 'Pendências abertas',
      value: String(summary.requirements.length),
    },
  ];

  return (
    <SectionCard title={kloelT(`Conta de recebimento`)} subtitle={kloelT(summary.description)}>
      {isLoading ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '6px 0',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
                fontFamily: SORA,
              }}
            >
              {kloelT(`Consultando status da conta`)}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--app-text-secondary)',
                fontFamily: SORA,
                marginTop: 4,
              }}
            >
              {kloelT(`Aguarde enquanto validamos as pendências e liberações mais recentes.`)}
            </div>
          </div>
          <PulseLoader width={88} height={18} />
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: isMobile ? 'flex-start' : 'center',
              justifyContent: 'space-between',
              flexDirection: isMobile ? 'column' : 'row',
              gap: 14,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--app-text-secondary)',
                  fontFamily: SORA,
                  textTransform: 'uppercase',
                  letterSpacing: '.04em',
                }}
              >
                {kloelT(`Status atual`)}
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 8,
                  padding: '7px 12px',
                  background: tone.bg,
                  border: `1px solid ${tone.border}`,
                  borderRadius: 999,
                  color: tone.color,
                }}
              >
                {tone.icon(14)}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: tone.color,
                    fontFamily: SORA,
                  }}
                >
                  {kloelT(summary.label)}
                </span>
              </div>
            </div>

            <div
              style={{
                maxWidth: isMobile ? '100%' : 360,
                fontSize: 12,
                lineHeight: 1.6,
                color: 'var(--app-text-secondary)',
                fontFamily: SORA,
              }}
            >
              {kloelT(helperText)}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))',
              gap: 10,
              marginTop: 18,
            }}
          >
            {metrics.map((metric) => (
              <div
                key={metric.label}
                style={{
                  background: 'var(--app-bg-primary)',
                  border: '1px solid var(--app-border-primary)',
                  borderRadius: 6,
                  padding: '12px 14px',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--app-text-secondary)',
                    fontFamily: SORA,
                    textTransform: 'uppercase',
                    letterSpacing: '.04em',
                  }}
                >
                  {kloelT(metric.label)}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--app-text-primary)',
                    fontFamily: SORA,
                    marginTop: 6,
                  }}
                >
                  {kloelT(metric.value)}
                </div>
              </div>
            ))}
          </div>

          {summary.disabledReason && (
            <div
              style={{
                marginTop: 14,
                background: 'rgba(239,68,68,.05)',
                border: '1px solid rgba(239,68,68,.14)',
                borderRadius: 6,
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: '#EF4444',
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: SORA,
                }}
              >
                {Icons.alert(14)}
                {kloelT(`Restrição identificada`)}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: 'var(--app-text-secondary)',
                  fontFamily: SORA,
                }}
              >
                {kloelT(summary.disabledReason)}
              </div>
            </div>
          )}

          {openRequirements.length > 0 && (
            <div
              style={{
                marginTop: 14,
                background: 'rgba(245,158,11,.05)',
                border: '1px solid rgba(245,158,11,.14)',
                borderRadius: 6,
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: '#B45309',
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: SORA,
                }}
              >
                {Icons.alert(14)}
                {kloelT(`Itens que exigem atenção`)}
              </div>
              <ul
                style={{
                  margin: '10px 0 0',
                  paddingLeft: 18,
                  color: 'var(--app-text-secondary)',
                  fontSize: 12,
                  lineHeight: 1.7,
                  fontFamily: SORA,
                }}
              >
                {openRequirements.map((requirement) => (
                  <li key={requirement}>{kloelT(requirement)}</li>
                ))}
              </ul>
              {remainingRequirements > 0 && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: 'var(--app-text-secondary)',
                    fontFamily: SORA,
                  }}
                >
                  {kloelT(`E mais ${remainingRequirements} item(ns) pendente(s).`)}
                </div>
              )}
            </div>
          )}

          {error && (
            <div
              style={{
                marginTop: 14,
                background: 'rgba(239,68,68,.05)',
                border: '1px solid rgba(239,68,68,.14)',
                borderRadius: 6,
                padding: '12px 14px',
                fontSize: 12,
                lineHeight: 1.6,
                color: 'var(--app-text-secondary)',
                fontFamily: SORA,
              }}
            >
              {kloelT(
                getErrorMessage(error) ||
                  'Não foi possível atualizar o status da conta de recebimento agora.',
              )}
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

// ═══ SECTION 1: DADOS PESSOAIS ═══

// Derive uppercase 2-letter initials from a display name (Brazilian UX default).
// Extracted to drop Lizard CCN on sections that render an avatar fallback.
function initialsFromName(name: string): string {
  return (name || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

// Clickable avatar with file picker + hover camera overlay used by DadosPessoaisSection.
// Extracted to simplify the section's render (Lizard CCN).
function AvatarUploader({
  previewUrl,
  fallbackUrl,
  initials,
  fileRef,
  onFileChange,
  displayName,
  displayEmail,
}: {
  previewUrl: string | null;
  fallbackUrl: string | null | undefined;
  initials: string;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  displayName: string;
  displayEmail: string;
}) {
  const imgSrc = previewUrl || fallbackUrl || undefined;
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
      <div
        onClick={() => fileRef.current?.click()}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          width: 72,
          height: 72,
          borderRadius: 6,
          background: 'var(--app-bg-secondary)',
          border: '1px solid var(--app-border-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative' as const,
          cursor: 'pointer',
          padding: 8,
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            (e.currentTarget as HTMLElement).click();
          }
        }}
      >
        {imgSrc ? (
          <Image
            src={imgSrc}
            alt=""
            unoptimized
            width={120}
            height={120}
            style={{
              objectFit: 'contain',
              maxWidth: '100%',
              maxHeight: '100%',
              borderRadius: 4,
              display: 'block',
            }}
          />
        ) : (
          <span
            style={{
              fontFamily: SORA,
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--app-text-tertiary)',
            }}
          >
            {initials}
          </span>
        )}
        <div
          style={{
            position: 'absolute' as const,
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isHovered ? 1 : 0,
            transition: 'opacity .15s',
          }}
        >
          <span style={{ color: 'var(--app-text-primary)' }}>{Icons.camera(18)}</span>
        </div>
      </div>
      <div>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            display: 'block',
            fontFamily: SORA,
          }}
        >
          {displayName}
        </span>
        <span style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
          {displayEmail}
        </span>
      </div>
      <input
        aria-label="Foto de perfil"
        ref={fileRef}
        type="file"
        accept={kloelT(`image/*`)}
        style={{ display: 'none' }}
        onChange={onFileChange}
      />
    </div>
  );
}

function DadosPessoaisSection({
  profile,
  mutate,
}: {
  profile: KycProfile | null;
  mutate: () => void;
}) {
  const { updateProfile, uploadAvatar } = useProfileMutations();
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { previewUrl: avatarPreviewUrl, setPreviewUrl: setAvatarPreviewUrl } =
    usePersistentImagePreview({ storageKey: 'kloel_profile_avatar_preview' });

  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    },
    [],
  );
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    birthDate: '',
  });

  useEffect(() => {
    if (profile) {
      // Normalize birthDate to YYYY-MM-DD for <input type="date">
      let bd = profile.birthDate || '';
      if (bd && bd.length > 10) {
        bd = bd.slice(0, 10);
      }
      setForm({
        name: profile.name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        birthDate: bd,
      });
    }
  }, [profile]);

  const set = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setError('');
    setSaveStatus('idle');
    setSaving(true);
    try {
      await updateProfile(
        cleanPayload({
          name: form.name,
          phone: form.phone,
          birthDate: form.birthDate,
        }),
      );
      setSaveStatus('success');
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 3000);
      mutate();
    } catch (e) {
      setError(getErrorMessage(e) || 'Erro ao salvar. Tente novamente.');
      setSaveStatus('error');
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 4000);
    }
    setSaving(false);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAvatarPreviewUrl(dataUrl);
      await uploadAvatar(file);
      mutate();
    } catch (err) {
      setError(getErrorMessage(err) || 'Erro ao salvar. Tente novamente.');
    }
  };

  const initials = initialsFromName(form.name);

  return (
    <SectionCard
      title={kloelT(`Dados pessoais`)}
      subtitle={kloelT(`Informacoes basicas da sua conta`)}
    >
      {/* Avatar */}
      <AvatarUploader
        previewUrl={avatarPreviewUrl}
        fallbackUrl={profile?.avatarUrl}
        initials={initials}
        fileRef={fileRef}
        onFileChange={handleAvatarChange}
        displayName={form.name || 'Seu nome'}
        displayEmail={form.email}
      />

      {/* Fields */}
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
        <Field
          label={kloelT(`Nome completo`)}
          placeholder={kloelT(`Seu nome completo`)}
          value={form.name}
          onChange={(v) => set('name', v)}
        />
        <Field label={kloelT(`E-mail`)} value={form.email} onChange={() => {}} disabled />
        <Field
          label={kloelT(`Celular`)}
          placeholder={kloelT(`(00) 00000-0000`)}
          value={form.phone}
          onChange={(v) => set('phone', v)}
          mono
        />
        <Field
          label={kloelT(`Data de nascimento`)}
          value={form.birthDate}
          onChange={(v) => set('birthDate', v)}
          type="date"
        />
      </div>

      <SaveActions error={error} saveStatus={saveStatus} saving={saving} onSave={handleSave} />
    </SectionCard>
  );
}

// ═══ SECTION 2: DADOS FISCAIS ═══

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={EMBER}
      strokeWidth={2.5}
      style={{ animation: 'spin 1s linear infinite' }}
      aria-hidden="true"
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d={kloelT(`M12 2a10 10 0 0 1 10 10`)} strokeLinecap="round" />
    </svg>
  );
}

// Normalize a KycFiscal record into the form shape used by DadosFiscaisSection.
// Extracted to drop Lizard CCN on the section's useEffect (many `|| ''` fallbacks).
function fiscalToFormState(fiscal: KycFiscal) {
  return {
    cpf: fiscal.cpf || '',
    legalName: fiscal.fullName || '',
    cnpj: fiscal.cnpj || '',
    razaoSocial: fiscal.razaoSocial || '',
    nomeFantasia: fiscal.nomeFantasia || '',
    inscricaoEstadual: fiscal.inscricaoEstadual || '',
    inscricaoMunicipal: fiscal.inscricaoMunicipal || '',
    responsavelCpf: fiscal.responsavelCpf || '',
    responsavelNome: fiscal.responsavelNome || '',
    cep: fiscal.cep || '',
    rua: fiscal.street || '',
    numero: fiscal.number || '',
    complemento: fiscal.complement || '',
    bairro: fiscal.neighborhood || '',
    cidade: fiscal.city || '',
    uf: fiscal.state || '',
  };
}

function DadosFiscaisSection({ fiscal, mutate }: { fiscal: KycFiscal | null; mutate: () => void }) {
  const { updateFiscal } = useFiscalMutations();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    },
    [],
  );
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [tipo, setTipo] = useState<'PF' | 'PJ'>('PF');
  const [form, setForm] = useState({
    cpf: '',
    legalName: '',
    cnpj: '',
    razaoSocial: '',
    nomeFantasia: '',
    inscricaoEstadual: '',
    inscricaoMunicipal: '',
    responsavelCpf: '',
    responsavelNome: '',
    cep: '',
    rua: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
  });

  useEffect(() => {
    if (fiscal) {
      setTipo(fiscal.type === 'PJ' || fiscal.cnpj ? 'PJ' : 'PF');
      setForm(fiscalToFormState(fiscal));
    }
  }, [fiscal]);

  const set = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  // ── CNPJ auto-fill from BrasilAPI ──
  const lookupCnpj = async (cnpj: string) => {
    const clean = cnpj.replace(D_RE, '');
    if (clean.length !== 14) {
      return;
    }
    setCnpjLoading(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
      if (!res.ok) {
        return;
      }
      const data: BrasilApiCnpjResponse = await res.json();
      setForm((prev) => mergeCnpjIntoForm(prev, data));
    } catch {
      /* API offline, don't block */
    } finally {
      setCnpjLoading(false);
    }
  };

  // ── CEP auto-fill from ViaCEP ──
  const lookupCep = async (cep: string) => {
    const clean = cep.replace(D_RE, '');
    if (clean.length !== 8) {
      return;
    }
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      if (!res.ok) {
        return;
      }
      const data: ViaCepResponse = await res.json();
      if (data.erro) {
        return;
      }
      setForm((prev) => mergeCepIntoForm(prev, data));
    } catch {
      /* API offline */
    } finally {
      setCepLoading(false);
    }
  };

  const handleSave = async () => {
    setError('');
    setSaveStatus('idle');
    setSaving(true);
    try {
      const payload = cleanPayload({
        type: tipo,
        cpf: form.cpf,
        fullName: form.legalName,
        cnpj: form.cnpj,
        razaoSocial: form.razaoSocial,
        nomeFantasia: form.nomeFantasia,
        inscricaoEstadual: form.inscricaoEstadual,
        inscricaoMunicipal: form.inscricaoMunicipal,
        responsavelCpf: form.responsavelCpf,
        responsavelNome: form.responsavelNome,
        cep: form.cep,
        street: form.rua,
        number: form.numero,
        complement: form.complemento,
        neighborhood: form.bairro,
        city: form.cidade,
        state: form.uf,
      });
      await updateFiscal(payload);
      setSaveStatus('success');
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 3000);
      mutate();
    } catch (e) {
      setError(getErrorMessage(e) || 'Erro ao salvar. Tente novamente.');
      setSaveStatus('error');
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 4000);
    }
    setSaving(false);
  };

  const btnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '10px 0',
    background: active ? 'var(--app-accent-light)' : 'transparent',
    border: active ? `1px solid ${EMBER}` : '1px solid var(--app-border-primary)',
    borderRadius: 6,
    color: active ? EMBER : 'var(--app-text-secondary)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: SORA,
    transition: 'all 150ms ease',
  });

  return (
    <SectionCard
      title={kloelT(`Dados fiscais`)}
      subtitle={kloelT(`Informacoes para emissao de notas e compliance`)}
    >
      {/* Type selector */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button type="button" onClick={() => setTipo('PF')} style={btnStyle(tipo === 'PF')}>
          {kloelT(`Pessoa Fisica (CPF)`)}
        </button>
        <button type="button" onClick={() => setTipo('PJ')} style={btnStyle(tipo === 'PJ')}>
          {kloelT(`Pessoa Juridica (CNPJ)`)}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
        {tipo === 'PF' ? (
          <>
            <Field
              label="CPF"
              placeholder="000.000.000-00"
              value={form.cpf}
              onChange={(v) => set('cpf', v)}
              mono
            />
            <Field
              label={kloelT(`Nome legal`)}
              placeholder={kloelT(`Nome conforme documento`)}
              value={form.legalName}
              onChange={(v) => set('legalName', v)}
            />
            {/* Warning */}
            <div
              style={{
                background: 'rgba(245,158,11,.04)',
                border: '1px solid rgba(245,158,11,.15)',
                borderRadius: 6,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}
            >
              <span style={{ color: '#F59E0B', marginTop: 2, flexShrink: 0 }}>
                {Icons.alert(16)}
              </span>
              <div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--app-text-primary)',
                    display: 'block',
                    fontFamily: SORA,
                  }}
                >
                  {kloelT(`Limite de saque para CPF`)}
                </span>
                <span
                  style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}
                >
                  {kloelT(`Como pessoa fisica, o limite de saque mensal e de R$ 2.259,20. Para remover esse
                  limite, cadastre um CNPJ.`)}
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 14 }}>
              <Field
                label="CNPJ"
                placeholder={kloelT(`00.000.000/0000-00`)}
                value={form.cnpj}
                onChange={(v) => {
                  set('cnpj', v);
                  const clean = v.replace(D_RE, '');
                  if (clean.length === 14) {
                    lookupCnpj(v);
                  }
                }}
                onBlur={() => lookupCnpj(form.cnpj)}
                mono
                half
                suffix={cnpjLoading ? <Spinner size={14} /> : undefined}
              />
              <Field
                label={kloelT(`Razao social`)}
                placeholder={kloelT(`Razao social da empresa`)}
                value={form.razaoSocial}
                onChange={(v) => set('razaoSocial', v)}
                half
              />
            </div>
            <div style={{ display: 'flex', gap: 14 }}>
              <Field
                label={kloelT(`Nome fantasia`)}
                placeholder={kloelT(`Nome fantasia`)}
                value={form.nomeFantasia}
                onChange={(v) => set('nomeFantasia', v)}
                half
              />
              <Field
                label={kloelT(`Inscricao estadual`)}
                placeholder={kloelT(`Opcional`)}
                value={form.inscricaoEstadual}
                onChange={(v) => set('inscricaoEstadual', v)}
                half
                required={false}
              />
            </div>
            <Field
              label={kloelT(`Inscricao municipal`)}
              placeholder={kloelT(`Opcional`)}
              value={form.inscricaoMunicipal}
              onChange={(v) => set('inscricaoMunicipal', v)}
              required={false}
            />
            <div style={{ display: 'flex', gap: 14 }}>
              <Field
                label={kloelT(`CPF do responsavel`)}
                placeholder="000.000.000-00"
                value={form.responsavelCpf}
                onChange={(v) => set('responsavelCpf', v)}
                mono
                half
              />
              <Field
                label={kloelT(`Nome do responsavel`)}
                placeholder={kloelT(`Nome completo`)}
                value={form.responsavelNome}
                onChange={(v) => set('responsavelNome', v)}
                half
              />
            </div>
          </>
        )}
      </div>

      {/* Address */}
      <div
        style={{ borderTop: '1px solid var(--app-border-subtle)', marginTop: 24, paddingTop: 20 }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            display: 'block',
            marginBottom: 14,
            fontFamily: SORA,
          }}
        >
          {kloelT(`Endereco fiscal`)}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
          <div style={{ display: 'flex', gap: 14 }}>
            <Field
              label="CEP"
              placeholder="00000-000"
              value={form.cep}
              onChange={(v) => {
                set('cep', v);
                const clean = v.replace(D_RE, '');
                if (clean.length === 8) {
                  lookupCep(v);
                }
              }}
              onBlur={() => lookupCep(form.cep)}
              mono
              half
              suffix={cepLoading ? <Spinner size={14} /> : undefined}
            />
            <Field
              label={kloelT(`Rua`)}
              placeholder={kloelT(`Nome da rua`)}
              value={form.rua}
              onChange={(v) => set('rua', v)}
              half
            />
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <Field
              label={kloelT(`Numero`)}
              placeholder="123"
              value={form.numero}
              onChange={(v) => set('numero', v)}
              mono
              half
            />
            <Field
              label={kloelT(`Complemento`)}
              placeholder={kloelT(`Apt, sala...`)}
              value={form.complemento}
              onChange={(v) => set('complemento', v)}
              half
              required={false}
            />
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <Field
              label={kloelT(`Bairro`)}
              placeholder={kloelT(`Bairro`)}
              value={form.bairro}
              onChange={(v) => set('bairro', v)}
              half
            />
            <Field
              label={kloelT(`Cidade`)}
              placeholder={kloelT(`Cidade`)}
              value={form.cidade}
              onChange={(v) => set('cidade', v)}
              half
            />
          </div>
          <Field label="UF" placeholder="SP" value={form.uf} onChange={(v) => set('uf', v)} />
        </div>
      </div>

      <SaveActions error={error} saveStatus={saveStatus} saving={saving} onSave={handleSave} />
    </SectionCard>
  );
}

// ═══ SECTION 3: DOCUMENTOS ═══

function UploadZone({
  label,
  sublabel,
  type,
  doc,
  inputRef,
  uploading,
  onUpload,
  onDelete,
}: {
  label: string;
  sublabel: string;
  type: string;
  doc: KycDocument | undefined;
  inputRef: React.RefObject<HTMLInputElement | null>;
  uploading: string | null;
  onUpload: (type: string, file: File) => void;
  onDelete: (docId: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const isUploading = uploading === type;

  if (doc) {
    return (
      <div
        style={{
          background: 'var(--app-bg-secondary)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          padding: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ color: 'var(--app-text-secondary)' }}>{Icons.doc(20)}</span>
        <div style={{ flex: 1 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
              display: 'block',
              fontFamily: SORA,
            }}
          >
            {doc.fileName || doc.originalName || label}
          </span>
          <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)', fontFamily: SORA }}>
            {kloelT(`Enviado em`)}{' '}
            {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('pt-BR') : '--'}
          </span>
        </div>
        <StatusBadge status={doc.status || 'pending'} />
        {(doc.status === 'pending' || !doc.status) && (
          <button
            type="button"
            onClick={() => onDelete(doc.id)}
            style={{
              background: 'none',
              border: 'none',
              color: '#EF4444',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            {Icons.trash(14)}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        const file = e.dataTransfer.files[0];
        if (file) {
          onUpload(type, file);
        }
      }}
      style={{
        border: `1px dashed ${hover ? EMBER : 'var(--app-border-primary)'}`,
        borderRadius: 6,
        padding: '28px 20px',
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
        transition: 'all 150ms ease',
        background: hover ? 'rgba(232,93,48,.02)' : 'transparent',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
    >
      <span
        style={{ color: hover ? EMBER : 'var(--app-text-placeholder)', transition: 'color .15s' }}
      >
        {Icons.upload(24)}
      </span>
      <div style={{ textAlign: 'center' as const }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            display: 'block',
            fontFamily: SORA,
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
          {sublabel}
        </span>
      </div>
      {isUploading && (
        <div style={{ marginTop: 2 }}>
          <PulseLoader width={84} height={18} />
        </div>
      )}
      <input
        aria-label={label}
        ref={inputRef}
        type="file"
        accept={kloelT(`image/*,.pdf`)}
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onUpload(type, file);
          }
        }}
      />
    </div>
  );
}

function DocumentosSection({
  documents,
  fiscal,
  mutate,
}: {
  documents: KycDocument[];
  fiscal: KycFiscal | null;
  mutate: () => void;
}) {
  const { uploadDocument, deleteDocument } = useDocumentMutations();
  const idRef = useRef<HTMLInputElement>(null);
  const secondRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const isPJ = fiscal?.type === 'PJ' || !!fiscal?.cnpj;
  const docs: KycDocument[] = Array.isArray(documents) ? documents : [];

  const idDoc = docs.find((d) => d.type === 'DOCUMENT_FRONT');
  const secondDoc = isPJ
    ? docs.find((d) => d.type === 'COMPANY_DOCUMENT')
    : docs.find((d) => d.type === 'PROOF_OF_ADDRESS');

  const handleUpload = async (type: string, file: File) => {
    setError('');
    setUploading(type);
    try {
      await uploadDocument(type, file);
      mutate();
    } catch (e) {
      setError(getErrorMessage(e) || 'Erro ao salvar. Tente novamente.');
    }
    setUploading(null);
  };

  const handleDelete = async (docId: string) => {
    setError('');
    try {
      await deleteDocument(docId);
      mutate();
    } catch (e) {
      setError(getErrorMessage(e) || 'Erro ao salvar. Tente novamente.');
    }
  };

  return (
    <SectionCard
      title={kloelT(`Documentos`)}
      subtitle={kloelT(`Envie os documentos necessarios para verificacao`)}
    >
      <div
        style={{
          background: 'rgba(59,130,246,.04)',
          border: '1px solid rgba(59,130,246,.15)',
          borderRadius: 6,
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <span style={{ color: '#3B82F6', marginTop: 2, flexShrink: 0 }}>{Icons.clock(16)}</span>
        <span style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
          {kloelT(`A analise dos documentos pode levar ate 48 horas uteis. Voce sera notificado por e-mail
          quando o resultado estiver disponivel.`)}
        </span>
      </div>

      {error && (
        <span
          style={{
            fontSize: 11,
            color: '#EF4444',
            marginTop: 8,
            display: 'block',
            fontFamily: SORA,
          }}
        >
          {error}
        </span>
      )}
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
        <UploadZone
          label={kloelT(`Documento de identidade`)}
          sublabel={kloelT(`RG, CNH ou Passaporte`)}
          type="DOCUMENT_FRONT"
          doc={idDoc}
          inputRef={idRef}
          uploading={uploading}
          onUpload={handleUpload}
          onDelete={handleDelete}
        />
        <UploadZone
          label={isPJ ? 'Contrato social ou cartao CNPJ' : 'Comprovante de residencia'}
          sublabel={isPJ ? 'Documento da empresa' : 'Conta de luz, agua, internet (ate 90 dias)'}
          type={isPJ ? 'COMPANY_DOCUMENT' : 'PROOF_OF_ADDRESS'}
          doc={secondDoc}
          inputRef={secondRef}
          uploading={uploading}
          onUpload={handleUpload}
          onDelete={handleDelete}
        />
      </div>
    </SectionCard>
  );
}

// ═══ SECTION 4: DADOS BANCARIOS ═══

// Single row in the bank dropdown list. Extracted to reduce CCN of
// DadosBancariosSection's render (Lizard hotspot).
function BankListItem({
  bank,
  code3,
  isSelected,
  onSelect,
}: {
  bank: (typeof BRAZILIAN_BANKS)[number];
  code3: string;
  isSelected: boolean;
  onSelect: (bank: (typeof BRAZILIAN_BANKS)[number]) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(bank)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        background: isSelected ? 'rgba(232,93,48,0.06)' : 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--app-border-subtle)',
        cursor: 'pointer',
        textAlign: 'left' as const,
        transition: 'background .1s',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLElement).style.background = 'var(--app-bg-hover)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
        }
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 600,
            color: EMBER,
            width: 32,
            flexShrink: 0,
          }}
        >
          {code3}
        </span>
        <span
          style={{
            fontSize: 12,
            color: 'var(--app-text-primary)',
            fontFamily: SORA,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {bank.fullName}
        </span>
      </div>
      {isSelected && <span style={{ color: EMBER, flexShrink: 0 }}>{Icons.check(14)}</span>}
    </button>
  );
}

// Normalize a KycBankAccount record into the form shape used by DadosBancariosSection.
// Extracted to drop Lizard CCN on the section's bankAccount sync useEffect.
function bankAccountToFormState(
  bankAccount: KycBankAccount,
  autoHolderName: string,
  autoHolderDoc: string,
) {
  return {
    bankName: bankAccount.bankName || '',
    bankCode: bankAccount.bankCode || '',
    agency: bankAccount.agency || '',
    account: bankAccount.account || '',
    accountType: bankAccount.accountType || 'CHECKING',
    pixKey: bankAccount.pixKey || '',
    pixKeyType: bankAccount.pixKeyType || '',
    holderName: bankAccount.holderName || autoHolderName,
    holderDocument: bankAccount.holderDocument || autoHolderDoc,
  };
}

// Floating panel with search input and bank list. Extracted from DadosBancariosSection's
// render to lower Lizard CCN; behaviour and DOM structure are identical.
function BankDropdownPanel({
  bankSearch,
  onBankSearchChange,
  searchTerm,
  showAllBanks,
  onShowAllBanks,
  filteredBanks,
  selectedCode,
  onSelectBank,
}: {
  bankSearch: string;
  onBankSearchChange: (v: string) => void;
  searchTerm: string;
  showAllBanks: boolean;
  onShowAllBanks: () => void;
  filteredBanks: typeof BRAZILIAN_BANKS;
  selectedCode: string;
  onSelectBank: (bank: (typeof BRAZILIAN_BANKS)[number]) => void;
}) {
  const autoFocusRef = useCallback((element: HTMLInputElement | null) => {
    if (!element) {
      return;
    }
    requestAnimationFrame(() => {
      element.focus();
    });
  }, []);

  return (
    <div
      style={{
        position: 'absolute' as const,
        top: '100%',
        left: 0,
        right: 0,
        marginTop: 4,
        zIndex: 100,
        background: 'var(--app-bg-card)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 6,
        boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
        maxHeight: 280,
        display: 'flex',
        flexDirection: 'column' as const,
      }}
    >
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--app-border-subtle)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--app-bg-primary)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 4,
            padding: '6px 10px',
          }}
        >
          <svg
            width={13}
            height={13}
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--app-text-placeholder)"
            strokeWidth={2}
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            aria-label="Buscar banco ou codigo"
            value={bankSearch}
            onChange={(e) => onBankSearchChange(e.target.value)}
            placeholder={kloelT(`Buscar banco ou codigo...`)}
            ref={autoFocusRef}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--app-text-primary)',
              fontSize: 12,
              fontFamily: SORA,
            }}
          />
        </div>
      </div>
      <div style={{ overflowY: 'auto' as const, flex: 1, maxHeight: 220 }}>
        {!searchTerm && !showAllBanks && (
          <div
            style={{
              padding: '6px 14px 2px',
              fontSize: 9,
              fontWeight: 600,
              color: 'var(--app-text-tertiary)',
              letterSpacing: '.06em',
              textTransform: 'uppercase' as const,
              fontFamily: SORA,
            }}
          >
            {kloelT(`Mais populares`)}
          </div>
        )}
        {filteredBanks.length === 0 ? (
          <div
            style={{
              padding: '16px 14px',
              textAlign: 'center' as const,
              color: 'var(--app-text-tertiary)',
              fontSize: 12,
              fontFamily: SORA,
            }}
          >
            {kloelT(`Nenhum banco encontrado`)}
          </div>
        ) : (
          filteredBanks.map((bank) => {
            const code3 = formatBankCode(bank.code);
            return (
              <BankListItem
                key={`${bank.code}-${bank.ispb}`}
                bank={bank}
                code3={code3}
                isSelected={selectedCode === code3}
                onSelect={onSelectBank}
              />
            );
          })
        )}
        {!searchTerm && !showAllBanks && (
          <button
            type="button"
            onClick={onShowAllBanks}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: 'none',
              border: 'none',
              borderTop: '1px solid var(--app-border-primary)',
              color: EMBER,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: SORA,
              textAlign: 'center' as const,
            }}
          >
            {kloelT(`Ver todos os bancos`)}
          </button>
        )}
      </div>
    </div>
  );
}

function DadosBancariosSection({
  bankAccount,
  fiscal,
  profile,
  mutate,
}: {
  bankAccount: KycBankAccount | null;
  fiscal: KycFiscal | null;
  profile: KycProfile | null;
  mutate: () => void;
}) {
  const fid = useId();
  const { updateBank } = useBankMutations();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    },
    [],
  );
  const [form, setForm] = useState({
    bankName: '',
    bankCode: '',
    agency: '',
    account: '',
    accountType: 'CHECKING',
    pixKey: '',
    pixKeyType: '',
    holderName: '',
    holderDocument: '',
  });

  // Bank dropdown state
  const [bankSearch, setBankSearch] = useState('');
  const [bankDropdownOpen, setBankDropdownOpen] = useState(false);
  const [showAllBanks, setShowAllBanks] = useState(false);
  const bankRef = useRef<HTMLDivElement>(null);

  // Remove accents for search (itau → matches Itaú)
  const normalize = (s: string) => s.normalize('NFD').replace(U0300__U036F_RE, '').toLowerCase();

  const searchTerm = bankSearch.trim();
  const filteredBanks = bankDropdownOpen
    ? searchTerm
      ? BRAZILIAN_BANKS.filter((b) => {
          const q = normalize(searchTerm);
          return (
            normalize(b.fullName).includes(q) ||
            normalize(b.name).includes(q) ||
            formatBankCode(b.code).includes(searchTerm) ||
            String(b.code) === searchTerm
          );
        })
      : showAllBanks
        ? BRAZILIAN_BANKS
        : BRAZILIAN_BANKS.filter((b) => POPULAR_BANK_CODES.has(b.code))
    : [];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bankRef.current && !bankRef.current.contains(e.target as Node)) {
        setBankDropdownOpen(false);
        setBankSearch('');
        setShowAllBanks(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectBank = (bank: (typeof BRAZILIAN_BANKS)[number]) => {
    setForm((prev) => ({ ...prev, bankName: bank.fullName, bankCode: formatBankCode(bank.code) }));
    setBankSearch('');
    setBankDropdownOpen(false);
  };

  // Resolve holder from fiscal type: PJ → razão social + CNPJ, PF → nome + CPF
  const isPJ = fiscal?.type === 'PJ' || !!fiscal?.cnpj;
  const autoHolderName = isPJ
    ? fiscal?.razaoSocial || fiscal?.nomeFantasia || ''
    : profile?.name || fiscal?.fullName || '';
  const autoHolderDoc = isPJ ? fiscal?.cnpj || '' : fiscal?.cpf || profile?.documentNumber || '';

  useEffect(() => {
    if (bankAccount) {
      setForm(bankAccountToFormState(bankAccount, autoHolderName, autoHolderDoc));
    } else {
      setForm((prev) => ({
        ...prev,
        holderName: autoHolderName || prev.holderName,
        holderDocument: autoHolderDoc || prev.holderDocument,
      }));
    }
  }, [bankAccount, autoHolderName, autoHolderDoc]);

  const set = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setError('');
    setSaveStatus('idle');
    if (!form.bankName || !form.bankCode) {
      setError('Selecione um banco da lista.');
      return;
    }
    setSaving(true);
    try {
      await updateBank(cleanPayload(form));
      setSaveStatus('success');
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 3000);
      mutate();
    } catch (e) {
      setError(getErrorMessage(e) || 'Erro ao salvar. Tente novamente.');
      setSaveStatus('error');
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 4000);
    }
    setSaving(false);
  };

  const acctTypes = [
    { key: 'CHECKING', label: 'Conta corrente' },
    { key: 'SAVINGS', label: 'Conta poupanca' },
    { key: 'PAYMENT', label: 'Conta pagamento' },
  ];

  const acctBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '9px 0',
    background: active ? 'var(--app-accent-light)' : 'transparent',
    border: active ? `1px solid ${EMBER}` : '1px solid var(--app-border-primary)',
    borderRadius: 6,
    color: active ? EMBER : 'var(--app-text-secondary)',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: SORA,
    transition: 'all 150ms ease',
  });

  return (
    <SectionCard
      title={kloelT(`Dados bancarios`)}
      subtitle={kloelT(`Conta para recebimento de saques`)}
    >
      {/* Account type */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {acctTypes.map((t) => (
          <button
            type="button"
            key={t.key}
            onClick={() => set('accountType', t.key)}
            style={acctBtnStyle(form.accountType === t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          {/* Bank — searchable dropdown */}
          <div ref={bankRef} style={{ flex: 1, position: 'relative' as const }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--app-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                marginBottom: 6,
                fontFamily: SORA,
              }}
            >
              {kloelT(`Banco`)} <span style={{ color: EMBER, fontSize: 8 }}>*</span>
            </span>
            <button
              type="button"
              onClick={() => setBankDropdownOpen(true)}
              aria-haspopup="listbox"
              aria-expanded={bankDropdownOpen}
              aria-label="Selecionar banco"
              style={{
                width: '100%',
                padding: '11px 14px',
                background: 'var(--app-bg-card)',
                border: `1px solid ${bankDropdownOpen ? EMBER : 'var(--app-border-primary)'}`,
                boxShadow: bankDropdownOpen ? '0 0 0 3px rgba(232,93,48,.06)' : 'none',
                borderRadius: 6,
                fontSize: 13,
                fontFamily: SORA,
                color: 'var(--app-text-primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'border-color .15s, box-shadow .15s',
                boxSizing: 'border-box' as const,
                textAlign: 'inherit' as const,
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: form.bankName ? 'var(--app-text-primary)' : 'var(--app-text-placeholder)',
                }}
              >
                {form.bankName ? `${form.bankCode} — ${form.bankName}` : 'Selecione o banco'}
              </span>
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--app-text-secondary)"
                strokeWidth={2}
                style={{
                  transform: bankDropdownOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform .15s',
                  flexShrink: 0,
                }}
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {bankDropdownOpen && (
              <BankDropdownPanel
                bankSearch={bankSearch}
                onBankSearchChange={setBankSearch}
                searchTerm={searchTerm}
                showAllBanks={showAllBanks}
                onShowAllBanks={() => setShowAllBanks(true)}
                filteredBanks={filteredBanks}
                selectedCode={form.bankCode}
                onSelectBank={selectBank}
              />
            )}
          </div>

          {/* Bank code — auto-filled, read-only */}
          <div style={{ flex: 1 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--app-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                marginBottom: 6,
                fontFamily: SORA,
              }}
            >
              {kloelT(`Codigo do banco`)} <span style={{ color: EMBER, fontSize: 8 }}>*</span>
            </span>
            <div
              style={{
                width: '100%',
                padding: '11px 14px',
                background: 'var(--app-bg-primary)',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                fontSize: 13,
                fontFamily: MONO,
                color: form.bankCode ? 'var(--app-text-primary)' : 'var(--app-text-placeholder)',
                boxSizing: 'border-box' as const,
              }}
            >
              {form.bankCode || '---'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14 }}>
          <Field
            label={kloelT(`Agencia`)}
            placeholder="0000"
            value={form.agency}
            onChange={(v) => set('agency', v)}
            mono
            half
          />
          <Field
            label={kloelT(`Conta`)}
            placeholder="00000-0"
            value={form.account}
            onChange={(v) => set('account', v)}
            mono
            half
          />
        </div>

        {/* Titular — auto-filled from profile, read-only */}
        <div style={{ display: 'flex', gap: 14 }}>
          <Field
            label={kloelT(`Titular da conta`)}
            placeholder={kloelT(`Nome completo do titular`)}
            value={form.holderName}
            onChange={(v) => set('holderName', v)}
            half
            disabled
          />
          <Field
            label={kloelT(`CPF/CNPJ do titular`)}
            placeholder="000.000.000-00"
            value={form.holderDocument}
            onChange={(v) => set('holderDocument', v)}
            mono
            half
            disabled
          />
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: 'rgba(232,93,48,0.04)',
            border: '1px solid rgba(232,93,48,0.1)',
            borderRadius: 6,
            marginTop: -4,
          }}
        >
          {Icons.shield(12)}
          <span style={{ fontSize: 10, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
            {isPJ
              ? 'Titular preenchido com a razao social e CNPJ dos dados fiscais. A conta deve ser da mesma titularidade.'
              : 'Titular preenchido com seus dados cadastrais. A conta bancaria deve ser de mesma titularidade.'}
          </span>
        </div>

        {/* PIX */}
        <div
          style={{ borderTop: '1px solid var(--app-border-subtle)', marginTop: 10, paddingTop: 16 }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
              display: 'block',
              marginBottom: 14,
              fontFamily: SORA,
            }}
          >
            {kloelT(`PIX (opcional)`)}
          </span>
          <div style={{ display: 'flex', gap: 14 }}>
            <Field
              label={kloelT(`Chave PIX`)}
              placeholder={kloelT(`E-mail, CPF, celular ou chave aleatoria`)}
              value={form.pixKey}
              onChange={(v) => set('pixKey', v)}
              half
              required={false}
            />
            <div style={{ flex: 1 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--app-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  marginBottom: 6,
                  fontFamily: SORA,
                }}
                htmlFor={`${fid}-tipo-chave`}
              >
                {kloelT(`Tipo da chave`)}
              </label>
              <select
                value={form.pixKeyType}
                onChange={(e) => set('pixKeyType', e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  background: 'var(--app-bg-card)',
                  border: '1px solid var(--app-border-primary)',
                  borderRadius: 6,
                  fontSize: 13,
                  fontFamily: SORA,
                  color: 'var(--app-text-primary)',
                  outline: 'none',
                  cursor: 'pointer',
                  appearance: 'none' as const,
                }}
                id={`${fid}-tipo-chave`}
              >
                <option value="">{kloelT(`Selecione...`)}</option>
                <option value="CPF">CPF</option>
                <option value="CNPJ">CNPJ</option>
                <option value="EMAIL">{kloelT(`E-mail`)}</option>
                <option value="PHONE">{kloelT(`Celular`)}</option>
                <option value="RANDOM">{kloelT(`Aleatoria`)}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Info box */}
      <div
        style={{
          marginTop: 20,
          background: isPJ ? 'rgba(16,185,129,.04)' : 'rgba(245,158,11,.04)',
          border: `1px solid ${isPJ ? 'rgba(16,185,129,.15)' : 'rgba(245,158,11,.15)'}`,
          borderRadius: 6,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <span style={{ color: isPJ ? '#10B981' : '#F59E0B', marginTop: 2, flexShrink: 0 }}>
          {isPJ ? Icons.check(16) : Icons.alert(16)}
        </span>
        <div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
              display: 'block',
              fontFamily: SORA,
            }}
          >
            {isPJ ? 'Saque ilimitado' : 'Limite de saque mensal'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
            {isPJ
              ? 'Contas CNPJ nao possuem limite de saque mensal.'
              : 'Como pessoa fisica, o limite de saque e de R$ 2.259,20/mes. Cadastre um CNPJ para remover o limite.'}
          </span>
        </div>
      </div>

      <SaveActions error={error} saveStatus={saveStatus} saving={saving} onSave={handleSave} />
    </SectionCard>
  );
}

// ═══ SECTION 5: SEGURANCA ═══

function SegurancaSection() {
  const { changePassword } = useSecurityMutations();
  const [saving, setSaving] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const setPw = (k: string, v: string) => setPwForm((prev) => ({ ...prev, [k]: v }));

  const handleChangePw = async () => {
    setPwError('');
    setPwSuccess(false);
    if (pwForm.newPw !== pwForm.confirm) {
      setPwError('As senhas nao coincidem.');
      return;
    }
    if (pwForm.newPw.length < 8) {
      setPwError('A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }
    setSaving(true);
    try {
      await changePassword(pwForm.current, pwForm.newPw);
      setPwForm({ current: '', newPw: '', confirm: '' });
      setPwSuccess(true);
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (e) {
      setPwError(getErrorMessage(e) || 'Erro ao alterar senha. Verifique a senha atual.');
    }
    setSaving(false);
  };

  return (
    <>
      {/* Password card */}
      <SectionCard
        title={kloelT(`Alterar senha`)}
        subtitle={kloelT(`Use uma senha forte com pelo menos 8 caracteres`)}
      >
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
          <Field
            label={kloelT(`Senha atual`)}
            placeholder={kloelT(`Digite a senha atual`)}
            value={pwForm.current}
            onChange={(v) => setPw('current', v)}
            type="password"
          />
          <Field
            label={kloelT(`Nova senha`)}
            placeholder={kloelT(`Minimo 8 caracteres`)}
            value={pwForm.newPw}
            onChange={(v) => setPw('newPw', v)}
            type="password"
          />
          <Field
            label={kloelT(`Confirmar nova senha`)}
            placeholder={kloelT(`Repita a nova senha`)}
            value={pwForm.confirm}
            onChange={(v) => setPw('confirm', v)}
            type="password"
          />
        </div>
        {pwError && (
          <span
            style={{
              fontSize: 11,
              color: '#EF4444',
              marginTop: 8,
              display: 'block',
              fontFamily: SORA,
            }}
          >
            {pwError}
          </span>
        )}
        <div
          style={{
            marginTop: 20,
            display: 'flex',
            justifyContent: 'flex-end' as const,
            alignItems: 'center',
            gap: 12,
          }}
        >
          {pwSuccess && (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#10B981', fontFamily: SORA }}>
              {kloelT(`Senha alterada!`)}
            </span>
          )}
          <SaveButton saving={saving} onClick={handleChangePw} label={kloelT(`Alterar senha`)} />
        </div>
      </SectionCard>

      {/* 2FA card */}
      <SectionCard
        title={kloelT(`Autenticacao em dois fatores`)}
        subtitle={kloelT(`Adicione uma camada extra de seguranca a sua conta`)}
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--app-text-placeholder)',
              }}
            />
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
                fontFamily: SORA,
              }}
            >
              {kloelT(`Ainda indisponivel nesta conta`)}
            </span>
          </div>
          <p
            style={{
              fontSize: 12,
              color: 'var(--app-text-secondary)',
              fontFamily: SORA,
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            {kloelT(`Enquanto isso, mantenha uma senha forte e acompanhe acessos suspeitos pelo seu e-mail de
            cadastro.`)}
          </p>
        </div>
      </SectionCard>

      {/* Sessions card */}
      <SectionCard
        title={kloelT(`Sessoes ativas`)}
        subtitle={kloelT(`Gerencie os dispositivos conectados a sua conta`)}
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--app-text-placeholder)',
              }}
            />
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
                fontFamily: SORA,
              }}
            >
              {kloelT(`Visao unificada ainda nao disponivel`)}
            </span>
          </div>
          <p
            style={{
              fontSize: 12,
              color: 'var(--app-text-secondary)',
              fontFamily: SORA,
              lineHeight: 1.5,
            }}
          >
            {kloelT(`Esta area sera usada para listar dispositivos e permitir revogar acessos sem sair do
            painel principal.`)}
          </p>
        </div>
      </SectionCard>
    </>
  );
}

// ═══ SECTION 6: NOTIFICACOES ═══

function NotificacoesSection() {
  return (
    <SectionCard
      title={kloelT(`Notificacoes`)}
      subtitle={kloelT(`Escolha como deseja ser notificado`)}
    >
      <div style={{ padding: '16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
              fontFamily: SORA,
            }}
          >
            {kloelT(`Notificacoes por e-mail ativas`)}
          </span>
        </div>
        <p
          style={{
            fontSize: 12,
            color: 'var(--app-text-secondary)',
            fontFamily: SORA,
            lineHeight: 1.5,
          }}
        >
          {kloelT(`Hoje o Kloel envia avisos de vendas e atualizacoes de conta por e-mail. Quando as
          preferencias granulares forem liberadas, elas aparecerão aqui sem mudar o fluxo da sua
          conta.`)}
        </p>
      </div>
    </SectionCard>
  );
}

// ═══ SECTION 7: PERFIL PUBLICO ═══

function PerfilPublicoSection({
  profile,
  mutate,
}: {
  profile: KycProfile | null;
  mutate: () => void;
}) {
  const { updateProfile } = useProfileMutations();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { previewUrl: avatarPreviewUrl } = usePersistentImagePreview({
    storageKey: 'kloel_profile_avatar_preview',
  });

  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    },
    [],
  );
  const [form, setForm] = useState({
    publicName: '',
    bio: '',
    website: '',
    instagram: '',
  });

  useEffect(() => {
    if (profile) {
      setForm({
        publicName: profile.publicName || profile.name || '',
        bio: profile.bio || '',
        website: profile.website || '',
        instagram: profile.instagram || '',
      });
    }
  }, [profile]);

  const set = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setError(null);
    setSaveStatus('idle');
    setSaving(true);
    try {
      await updateProfile(
        cleanPayload({
          publicName: form.publicName,
          bio: form.bio,
          website: form.website,
          instagram: form.instagram,
        }),
      );
      setSaveStatus('success');
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 3000);
      mutate();
    } catch (err) {
      setError(getErrorMessage(err) || 'Erro ao salvar. Tente novamente.');
      setSaveStatus('error');
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 4000);
    }
    setSaving(false);
  };

  const initials = initialsFromName(form.publicName);

  return (
    <>
      <SectionCard
        title={kloelT(`Perfil publico`)}
        subtitle={kloelT(`Informacoes visiveis para compradores e afiliados`)}
      >
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
          <Field
            label={kloelT(`Nome publico`)}
            placeholder={kloelT(`Como voce quer ser conhecido`)}
            value={form.publicName}
            onChange={(v) => set('publicName', v)}
          />
          <Field
            label={kloelT(`Bio`)}
            placeholder={kloelT(`Uma breve descricao sobre voce ou seu negocio`)}
            value={form.bio}
            onChange={(v) => set('bio', v)}
            rows={3}
            required={false}
          />
          <div style={{ display: 'flex', gap: 14 }}>
            <Field
              label={kloelT(`Website`)}
              placeholder="https://seusite.com"
              value={form.website}
              onChange={(v) => set('website', v)}
              half
              required={false}
            />
            <Field
              label={kloelT(`Instagram`)}
              placeholder={kloelT(`@seuusuario`)}
              value={form.instagram}
              onChange={(v) => set('instagram', v)}
              half
              required={false}
            />
          </div>
        </div>

        <SaveActions error={error} saveStatus={saveStatus} saving={saving} onSave={handleSave} />
      </SectionCard>

      {/* Preview card */}
      <SectionCard
        title={kloelT(`Pre-visualizacao`)}
        subtitle={kloelT(`Como seu perfil aparece para os outros`)}
      >
        <div
          style={{
            background: 'var(--app-bg-secondary)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 6,
              background: 'var(--app-bg-primary)',
              border: '1px solid var(--app-border-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 6,
            }}
          >
            {avatarPreviewUrl || profile?.avatarUrl ? (
              <Image
                src={avatarPreviewUrl || profile?.avatarUrl || ''}
                alt=""
                unoptimized
                width={224}
                height={224}
                style={{
                  objectFit: 'contain',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  borderRadius: 6,
                  display: 'block',
                }}
              />
            ) : (
              <span
                style={{
                  fontFamily: SORA,
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--app-text-tertiary)',
                }}
              >
                {initials}
              </span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--app-text-primary)',
                display: 'block',
                fontFamily: SORA,
              }}
            >
              {form.publicName || 'Seu nome'}
            </span>
            {form.bio && (
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--app-text-secondary)',
                  display: 'block',
                  marginTop: 2,
                  fontFamily: SORA,
                }}
              >
                {form.bio}
              </span>
            )}
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              {form.website && (
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--app-text-tertiary)',
                    fontFamily: SORA,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {Icons.globe(10)} {form.website.replace(HTTPS_RE, '')}
                </span>
              )}
              {form.instagram && (
                <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)', fontFamily: SORA }}>
                  {form.instagram}
                </span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right' as const }}>
            <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600, color: EMBER }}>0</span>
            <span
              style={{
                fontSize: 9,
                color: 'var(--app-text-tertiary)',
                display: 'block',
                fontFamily: SORA,
              }}
            >
              produtos
            </span>
          </div>
        </div>
      </SectionCard>
    </>
  );
}

// ═══ SECTION 8: IDIOMAS ═══

interface LanguageDef {
  key: string;
  label: string;
  code: string;
  disabled: boolean;
}

const LANGUAGES: ReadonlyArray<LanguageDef> = [
  { key: 'pt-BR', label: 'Portugues (BR)', code: 'BR', disabled: false },
  { key: 'en', label: 'English', code: 'EN', disabled: true },
  { key: 'es', label: 'Espanol', code: 'ES', disabled: true },
];

// Extracted from IdiomasSection's .map callback to lower render CCN.
function LanguageOption({
  lang,
  isActive,
  onActivate,
}: {
  lang: LanguageDef;
  isActive: boolean;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!lang.disabled) {
          onActivate();
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 18px',
        background: isActive
          ? 'var(--app-accent-light)'
          : lang.disabled
            ? 'var(--app-bg-primary)'
            : 'var(--app-bg-card)',
        border: isActive ? `1px solid ${EMBER}` : '1px solid var(--app-border-primary)',
        borderRadius: 8,
        cursor: lang.disabled ? 'not-allowed' : 'pointer',
        transition: 'all 150ms ease',
        textAlign: 'left' as const,
        fontFamily: SORA,
        opacity: lang.disabled ? 0.5 : 1,
        width: '100%',
      }}
    >
      {/* Radio indicator */}
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: isActive ? `2px solid ${EMBER}` : '2px solid var(--app-text-placeholder)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'border-color 150ms ease',
        }}
      >
        {isActive && (
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: EMBER }} />
        )}
      </div>
      <span
        style={{
          fontSize: 10,
          lineHeight: '16px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase' as const,
          color: '#8A8A91',
          minWidth: 24,
          flexShrink: 0,
        }}
      >
        {lang.code}
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: isActive ? 600 : 400,
          color: isActive ? 'var(--app-text-primary)' : 'var(--app-text-secondary)',
          flex: 1,
        }}
      >
        {lang.label}
      </span>
      {lang.disabled && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: EMBER,
            background: 'rgba(232,93,48,0.1)',
            padding: '2px 8px',
            borderRadius: 4,
            textTransform: 'uppercase' as const,
            fontFamily: SORA,
            flexShrink: 0,
          }}
        >
          {kloelT(`Planejado`)}
        </span>
      )}
      {isActive && !lang.disabled && (
        <span style={{ color: EMBER, flexShrink: 0 }}>{Icons.check(14)}</span>
      )}
    </button>
  );
}

function IdiomasSection() {
  const [language, setLanguage] = useState(() => {
    if (typeof window === 'undefined') {
      return 'pt-BR';
    }
    return localStorage.getItem('kloel:language') || 'pt-BR';
  });

  const handleChange = (value: string) => {
    setLanguage(value);
    localStorage.setItem('kloel:language', value);
  };

  return (
    <SectionCard
      title={kloelT(`Idiomas`)}
      subtitle={kloelT(`Selecione o idioma de preferencia da plataforma`)}
    >
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
        {LANGUAGES.map((lang) => (
          <LanguageOption
            key={lang.key}
            lang={lang}
            isActive={language === lang.key}
            onActivate={() => handleChange(lang.key)}
          />
        ))}
      </div>
      <div
        style={{
          marginTop: 16,
          background: 'rgba(59,130,246,.04)',
          border: '1px solid rgba(59,130,246,.15)',
          borderRadius: 6,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <span style={{ color: '#3B82F6', marginTop: 2, flexShrink: 0 }}>{Icons.clock(16)}</span>
        <span style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
          {kloelT(`A traducao completa da plataforma esta em andamento. Algumas secoes podem permanecer em
          portugues temporariamente.`)}
        </span>
      </div>
    </SectionCard>
  );
}

// ═══ SECTION 9: AJUDA ═══

// Single FAQ entry extracted from AjudaSection's .map callback to reduce CCN.
function FaqItem({
  question,
  answer,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        background: 'var(--app-bg-secondary)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          fontFamily: SORA,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            textAlign: 'left' as const,
          }}
        >
          {question}
        </span>
        <span
          style={{
            color: 'var(--app-text-tertiary)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform .15s',
            flexShrink: 0,
            marginLeft: 8,
          }}
        >
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      {isOpen && (
        <div
          style={{
            padding: '0 16px 12px',
            fontSize: 11,
            color: 'var(--app-text-secondary)',
            lineHeight: 1.6,
            fontFamily: SORA,
          }}
        >
          {answer}
        </div>
      )}
    </div>
  );
}

function AjudaSection() {
  const [openQuestion, setOpenQuestion] = useState<number | null>(null);

  const faqs = [
    {
      q: 'Como conecto meu WhatsApp?',
      a: 'Acesse a secao "WhatsApp" no menu lateral e escaneie o QR Code com o aplicativo do WhatsApp no seu celular.',
    },
    {
      q: 'Quanto tempo leva a verificacao KYC?',
      a: 'A analise dos documentos pode levar ate 48 horas uteis. Voce sera notificado por e-mail quando o resultado estiver disponivel.',
    },
    {
      q: 'Qual o limite de saque mensal?',
      a: 'Para contas com CPF, o limite e de R$ 2.259,20/mes. Cadastre um CNPJ nos dados fiscais para remover esse limite.',
    },
    {
      q: 'Como altero meu plano?',
      a: 'Entre em contato com nosso suporte via WhatsApp ou e-mail para solicitar alteracoes no seu plano atual.',
    },
  ];

  const toggle = (idx: number) => {
    setOpenQuestion(openQuestion === idx ? null : idx);
  };

  const helpLinks = [
    { label: 'Central de Ajuda', href: '#', target: '_blank', icon: Icons.help },
    {
      label: 'Contato / Suporte',
      href: 'mailto:suporte@kloel.com',
      target: undefined,
      icon: Icons.bell,
    },
  ];

  return (
    <SectionCard
      title={kloelT(`Precisa de ajuda?`)}
      subtitle={kloelT(`Entre em contato conosco ou consulte as perguntas frequentes`)}
    >
      {/* Quick links */}
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: 24 }}>
        {helpLinks.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target={link.target}
            rel={link.target === '_blank' ? 'noopener noreferrer' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 18px',
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 8,
              textDecoration: 'none',
              color: 'var(--app-text-primary)',
              fontSize: 13,
              fontFamily: SORA,
              transition: 'all 150ms ease',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = EMBER;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--app-border-primary)';
            }}
          >
            <span style={{ color: EMBER, flexShrink: 0 }}>{link.icon(16)}</span>
            <span style={{ flex: 1 }}>{link.label}</span>
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--app-text-placeholder)"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path d={kloelT(`M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6`)} />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        ))}
      </div>

      {/* Contact buttons */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <a
          href="https://wa.me/5500000000000"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flex: 1,
            padding: '14px 20px',
            background: 'rgba(37,211,102,.06)',
            border: '1px solid rgba(37,211,102,.2)',
            borderRadius: 6,
            color: '#25D366',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: SORA,
            textDecoration: 'none',
            textAlign: 'center' as const,
            cursor: 'pointer',
            transition: 'all 150ms ease',
            display: 'block',
          }}
        >
          {kloelT(`WhatsApp`)}
        </a>
        <a
          href="mailto:suporte@kloel.com"
          style={{
            flex: 1,
            padding: '14px 20px',
            background: 'rgba(232,93,48,.06)',
            border: `1px solid rgba(232,93,48,.2)`,
            borderRadius: 6,
            color: EMBER,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: SORA,
            textDecoration: 'none',
            textAlign: 'center' as const,
            cursor: 'pointer',
            transition: 'all 150ms ease',
            display: 'block',
          }}
        >
          {kloelT(`E-mail`)}
        </a>
      </div>

      {/* FAQ Accordion */}
      <div style={{ borderTop: '1px solid var(--app-border-subtle)', paddingTop: 20 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            display: 'block',
            marginBottom: 14,
            fontFamily: SORA,
          }}
        >
          {kloelT(`Perguntas frequentes`)}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
          {faqs.map((faq, idx) => (
            <FaqItem
              key={faq.q}
              question={faq.q}
              answer={faq.a}
              isOpen={openQuestion === idx}
              onToggle={() => toggle(idx)}
            />
          ))}
        </div>
      </div>

      {/* Platform version */}
      <div
        style={{
          borderTop: '1px solid var(--app-border-subtle)',
          marginTop: 20,
          paddingTop: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ color: 'var(--app-text-tertiary)', flexShrink: 0 }}>{Icons.shield(14)}</span>
        <span style={{ fontSize: 11, color: 'var(--app-text-tertiary)', fontFamily: SORA }}>
          {kloelT(`Versao da plataforma: Kloel v1.0.0-beta`)}
        </span>
      </div>
    </SectionCard>
  );
}

// ═══ META PLATFORM CONNECT ═══

function MetaConnectSection() {
  const [status, setStatus] = useState<MetaAuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    apiFetch<MetaAuthStatus>('/meta/auth/status')
      .then((res) => {
        setStatus(res.data ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleConnect = async () => {
    try {
      const res = await apiFetch<MetaAuthUrlResponse>('/meta/auth/url');
      const url = res.data?.url || res.data?.data?.url;
      if (url) {
        window.open(url, 'meta-auth', 'width=600,height=700');
      }
    } catch {
      // silent
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await apiFetch('/meta/auth/disconnect', { method: 'POST' });
      setStatus({ connected: false });
      globalMutate((key: string) => typeof key === 'string' && key.startsWith('/meta'));
    } catch {
      // silent
    }
    setDisconnecting(false);
  };

  if (loading) {
    return (
      <SectionCard
        title={kloelT(`Meta Platform`)}
        subtitle={kloelT(`Instagram, Messenger, Meta Ads`)}
      >
        <div style={{ fontSize: 12, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
          {kloelT(`Carregando...`)}
        </div>
      </SectionCard>
    );
  }

  if (status?.connected) {
    return (
      <SectionCard
        title={kloelT(`Meta Platform`)}
        subtitle={kloelT(`Instagram, Messenger, Meta Ads`)}
      >
        <div
          style={{
            background: 'rgba(16,185,129,.04)',
            border: '1px solid rgba(16,185,129,.15)',
            borderRadius: 6,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 16,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
          <div style={{ flex: 1 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#10B981',
                fontFamily: SORA,
                display: 'block',
              }}
            >
              {kloelT(`Conectado ao Meta`)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
              {status.pageName ? `Pagina: ${status.pageName}` : ''}
              {status.instagramUsername ? ` | @${status.instagramUsername}` : ''}
              {status.adAccountId ? ` | Ads: ${status.adAccountId}` : ''}
            </span>
          </div>
        </div>
        {status.tokenExpired && (
          <div
            style={{
              background: 'rgba(245,158,11,.04)',
              border: '1px solid rgba(245,158,11,.15)',
              borderRadius: 6,
              padding: '10px 14px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 11, color: '#F59E0B', fontFamily: SORA }}>
              {kloelT(`Token expirado. Reconecte para renovar.`)}
            </span>
            <button
              type="button"
              onClick={handleConnect}
              style={{
                padding: '6px 14px',
                background: EMBER,
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: SORA,
              }}
            >
              {kloelT(`Reconectar`)}
            </button>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            style={{
              padding: '9px 20px',
              background: 'transparent',
              border: '1px solid rgba(239,68,68,.3)',
              borderRadius: 6,
              color: '#EF4444',
              fontSize: 12,
              fontWeight: 600,
              cursor: disconnecting ? 'not-allowed' : 'pointer',
              fontFamily: SORA,
              transition: 'all 150ms ease',
              opacity: disconnecting ? 0.5 : 1,
            }}
          >
            {disconnecting ? 'Desconectando...' : 'Desconectar Meta'}
          </button>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={kloelT(`Meta Platform`)}
      subtitle={kloelT(`Conecte Instagram, Messenger e Meta Ads`)}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column' as const,
          alignItems: 'center',
          gap: 16,
          padding: '16px 0',
        }}
      >
        <div style={{ color: '#1877F2', opacity: 0.3 }}>
          <svg width={48} height={48} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path
              d={kloelT(
                `M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z`,
              )}
            />
          </svg>
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'var(--app-text-secondary)',
            fontFamily: SORA,
            textAlign: 'center',
            maxWidth: 400,
            lineHeight: 1.6,
          }}
        >
          {kloelT(`Conecte sua conta Meta para gerenciar Instagram DM, Messenger e Meta Ads diretamente na
          KLOEL.`)}
        </div>
        <button
          type="button"
          onClick={handleConnect}
          style={{
            padding: '11px 28px',
            background: '#1877F2',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: SORA,
            transition: 'all 150ms ease',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path
              d={kloelT(
                `M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z`,
              )}
            />
          </svg>

          {kloelT(`Conectar com Meta`)}
        </button>
      </div>
    </SectionCard>
  );
}

// ═══ SECTION: EQUIPE ═══

function TeamSection() {
  const fid = useId();
  const wsId = useWorkspaceId();
  const { data, isLoading, mutate } = useSWR<TeamApiResponse>(
    wsId ? `${wsId}:/team` : null,
    () => swrFetcher<TeamApiResponse>('/team'),
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
    },
  );
  const members: TeamMember[] = data?.members ?? [];
  const invites: TeamInvite[] = data?.invites ?? [];

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      return;
    }
    setInviting(true);
    setInviteError('');
    setInviteSuccess('');
    try {
      await inviteTeamMember(inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      setInviteSuccess(`Convite enviado para ${inviteEmail.trim()}`);
      await mutate();
    } catch (e) {
      setInviteError(getErrorMessage(e) || 'Erro ao enviar convite');
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      await revokeTeamInvite(id);
      await mutate();
    } catch {
      /* silent */
    } finally {
      setRevokingId(null);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Remover este membro da equipe?')) {
      return;
    }
    setRemovingId(id);
    try {
      await removeTeamMember(id);
      await mutate();
    } catch {
      /* silent */
    } finally {
      setRemovingId(null);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    background: 'var(--app-bg-card)',
    border: '1px solid var(--app-border-primary)',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: SORA,
    color: 'var(--app-text-primary)',
    boxSizing: 'border-box' as const,
    outline: 'none',
  };

  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

  const ROLES: Record<string, string> = {
    admin: 'Administrador',
    member: 'Membro',
    viewer: 'Visualizador',
  };

  return (
    <div>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--app-text-primary)',
          margin: '0 0 16px',
          fontFamily: SORA,
        }}
      >
        {kloelT(`Equipe`)}
      </h2>

      {/* Invite form */}
      <SectionCard
        title={kloelT(`Convidar membro`)}
        subtitle={kloelT(`Envie um convite por email para adicionar alguem a sua equipe`)}
      >
        <div
          style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' as const }}
        >
          <div style={{ flex: 2, minWidth: 200 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--app-text-secondary)',
                display: 'block',
                marginBottom: 6,
                fontFamily: SORA,
              }}
              htmlFor={`${fid}-email`}
            >
              {kloelT(`Email`)}
            </label>
            <input
              aria-label="Email do convidado"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleInvite();
                }
              }}
              placeholder={kloelT(`email@exemplo.com`)}
              style={inputStyle}
              id={`${fid}-email`}
            />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--app-text-secondary)',
                display: 'block',
                marginBottom: 6,
                fontFamily: SORA,
              }}
              htmlFor={`${fid}-funcao`}
            >
              {kloelT(`Funcao`)}
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              style={selectStyle}
              id={`${fid}-funcao`}
            >
              {Object.entries(ROLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleInvite}
            disabled={inviting || !inviteEmail.trim()}
            style={{
              padding: '11px 20px',
              background: inviting || !inviteEmail.trim() ? 'var(--app-text-placeholder)' : EMBER,
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              cursor: inviting || !inviteEmail.trim() ? 'not-allowed' : 'pointer',
              fontFamily: SORA,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {Icons.plus(12)} {inviting ? 'Enviando...' : 'Convidar'}
          </button>
        </div>
        {inviteError && (
          <p style={{ fontSize: 11, color: '#EF4444', margin: '8px 0 0', fontFamily: SORA }}>
            {inviteError}
          </p>
        )}
        {inviteSuccess && (
          <p style={{ fontSize: 11, color: '#10B981', margin: '8px 0 0', fontFamily: SORA }}>
            {inviteSuccess}
          </p>
        )}
      </SectionCard>

      {/* Active members */}
      <SectionCard title={kloelT(`Membros ativos`)}>
        {isLoading ? (
          <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)', fontFamily: SORA }}>
            {kloelT(`Carregando...`)}
          </span>
        ) : members.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center' as const }}>
            <span style={{ color: 'var(--app-text-tertiary)' }}>{Icons.users(28)}</span>
            <p
              style={{
                fontSize: 12,
                color: 'var(--app-text-tertiary)',
                margin: '8px 0 0',
                fontFamily: SORA,
              }}
            >
              {kloelT(`Nenhum membro na equipe ainda`)}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
            {members.map((m) => (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: '1px solid var(--app-border-subtle)',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'var(--app-bg-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--app-text-secondary)',
                  }}
                >
                  {Icons.user(14)}
                </div>
                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--app-text-primary)',
                      display: 'block',
                      fontFamily: SORA,
                    }}
                  >
                    {m.name || m.email}
                  </span>
                  <span
                    style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}
                  >
                    {m.email} {kloelT(`&middot;`)} {ROLES[m.role] || m.role}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontFamily: SORA,
                    color: m.status === 'active' ? '#10B981' : '#F59E0B',
                    background:
                      m.status === 'active' ? 'rgba(16,185,129,.08)' : 'rgba(245,158,11,.08)',
                  }}
                >
                  {m.status === 'active' ? 'Ativo' : 'Pendente'}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(m.id)}
                  disabled={removingId === m.id}
                  style={{
                    padding: '5px 8px',
                    background: 'none',
                    border: '1px solid var(--app-border-primary)',
                    borderRadius: 4,
                    color: '#EF4444',
                    cursor: 'pointer',
                    display: 'flex',
                    opacity: removingId === m.id ? 0.5 : 1,
                  }}
                  title={kloelT(`Remover membro`)}
                >
                  {Icons.trash(12)}
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Pending invites */}
      {invites.filter((inv) => inv.status === 'pending').length > 0 && (
        <SectionCard title={kloelT(`Convites pendentes`)}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
            {invites
              .filter((inv) => inv.status === 'pending')
              .map((inv) => (
                <div
                  key={inv.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 0',
                    borderBottom: '1px solid var(--app-border-subtle)',
                  }}
                >
                  <span style={{ color: 'var(--app-text-tertiary)' }}>{Icons.mail(16)}</span>
                  <div style={{ flex: 1 }}>
                    <span
                      style={{
                        fontSize: 13,
                        color: 'var(--app-text-primary)',
                        display: 'block',
                        fontFamily: SORA,
                      }}
                    >
                      {inv.email}
                    </span>
                    <span
                      style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}
                    >
                      {ROLES[inv.role] || inv.role} {kloelT(`&middot; Aguardando aceite`)}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 4,
                      color: '#F59E0B',
                      background: 'rgba(245,158,11,.08)',
                      fontFamily: SORA,
                    }}
                  >
                    {kloelT(`Pendente`)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRevoke(inv.id)}
                    disabled={revokingId === inv.id}
                    style={{
                      padding: '5px 10px',
                      background: 'none',
                      border: '1px solid var(--app-border-primary)',
                      borderRadius: 4,
                      color: 'var(--app-text-secondary)',
                      fontSize: 10,
                      cursor: 'pointer',
                      fontFamily: SORA,
                      opacity: revokingId === inv.id ? 0.5 : 1,
                    }}
                  >
                    {kloelT(`Cancelar`)}
                  </button>
                </div>
              ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ═══ SECTION 10: SAIR ═══

function SairSection() {
  const router = useRouter();

  const handleLogout = () => {
    tokenStorage.clear();
    router.push('/login');
  };

  return (
    <SectionCard title={kloelT(`Sair da conta`)} subtitle={kloelT(`Encerre sua sessao atual`)}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column' as const,
          alignItems: 'center',
          gap: 16,
          padding: '20px 0',
        }}
      >
        <span style={{ color: '#EF4444' }}>{Icons.logout(32)}</span>
        <p
          style={{
            fontSize: 13,
            color: 'var(--app-text-secondary)',
            fontFamily: SORA,
            textAlign: 'center' as const,
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          {kloelT(`Ao sair, voce sera desconectado desta sessao. Seus dados permanecem salvos e voce podera
          fazer login novamente a qualquer momento.`)}
        </p>
        <button
          type="button"
          onClick={handleLogout}
          style={{
            padding: '12px 32px',
            background: '#EF4444',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: SORA,
            transition: 'all 150ms ease',
          }}
        >
          {kloelT(`Sair da conta`)}
        </button>
      </div>
    </SectionCard>
  );
}

// ═══ MAIN COMPONENT ═══

export default function ContaView() {
  const { isMobile } = useResponsiveViewport();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [section, setSection] = useState<SettingsSectionKey>(() =>
    resolveSettingsSection(searchParams.get('section')),
  );
  const { profile, isLoading: profileLoading, mutate: mutateProfile } = useProfile();
  const { fiscal, mutate: mutateFiscal } = useFiscalData();
  const { documents, mutate: mutateDocs } = useKycDocuments();
  const { bankAccount, mutate: mutateBank } = useBankAccount();
  const { status, mutate: mutateStatus } = useKycStatus();
  const { completion, mutate: mutateCompletion } = useKycCompletion();
  const {
    sellerAccount,
    isLoading: connectAccountLoading,
    error: connectAccountError,
    mutate: mutateConnectAccount,
  } = useSellerConnectAccount();
  const { submitKyc } = useKycSubmit();
  const [submitError, setSubmitError] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState<
    'none' | 'trial' | 'active' | 'expired' | 'suspended'
  >('none');
  const [trialDaysLeft, setTrialDaysLeft] = useState(0);
  const [creditsBalance, setCreditsBalance] = useState(0);
  const [hasCard, setHasCard] = useState(false);

  const completionData: KycCompletion = completion || { percentage: 0, sections: [] };
  const sectionStatus = (name: string) => {
    const s = completionData.sections?.find((sec) => sec.name === name);
    return s?.complete ? 'approved' : 'pending';
  };

  const kycStatus = status?.kycStatus || 'pending';
  const pct = completionData.percentage || 0;
  const isBlocked = pct < 100 || kycStatus !== 'approved';

  const loadBillingSummary = useCallback(async () => {
    try {
      const [subscriptionResponse, paymentMethodsResponse] = await Promise.all([
        billingApi.getSubscription(),
        billingApi.getPaymentMethods(),
      ]);

      if (subscriptionResponse.data) {
        setSubscriptionStatus(subscriptionResponse.data.status ?? 'none');
        setTrialDaysLeft(subscriptionResponse.data.trialDaysLeft ?? 0);
        setCreditsBalance(subscriptionResponse.data.creditsBalance ?? 0);
      } else {
        setSubscriptionStatus('none');
        setTrialDaysLeft(0);
        setCreditsBalance(0);
      }

      setHasCard(!!paymentMethodsResponse.data?.paymentMethods?.length);
    } catch {
      setSubscriptionStatus('none');
      setTrialDaysLeft(0);
      setCreditsBalance(0);
      setHasCard(false);
    }
  }, []);

  useEffect(() => {
    void loadBillingSummary();
  }, [loadBillingSummary]);

  useEffect(() => {
    const nextSection = resolveSettingsSection(searchParams.get('section'));
    setSection((current) => (current === nextSection ? current : nextSection));
  }, [searchParams]);

  const handleSelectSection = useCallback(
    (nextSection: SettingsSectionKey) => {
      setSection(nextSection);
      const params = new URLSearchParams(searchParams.toString());
      if (nextSection === DEFAULT_SETTINGS_SECTION) {
        params.delete('section');
      } else {
        params.set('section', nextSection);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const handleActivateTrialFromSettings = useCallback(async () => {
    await billingApi.activateTrial();
    await loadBillingSummary();
  }, [loadBillingSummary]);

  const showSystemAlerts =
    section === 'account' ||
    section === 'billing' ||
    section === 'apps' ||
    section === 'brain' ||
    section === 'crm' ||
    section === 'analytics' ||
    section === 'activity';

  const _workspaceIcons: Record<string, (s: number) => React.ReactNode> = {
    user: Icons.user,
    bank: Icons.bank,
    shield: Icons.shield,
    users: Icons.users,
    eye: Icons.eye,
    clock: Icons.clock,
  };

  const SECTIONS: Array<{
    key: SettingsSectionKey;
    label: string;
    icon: (s: number) => React.ReactNode;
    statusKey: string | null;
  }> = [
    { key: 'pessoal', label: 'Dados pessoais', icon: Icons.user, statusKey: 'profile' },
    { key: 'fiscal', label: 'Dados fiscais', icon: Icons.building, statusKey: 'fiscal' },
    { key: 'documentos', label: 'Documentos', icon: Icons.doc, statusKey: 'documents' },
    { key: 'bancario', label: 'Dados bancarios', icon: Icons.bank, statusKey: 'bank' },
    { key: 'idiomas', label: 'Idiomas', icon: Icons.language, statusKey: null },
    { key: 'sair', label: 'Sair', icon: Icons.logout, statusKey: null },
  ];

  const mutateAll = () => {
    mutateCompletion();
  };

  return (
    <div
      data-testid="account-settings-root"
      style={{
        minHeight: '100vh',
        background: 'var(--app-bg-primary)',
        fontFamily: SORA,
        color: 'var(--app-text-primary)',
      }}
    >
      <div
        style={{
          maxWidth: 1000,
          margin: '0 auto',
          padding: isMobile ? '20px 16px 28px' : '32px 20px',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: isMobile ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            flexDirection: isMobile ? 'column' : 'row',
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{kloelT(`Minha conta`)}</h1>
            <p style={{ fontSize: 12, color: 'var(--app-text-secondary)', margin: '4px 0 0' }}>
              {kloelT(`Preencha todos os campos obrigatorios para utilizar a plataforma`)}
            </p>
          </div>
          <StatusBadge status={kycStatus} />
        </div>

        {/* Blocker Banner */}
        {isBlocked && (
          <div
            style={{
              background: 'rgba(245,158,11,.04)',
              border: '1px solid rgba(245,158,11,.15)',
              borderRadius: 6,
              padding: '14px 18px',
              marginBottom: 20,
              display: 'flex',
              alignItems: isMobile ? 'flex-start' : 'center',
              flexDirection: isMobile ? 'column' : 'row',
              gap: 12,
            }}
          >
            <span style={{ color: '#F59E0B' }}>{Icons.alert(20)}</span>
            <div style={{ flex: 1 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--app-text-primary)',
                  display: 'block',
                }}
              >
                {kloelT(`Cadastro incompleto`)}
              </span>
              <span style={{ fontSize: 11, color: 'var(--app-text-secondary)' }}>
                {kloelT(`Voce pode visualizar todas as funcionalidades, mas para criar produtos, se afiliar e
                utilizar a IA, complete seu cadastro e aguarde a aprovacao.`)}
              </span>
            </div>
            <div style={{ textAlign: isMobile ? ('left' as const) : ('right' as const) }}>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 24,
                  fontWeight: 700,
                  color: pct === 100 ? '#10B981' : '#F59E0B',
                }}
              >
                {pct}%
              </span>
              <span style={{ fontSize: 9, color: 'var(--app-text-tertiary)', display: 'block' }}>
                completo
              </span>
            </div>
          </div>
        )}

        {profileLoading && (
          <div
            style={{
              background: 'rgba(59,130,246,.04)',
              border: '1px solid rgba(59,130,246,.15)',
              borderRadius: 6,
              padding: '14px 18px',
              marginBottom: 20,
              display: 'flex',
              alignItems: isMobile ? 'flex-start' : 'center',
              flexDirection: isMobile ? 'column' : 'row',
              gap: 12,
            }}
          >
            <span style={{ color: '#3B82F6', flexShrink: 0 }}>{Icons.clock(18)}</span>
            <div style={{ flex: 1 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--app-text-primary)',
                  display: 'block',
                }}
              >
                {kloelT(`Sincronizando dados da conta`)}
              </span>
              <span style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
                {kloelT(`O painel continua disponível enquanto perfil, workspace e status regulatório são
                revalidados.`)}
              </span>
            </div>
            <PulseLoader width={84} height={18} />
          </div>
        )}

        <ConnectAccountStatusCard
          isMobile={isMobile}
          sellerAccount={sellerAccount}
          isLoading={connectAccountLoading}
          error={connectAccountError}
        />

        {/* Progress bar */}
        <div
          style={{
            height: 4,
            background: 'var(--app-bg-secondary)',
            borderRadius: 2,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: pct === 100 ? '#10B981' : EMBER,
              borderRadius: 2,
              transition: 'width .3s',
            }}
          />
        </div>

        {/* Layout: sidebar + content */}
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
          {/* Left nav */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
            {SECTIONS.map((sec) => {
              const active = section === sec.key;
              const done = sec.statusKey ? sectionStatus(sec.statusKey) === 'approved' : false;
              return (
                <button
                  type="button"
                  key={sec.key}
                  onClick={() => handleSelectSection(sec.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    background: active ? 'var(--app-bg-card)' : 'transparent',
                    border: active
                      ? '1px solid var(--app-border-primary)'
                      : '1px solid transparent',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all .15s',
                    textAlign: 'left' as const,
                    fontFamily: SORA,
                  }}
                >
                  <span
                    style={{
                      color: active ? EMBER : done ? '#10B981' : 'var(--app-text-placeholder)',
                    }}
                  >
                    {sec.icon(16)}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: active ? 600 : 400,
                      color: active ? 'var(--app-text-primary)' : 'var(--app-text-secondary)',
                      flex: 1,
                    }}
                  >
                    {sec.label}
                  </span>
                  {done ? <span style={{ color: '#10B981' }}>{Icons.check(12)}</span> : null}
                </button>
              );
            })}

            {/* Danger zone */}
            <div
              style={{
                marginTop: 'auto',
                paddingTop: 20,
                borderTop: '1px solid var(--app-border-subtle)',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  if (
                    confirm(
                      'Para encerrar sua conta, entre em contato com nosso suporte via chat ou WhatsApp.',
                    )
                  ) {
                    /* no-op */
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#EF4444',
                  fontSize: 11,
                  fontFamily: SORA,
                }}
              >
                {Icons.alert(14)} {kloelT(`Encerrar conta`)}
              </button>
            </div>
          </div>

          {/* Right content */}
          <div key={section} style={{ animation: 'fadeIn .3s' }}>
            {showSystemAlerts && (
              <div style={{ marginBottom: 20 }}>
                <SystemAlertsCard />
              </div>
            )}
            {section === 'pessoal' && (
              <DadosPessoaisSection
                profile={profile}
                mutate={() => {
                  mutateProfile();
                  mutateAll();
                }}
              />
            )}
            {section === 'fiscal' && (
              <DadosFiscaisSection
                fiscal={fiscal}
                mutate={() => {
                  mutateFiscal();
                  mutateAll();
                }}
              />
            )}
            {section === 'documentos' && (
              <DocumentosSection
                documents={documents}
                fiscal={fiscal}
                mutate={() => {
                  mutateDocs();
                  mutateAll();
                }}
              />
            )}
            {section === 'bancario' && (
              <DadosBancariosSection
                bankAccount={bankAccount}
                fiscal={fiscal}
                profile={profile}
                mutate={() => {
                  mutateBank();
                  mutateAll();
                }}
              />
            )}
            {section === 'account' && <AccountSettingsSection />}
            {section === 'billing' && (
              <BillingSettingsSection
                subscriptionStatus={subscriptionStatus}
                trialDaysLeft={trialDaysLeft}
                creditsBalance={creditsBalance}
                hasCard={hasCard}
                onActivateTrial={handleActivateTrialFromSettings}
              />
            )}
            {section === 'brain' && <BrainSettingsSection />}
            {section === 'crm' && <CrmSettingsSection />}
            {section === 'analytics' && <AnalyticsSettingsSection />}
            {section === 'activity' && <ActivitySection />}
            {section === 'seguranca' && <SegurancaSection />}
            {section === 'equipe' && <TeamSection />}
            {section === 'notificacoes' && <NotificacoesSection />}
            {section === 'perfil' && (
              <PerfilPublicoSection
                profile={profile}
                mutate={() => {
                  mutateProfile();
                  mutateAll();
                }}
              />
            )}
            {section === 'apps' && (
              <div>
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'var(--app-text-primary)',
                    margin: '0 0 16px',
                    fontFamily: SORA,
                  }}
                >
                  {kloelT(`Apps e integracoes`)}
                </h2>
                <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
                  {[
                    {
                      name: 'WhatsApp e Inbox',
                      status: 'Operacional',
                      connected: true,
                      cta: 'Abrir inbox',
                      action: () => router.push('/inbox'),
                    },
                    {
                      name: 'Meta Platform',
                      status: 'Gerenciar',
                      connected: true,
                      cta: 'Abrir anuncios',
                      action: () => router.push('/anuncios'),
                    },
                    {
                      name: 'Plano e cobranca Kloel',
                      status: 'Operacional',
                      connected: true,
                      cta: 'Abrir billing',
                      action: () => handleSelectSection('billing'),
                    },
                    {
                      name: 'CRM e analytics',
                      status: 'Ajustar',
                      connected: true,
                      cta: 'Abrir configuracoes',
                      action: () => handleSelectSection('crm'),
                    },
                  ].map((app) => (
                    <div
                      key={app.name}
                      style={{
                        background: 'var(--app-bg-card)',
                        border: '1px solid var(--app-border-primary)',
                        borderRadius: 6,
                        padding: '14px 18px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: app.connected ? '#10B981' : 'var(--app-text-placeholder)',
                          }}
                        />
                        <div>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: 'var(--app-text-primary)',
                              fontFamily: SORA,
                              display: 'block',
                            }}
                          >
                            {app.name}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: 'var(--app-text-secondary)',
                              fontFamily: SORA,
                            }}
                          >
                            {app.status}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={app.action}
                        style={{
                          padding: '8px 14px',
                          background: 'transparent',
                          border: '1px solid var(--app-border-primary)',
                          borderRadius: 6,
                          color: app.connected
                            ? 'var(--app-text-primary)'
                            : 'var(--app-text-secondary)',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: SORA,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {app.cta}
                      </button>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    background: 'var(--app-bg-card)',
                    border: '1px solid var(--app-border-primary)',
                    borderRadius: 6,
                    padding: '14px 18px',
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--app-text-primary)',
                      fontFamily: SORA,
                    }}
                  >
                    {kloelT(`Integrações publicadas do Kloel`)}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--app-text-secondary)',
                      fontFamily: SORA,
                      lineHeight: 1.6,
                      marginTop: 6,
                    }}
                  >
                    {kloelT(`Esta área agora concentra apenas integrações reais ou já operacionais em outros
                    módulos. O que ainda não existe de forma utilizável não aparece mais como
                    promessa dentro da sua conta.`)}
                  </div>
                </div>
                <MetaConnectSection />
              </div>
            )}
            {section === 'presentear' && (
              <div>
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'var(--app-text-primary)',
                    margin: '0 0 16px',
                    fontFamily: SORA,
                  }}
                >
                  {kloelT(`Presentear Kloel`)}
                </h2>
                <div
                  style={{
                    background: 'var(--app-bg-card)',
                    border: '1px solid var(--app-border-primary)',
                    borderRadius: 6,
                    padding: 24,
                  }}
                >
                  <p
                    style={{ fontSize: 13, color: 'var(--app-text-secondary)', margin: '0 0 16px' }}
                  >
                    {kloelT(`Compartilhe seu link de indicacao e ganhe beneficios quando seus amigos se
                    cadastrarem.`)}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      aria-label="Link de indicacao"
                      readOnly
                      value={`${process.env.NEXT_PUBLIC_SITE_URL || 'https://kloel.com'}/ref/seu-codigo`}
                      style={{
                        flex: 1,
                        background: 'var(--app-bg-primary)',
                        border: '1px solid var(--app-border-primary)',
                        borderRadius: 6,
                        padding: '10px 14px',
                        color: 'var(--app-text-primary)',
                        fontSize: 13,
                        fontFamily: SORA,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${process.env.NEXT_PUBLIC_SITE_URL || 'https://kloel.com'}/ref/seu-codigo`,
                        );
                      }}
                      style={{
                        padding: '10px 18px',
                        background: EMBER,
                        color: 'var(--app-text-on-accent)',
                        border: 'none',
                        borderRadius: 6,
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontFamily: SORA,
                      }}
                    >
                      {kloelT(`Copiar`)}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {section === 'saiba-mais' && (
              <div>
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'var(--app-text-primary)',
                    margin: '0 0 16px',
                    fontFamily: SORA,
                  }}
                >
                  {kloelT(`Saiba mais`)}
                </h2>
                <div style={{ display: 'grid', gap: 10 }}>
                  {[
                    { label: 'Termos de uso', url: '/terms' },
                    { label: 'Politica de privacidade', url: '/privacy' },
                    { label: 'Documentacao', url: '/terms' },
                    { label: 'Contato', url: 'mailto:suporte@kloel.com' },
                  ].map((link) => (
                    <a
                      key={link.label}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'var(--app-bg-card)',
                        border: '1px solid var(--app-border-primary)',
                        borderRadius: 6,
                        padding: '14px 18px',
                        textDecoration: 'none',
                        color: 'var(--app-text-primary)',
                        fontSize: 13,
                        fontFamily: SORA,
                      }}
                    >
                      {link.label}
                      <svg
                        width={14}
                        height={14}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--app-text-secondary)"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <path
                          d={kloelT(`M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6`)}
                        />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  ))}
                </div>
              </div>
            )}
            {section === 'idiomas' && <IdiomasSection />}
            {section === 'ajuda' && <AjudaSection />}
            {section === 'sair' && <SairSection />}
          </div>
        </div>

        {/* Submit KYC button */}
        {pct >= 100 && kycStatus === 'pending' && (
          <div style={{ marginTop: 32, textAlign: 'center' as const }}>
            {submitError && (
              <span
                style={{
                  fontSize: 12,
                  color: '#EF4444',
                  display: 'block',
                  marginBottom: 8,
                  fontFamily: SORA,
                }}
              >
                {submitError}
              </span>
            )}
            <button
              type="button"
              onClick={async () => {
                setSubmitError('');
                try {
                  await submitKyc();
                  mutateCompletion();
                  mutateStatus();
                  mutateConnectAccount();
                } catch (e) {
                  setSubmitError(getErrorMessage(e) || 'Erro ao enviar. Tente novamente.');
                }
              }}
              style={{
                padding: '14px 40px',
                background: EMBER,
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: SORA,
              }}
            >
              {kloelT(`Enviar para analise`)}
            </button>
          </div>
        )}
      </div>

      {/* CSS animation */}
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
