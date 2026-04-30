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
import { colors } from '@/lib/design-tokens';

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
const EMBER = 'colors.ember.primary';

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
    color: 'var(--app-warning)',
    bg: 'var(--app-warning-bg)',
    border: 'color-mix(in srgb, var(--app-warning) 18%, transparent)',
    icon: Icons.alert,
  },
  in_review: {
    color: 'var(--app-info)',
    bg: 'var(--app-info-bg)',
    border: 'color-mix(in srgb, var(--app-info) 18%, transparent)',
    icon: Icons.eye,
  },
  restricted: {
    color: 'var(--app-error)',
    bg: 'var(--app-error-bg)',
    border: 'color-mix(in srgb, var(--app-error) 18%, transparent)',
    icon: Icons.x,
  },
  active: {
    color: 'var(--app-success)',
    bg: 'var(--app-success-bg)',
    border: 'color-mix(in srgb, var(--app-success) 18%, transparent)',
    icon: Icons.check,
  },
};
