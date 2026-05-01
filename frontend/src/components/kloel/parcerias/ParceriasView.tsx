'use client';

import { kloelT } from '@/lib/i18n/t';
import {
  createAffiliate,
  inviteCollaborator,
  markPartnerAsRead,
  revokeAffiliate,
  sendPartnerMessage,
  useAffiliateStats,
  useAffiliates,
  useCollaboratorStats,
  useCollaborators,
  usePartnerChatContacts,
  usePartnerMessages,
} from '@/hooks/usePartnerships';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { affiliateApi, partnershipsApi } from '@/lib/api/misc';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { buildPayUrl } from '@/lib/subdomains';
import { usePathname, useRouter } from 'next/navigation';
import { startTransition, useEffect, useRef, useState, useId } from 'react';
import useSWR from 'swr';
import { IC } from './ParceriasView.icons';
import { colors } from '@/lib/design-tokens';

/* ── Local view types (mirrors API shape) ── */
interface Agent {
  id?: string;
  name?: string;
  email?: string;
  status?: string;
  role?: string;
  lastActive?: string;
}

interface Invite {
  id?: string;
  email?: string;
  role?: string;
}

interface Affiliate {
  id?: string;
  name?: string;
  email?: string;
  type?: string;
  status?: string;
  revenue?: number;
  commission?: number;
  temperature?: number;
  totalSales?: number;
  products?: string[];
  joined?: string;
  monthlyPerformance?: number[];
}

interface AffiliatePerformance {
  totalSales?: number;
  totalRevenue?: number;
  commission?: number;
  monthlyPerformance?: number[];
}

interface AffiliateLink {
  id: string;
  affiliateProduct?: { productId?: string };
  url?: string;
  code?: string;
  clicks?: number;
  sales?: number;
  revenue?: number;
  commission?: number;
  commissionEarned?: number;
}

interface AffiliateSuggestion {
  id: string;
  productId?: string;
  commissionPct?: number;
  category?: string;
}

interface PartnerContact {
  id: string;
  name?: string;
  unread?: number;
  lastMessage?: string;
  avatar?: string;
  type?: string;
  online?: boolean;
  time?: string;
}

interface PartnerMessage {
  id?: string;
  text?: string;
  sender?: string;
  createdAt?: string;
  content?: string;
  time?: string;
  isMe?: boolean;
}

/* ═══════════════════════════════════════════════
   DESIGN TOKENS
   ═══════════════════════════════════════════════ */

const C = {
  bg: KLOEL_THEME.bgPrimary,
  bgOverlay: KLOEL_THEME.bgOverlay,
  card: KLOEL_THEME.bgCard,
  elevated: KLOEL_THEME.bgSecondary,
  border: KLOEL_THEME.borderPrimary,
  divider: KLOEL_THEME.borderSubtle,
  text: KLOEL_THEME.textPrimary,
  textOnAccent: KLOEL_THEME.textOnAccent,
  secondary: KLOEL_THEME.textSecondary,
  muted: KLOEL_THEME.textTertiary,
  ember: KLOEL_THEME.accent,
  emberBg: KLOEL_THEME.accentLight,
  emberGlow: KLOEL_THEME.accentLight,
  emberStrong: KLOEL_THEME.accentMedium,
  success: KLOEL_THEME.success,
  successBg: KLOEL_THEME.successBg,
  warning: KLOEL_THEME.warning,
  warningBg: KLOEL_THEME.warningBg,
  error: KLOEL_THEME.error,
  errorBg: KLOEL_THEME.errorBg,
  info: KLOEL_THEME.info,
  infoBg: KLOEL_THEME.infoBg,
};

const FONT = {
  sans: "'Sora', sans-serif",
  mono: "'JetBrains Mono', monospace",
};

const MONTH_LABELS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

/* ═══════════════════════════════════════════════
   INLINE SVG ICONS — extracted into ParceriasView.icons.tsx
   (see the import at the top of this file)
   ═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════
   ROLES CONFIG
   ═══════════════════════════════════════════════ */

const ROLES: { value: string; label: string; color: string }[] = [
  { value: 'admin', label: 'Admin', color: 'colors.ember.primary' },
  { value: 'manager', label: 'Manager', color: '#3B82F6' },
  { value: 'support', label: 'Support', color: '#10B981' },
  { value: 'finance', label: 'Finance', color: '#F59E0B' },
  { value: 'viewer', label: 'Viewer', color: 'var(--app-text-secondary)' },
];

/* ═══════════════════════════════════════════════
   (mock fallback data removed – real hooks only)
   ═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════
   HELPER: TempBar
   ═══════════════════════════════════════════════ */

function TempBar({ value, max, color = C.ember }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div
      style={{
        width: '100%',
        height: 4,
        background: C.elevated,
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: 2,
          transition: 'width 300ms ease',
        }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */

import { ParceriasView } from "./ParceriasView";
